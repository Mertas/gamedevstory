// Чистые формулы (09_Формулы_и_данные.md). Никакого состояния — только функции.
import { CONFIG, type Mode } from './config';
import type { ComboGrade, Stats } from './types';
import type { Rng } from './rng';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------- 2.1 стоимость проекта (K) ----------
function genreCostK(costWan: number, level: number): number {
  return costWan * 0.1 * CONFIG.GENRE_LV_COST_MULT(level);
}

function typeCostK(defaultCost: number, level: number): number {
  return defaultCost * CONFIG.TYPE_LV_COST_MULT(level);
}

export function projectCost(
  genreCostWan: number,
  genreLevel: number,
  typeLevel: number,
  consoleMult: number,
  mode: Mode,
): number {
  const base = genreCostK(genreCostWan, genreLevel) + typeCostK(CONFIG.TYPE_COST_DEFAULT, typeLevel);
  return base * consoleMult * CONFIG.MODE[mode].cost * CONFIG.DEV_COST_SCALE;
}

/** Разбор стоимости проекта — те же слагаемые/множители, что в projectCost (для показа в мастере). */
export interface ProjectCostBreakdown {
  genreBaseK: number; // база жанра в K (costWan / 10)
  genreLvMult: number; // GENRE_LV_COST_MULT
  genreK: number;
  typeBaseK: number; // TYPE_COST_DEFAULT
  typeLvMult: number; // TYPE_LV_COST_MULT
  typeK: number;
  baseK: number;
  consoleMult: number;
  modeCost: number;
  scale: number;
  total: number;
}

export function projectCostBreakdown(
  genreCostWan: number,
  genreLevel: number,
  typeLevel: number,
  consoleMult: number,
  mode: Mode,
): ProjectCostBreakdown {
  const genreBaseK = genreCostWan * 0.1;
  const genreLvMult = CONFIG.GENRE_LV_COST_MULT(genreLevel);
  const genreK = genreBaseK * genreLvMult;
  const typeBaseK = CONFIG.TYPE_COST_DEFAULT;
  const typeLvMult = CONFIG.TYPE_LV_COST_MULT(typeLevel);
  const typeK = typeBaseK * typeLvMult;
  const baseK = genreK + typeK;
  const modeCost = CONFIG.MODE[mode].cost;
  const scale = CONFIG.DEV_COST_SCALE;
  return { genreBaseK, genreLvMult, genreK, typeBaseK, typeLvMult, typeK, baseK, consoleMult, modeCost, scale, total: baseK * consoleMult * modeCost * scale };
}

// ---------- 2.2 недельный прогресс ----------
// contributors: вклад по ролям (program→program, graphics→graphics, sound→sound)
export function weeklyPoints(
  contributors: { stat: number; power: number }[],
  mode: Mode,
  genreLevel: number,
): number {
  let pts = 0;
  for (const c of contributors) {
    const fatigue = c.power >= 5 ? 1 : c.power >= 2 ? 0.7 : 0.4;
    pts += c.stat * CONFIG.DEV_STAT_FACTOR * fatigue;
  }
  pts *= CONFIG.MODE[mode].speed;
  pts *= CONFIG.GENRE_LV_QUALITY(genreLevel);
  return pts;
}

// распределение недельных очков по атрибутам с учётом осей направления
// (09 §2.3: норму задаёт CONFIG.DIRECTION_NORM — 10 очков дают полный бонус, сумма распределённого усиливает эффект)
export function distributePoints(
  weekly: number,
  direction: Record<string, number>,
  axisWeights: Record<string, Stats>,
): Stats {
  const out: Stats = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
  const bonus = weekly * CONFIG.DIRECTION_BONUS;
  for (const [axis, pts] of Object.entries(direction)) {
    const w = axisWeights[axis];
    if (!w) continue;
    const share = (pts / CONFIG.DIRECTION_NORM) * bonus;
    out.fun += share * w.fun;
    out.creativity += share * w.creativity;
    out.graphics += share * w.graphics;
    out.sound += share * w.sound;
  }
  // базовая часть (без направления) — поровну
  const base = weekly * (1 - CONFIG.DIRECTION_BONUS);
  out.fun += base * 0.4;
  out.creativity += base * 0.3;
  out.graphics += base * 0.15;
  out.sound += base * 0.15;
  return out;
}

// ---------- баги ----------
export function totalBugs(costK: number, mode: Mode, combo: ComboGrade): number {
  const fromCost = costK * CONFIG.BUGS_PER_COST * CONFIG.MODE[mode].bugs;
  const comboBonus = combo === 'F' ? CONFIG.BUGS_F_COMBO : 0;
  return Math.max(0, Math.round(fromCost + comboBonus));
}

export function debugRate(debuggers: { program: number }[]): number {
  return debuggers.reduce((a, d) => a + d.program, 0) * CONFIG.DEBUG_RATE;
}

// ---------- рецензии (09 §4) ----------
export function judgeScore(
  attrs: Stats,
  judgeWeights: readonly { fun: number; creativity: number; graphics: number; sound: number }[],
  bugs: number,
  noise: number,
): { scores: number[]; messages: number[] } {
  const foundBugs = Math.min(3, Math.floor(bugs / 15));
  const scores = judgeWeights.map((w) => {
    const wsum =
      attrs.fun * w.fun +
      attrs.creativity * w.creativity +
      attrs.graphics * w.graphics +
      attrs.sound * w.sound;
    const raw = CONFIG.REVIEW_BASE + wsum / CONFIG.REVIEW_DIV + noise - foundBugs;
    return clamp(Math.round(raw), 3, 10);
  });
  return { scores, messages: scores.map((s) => s) };
}

export function reviewTotal(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0);
}

/**
 * v1.18.0: разброс оценок критиков — каждый независимо ставит «база ±2» (решение босса).
 * Разброс важнее точной суммы: итог крутой игры — обычно меньше 100, а 100/100 выпадает
 * только при удачном совпадении (все десять критиков попали в потолок 10).
 */
export function spreadScores(scores: readonly number[], rng: Rng): number[] {
  return scores.map((s) => clamp(s + rng.int(-2, 2), 3, 10));
}

// ---------- продажи (09 §5) ----------
// цена за копию в $; units в K (тыс.), revenue в K: units_K × price_$
export function pricePerCopy(consoleMult: number): number {
  return CONFIG.PRICE_BASE * (1 + (consoleMult - 1) * CONFIG.PRICE_MULT_SOFT);
}

export function comboMult(grade: ComboGrade): number {
  return CONFIG.COMBO_MULT[grade];
}

function popMult(grade: string): number {
  return CONFIG.POP_MULT[grade] ?? 1;
}

export function fanMult(fans: number): number {
  return Math.min(CONFIG.FAN_MULT_CAP, 1 + Math.log10(1 + fans / CONFIG.FAN_MULT_DIV));
}

export function hypeMult(fame: number, hype: number): number {
  return Math.min(CONFIG.HYPE_MULT_CAP, CONFIG.HYPE_MULT_BASE + (fame + hype) / 200);
}

// ---------- контракты (аудит-51 03-P2-4) ----------
/** Прогноз бригады для окна «Контракты» — те же слагаемые, что в tickContracts (progression):
 *  прогресс/день = Σ статов × CONTRACT_WEEKLY_RATE; считаем от нуля по самой медленной оси.
 *  need = Infinity — у бригады требуемая ось не растёт вовсе (заказ так не закрыть).
 *  Живёт здесь, а не в progression: UI импортирует формулы, и браузерная сборка
 *  не должна тянуть node-модули из core/systems (db.ts → node:module). */
export interface ContractForecast {
  need: number; // недель по самой медленной оси (Infinity — не закрыть)
  perWeek: number; // прирост узкой оси за неделю
  req: number; // требование узкой оси
  bottleneck: 'program' | 'scenario' | 'graphics' | 'sound' | null;
  fits: boolean; // уложатся ли в срок weeks
}

export function contractForecast(
  reqs: { reqProgram?: number | null; reqScenario?: number | null; reqGraphics?: number | null; reqSound?: number | null },
  weeks: number,
  team: Array<{ stats: { program: number; scenario: number; graphics: number; sound: number } }>,
): ContractForecast {
  const axisReq = { program: reqs.reqProgram, scenario: reqs.reqScenario, graphics: reqs.reqGraphics, sound: reqs.reqSound };
  let need = 0;
  let perWeek = 0;
  let req = 0;
  let bottleneck: ContractForecast['bottleneck'] = null;
  for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
    const r = axisReq[k] ?? 0;
    if (!r) continue;
    const pw = team.reduce((a, s) => a + s.stats[k], 0) * CONFIG.CONTRACT_WEEKLY_RATE * 7;
    if (pw <= 0) return { need: Infinity, perWeek: 0, req: r, bottleneck: k, fits: false };
    const w = r / pw;
    if (w > need) { need = w; perWeek = pw; req = r; bottleneck = k; }
  }
  return { need, perWeek, req, bottleneck, fits: need <= weeks + 1e-9 };
}

/** PLAN-32: easeOutCubic — база распределения: пик в начале, плавный спад, ранние недели различимы. */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Детерминированный шум 0..1 по паре чисел: стабилен для релиза, разный у разных релизов. */
function mix01(a: number, b: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** База: недельные доли (сумма = 1) от обратного easeOutCubic — без разброса и праздников. */
export function baseWeekShares(): number[] {
  // M6: недели считаем на момент вызова — CONFIG меняют уровни сложности, кэш на импорте недопустим
  const weekCount = Math.ceil(CONFIG.SALES_DAYS / 7);
  const picks = Array.from({ length: CONFIG.SALES_DAYS }, (_, i) => 1 - easeOutCubic((i + 0.5) / CONFIG.SALES_DAYS));
  const sum = picks.reduce((a, b) => a + b, 0);
  const weeks = Array.from({ length: weekCount }, () => 0);
  picks.forEach((v, i) => {
    const w = Math.floor(i / 7);
    weeks[w] = (weeks[w] ?? 0) + v / sum;
  });
  return weeks;
}

/** PLAN-32: недельный множитель — праздничная неделя ×1.5–2, остальные гуляют ±15%. */
export function weekFactor(releaseWeek: number, w: number): { high: boolean; factor: number } {
  let high = false;
  for (let i = 7 * w; i < 7 * w + 7; i++) {
    const doy = ((releaseWeek + i - 1) % CONFIG.YEAR_LENGTH) + 1;
    if (CONFIG.HOLIDAY_DOY.includes(doy)) high = true;
    for (const [a, b] of CONFIG.HOLIDAY_RANGES) if (doy >= a && doy <= b) high = true;
  }
  const noise = mix01(releaseWeek, w * 131 + (high ? 7 : 3));
  const factor = high
    ? CONFIG.HOLIDAY_MULT_MIN + (CONFIG.HOLIDAY_MULT_MAX - CONFIG.HOLIDAY_MULT_MIN) * noise
    : 1 - CONFIG.WEEK_WOBBLE + 2 * CONFIG.WEEK_WOBBLE * noise;
  return { high, factor };
}

/** Веса дней релиза: база × недельные множители. Разброс нормирован (база в сумме = 1),
 *  праздничные недели дают надбавку СВЕРХ нормы. Экспорт — для карточки игры в архиве
 *  (восстановление кривой продаж по релизу). */
export function dayWeights(releaseWeek: number): number[] {
  // M6: недели считаем на момент вызова (CONFIG меняется уровнями сложности; кэш на импорте недопустим)
  const weekCount = Math.ceil(CONFIG.SALES_DAYS / 7);
  const base = Array.from({ length: CONFIG.SALES_DAYS }, (_, i) => 1 - easeOutCubic((i + 0.5) / CONFIG.SALES_DAYS));
  const wkRaw = Array.from({ length: weekCount }, () => 0);
  base.forEach((v, i) => {
    const w = Math.floor(i / 7);
    wkRaw[w] = (wkRaw[w] ?? 0) + v;
  });
  const factors = Array.from({ length: weekCount }, (_, w) => weekFactor(releaseWeek, w));
  let norm = 0;
  factors.forEach((f, w) => {
    norm += (wkRaw[w] ?? 0) * (f.high ? 1 : f.factor);
  });
  const k = norm > 0 ? 1 / norm : 1;
  return base.map((v, i) => v * (factors[Math.floor(i / 7)]?.factor ?? 1) * k);
}

export interface SalesPlanInput {
  installBase: number; // тыс.
  score: number;
  combo: ComboGrade;
  pop: string;
  fans: number;
  fame: number;
  hype: number;
  sequel: boolean;
  consoleMult: number;
  releaseWeek: number; // глобальная неделя релиза
}

export interface SalesPlan {
  weeks: { week: number; units: number; revenue: number; unitsF?: number }[];
  totalUnits: number;
  totalRevenue: number;
}

// кривая жизни: 24 недели, пик M12W1 (×2)
export function salesPlan(input: SalesPlanInput): SalesPlan {
  const scoreMult = 1 + (input.score - 20) / 20;
  const share =
    Math.max(0.1, scoreMult) *
    comboMult(input.combo) *
    popMult(input.pop) *
    fanMult(input.fans) *
    hypeMult(input.fame, input.hype) *
    (input.sequel ? CONFIG.SEQUEL_MULT : 1);
  const totalUnits = input.installBase * CONFIG.SALES_BASE_RATE * share;
  const price = pricePerCopy(input.consoleMult);
  const weeks: { week: number; units: number; revenue: number; unitsF: number }[] = [];
  let totalRevenue = 0;
  // PLAN-32: доли дней — база (обратный easeOutCubic) + разброс недель ±15% + праздничные ×1.5–2
  const weights = dayWeights(input.releaseWeek);
  // продажи по ДНЯМ: 168 дней (= 24 недели)
  for (let i = 0; i < CONFIG.SALES_DAYS; i++) {
    const day = input.releaseWeek + i;
    const units = totalUnits * (weights[i] ?? 0);
    const revenue = units * price;
    totalRevenue += revenue;
    // PLAN-29: units — целые (историческое поле), unitsF — дробь: у мелких игр продажи < 1 копии в день,
    // и по округлённым нулям график/копилка копий были бы пустыми
    weeks.push({ week: day, units: Math.round(units), revenue: Math.round(revenue), unitsF: Math.round(units * 100) / 100 });
  }
  return { weeks, totalUnits: Math.round(totalUnits), totalRevenue: Math.round(totalRevenue) };
}

// ---------- найм: зарплата с уровнями (+20%/уровень после найма) ----------
export function salaryWithLevels(baseSalary: number, levelUps: number): number {
  return baseSalary * Math.pow(1.2, levelUps);
}

