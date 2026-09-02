// Чистые формулы (09_Формулы_и_данные.md). Никакого состояния — только функции.
import { CONFIG, type Mode } from './config';
import type { ComboGrade, Stats } from './types';

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------- 2.1 стоимость проекта (K) ----------
export function genreCostK(costWan: number, level: number): number {
  return costWan * 0.1 * CONFIG.GENRE_LV_COST_MULT(level);
}

export function typeCostK(defaultCost: number, level: number): number {
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
export function distributePoints(
  weekly: number,
  direction: Record<string, number>,
  axisWeights: Record<string, Stats>,
): Stats {
  const out: Stats = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
  const dirTotal = Object.values(direction).reduce((a, b) => a + b, 0) || 1;
  const bonus = weekly * CONFIG.DIRECTION_BONUS;
  for (const [axis, pts] of Object.entries(direction)) {
    const w = axisWeights[axis];
    if (!w) continue;
    const share = (pts / dirTotal) * bonus;
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

// ---------- продажи (09 §5) ----------
// цена за копию в $; units в K (тыс.), revenue в K: units_K × price_$
export function pricePerCopy(consoleMult: number): number {
  return CONFIG.PRICE_BASE * (1 + (consoleMult - 1) * CONFIG.PRICE_MULT_SOFT);
}

export function comboMult(grade: ComboGrade): number {
  return CONFIG.COMBO_MULT[grade];
}

export function popMult(grade: string): number {
  return CONFIG.POP_MULT[grade] ?? 1;
}

export function fanMult(fans: number): number {
  return Math.min(CONFIG.FAN_MULT_CAP, 1 + Math.log10(1 + fans / CONFIG.FAN_MULT_DIV));
}

export function hypeMult(fame: number, hype: number): number {
  return Math.min(CONFIG.HYPE_MULT_CAP, CONFIG.HYPE_MULT_BASE + (fame + hype) / 200);
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
  weeks: { week: number; units: number; revenue: number }[];
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
  const weeks: { week: number; units: number; revenue: number }[] = [];
  let totalRevenue = 0;
  // продажи по ДНЯМ: 168 дней (= 24 недели), дневные доли = недельные / 7
  for (let i = 0; i < CONFIG.SALES_DAYS; i++) {
    const day = input.releaseWeek + i;
    const dayInYear = ((day - 1) % CONFIG.YEAR_LENGTH) + 1;
    const winter = dayInYear >= CONFIG.WINTER_SPIKE_DAY && dayInYear <= CONFIG.WINTER_SPIKE_DAY + 6 ? 2 : 1;
    const curve = CONFIG.SALES_CURVE[Math.floor(i / 7)] ?? 0;
    const units = totalUnits * curve * winter / 7;
    const revenue = units * price;
    totalRevenue += revenue;
    weeks.push({ week: day, units: Math.round(units), revenue: Math.round(revenue) });
  }
  return { weeks, totalUnits: Math.round(totalUnits), totalRevenue: Math.round(totalRevenue) };
}

// ---------- найм: зарплата с уровнями (+20%/уровень после найма) ----------
export function salaryWithLevels(baseSalary: number, levelUps: number): number {
  return baseSalary * Math.pow(1.2, levelUps);
}

// ---------- фанаты ----------
export function fanGain(units: number): number {
  return units * CONFIG.FAN_PER_UNIT;
}
