// M3+M4: прокачка (левел-ап, обучение, карьеры), продавец (бустеры/Dead Bull/Manual),
// реклама, контракты, своя консоль, переезд офиса.
import { CONFIG } from '../config';
import {
  ADS, BOOSTER_PRICES, CONTRACTS, GENRES, TRAININGS, TYPES,
} from '../data/db';
import { log } from '../log';
import { TRAINING_IDS, type CareerId } from '../data/schema';
import { CAREER_LABELS } from '../../shared/careers';
import { busyStaffIds, pushHistory } from './staff';
import { capGain, careerChangePreview, effTrainDelta, STAT_KEYS, STAT_SHORT, type StatKey } from '../../shared/train';
import { hasTraining } from '../../shared/rules';
import { OWN_CONSOLE_TYPES, OWN_CONSOLE_CPUS, OWN_CONSOLE_MEDIA, ownConsoleDays, ownConsoleStartBase } from '../../shared/consoles';
import type { Rng } from '../rng';
import type {
  ActionResult, GameState, OwnConsoleState, PopupInfo, Staff,
} from '../types';
const STAT_RU = { program: 'Программирование', scenario: 'Сценарий', graphics: 'Графика', sound: 'Звук' } as const;

function staffOf(state: GameState, staffId: string): Staff | undefined {
  return state.staff.find((s) => s.id === staffId);
}

// ─── левел-ап ───
export function levelUpStaff(state: GameState, staffId: string, _rng: Rng): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const career = s.activeCareer;
  const lv = s.careers[career] ?? 0;
  if (lv >= 5) return { ok: false, error: 'Максимальный уровень' };
  const price = CONFIG.LEVEL_PR[career]?.[Math.max(0, lv - 1)];
  if (!price) return { ok: false, error: 'Нет данных о цене' };
  if (state.research < price) return { ok: false, error: `Нужно ${price} PR (есть ${Math.round(state.research)})` };

  state.research -= price;
  const newLv = lv + 1;
  const statBefore: Record<string, number> = { program: s.stats.program, scenario: s.stats.scenario, graphics: s.stats.graphics, sound: s.stats.sound };
  s.careers[career] = newLv;
  s.levelUps += 1;
  const gain = CONFIG.LEVEL_STATS[career]?.[lv - 1];
  if (gain) {
    s.stats.program += gain.p;
    s.stats.scenario += gain.s;
    s.stats.graphics += gain.g;
    s.stats.sound += gain.so;
  }
  // PLAN-41: пороги растут от профессии; у ЗАЛИТОГО до порога стата прирост ×CAP_MAX_BONUS
  const capRows: string[] = [];
  const weights = CONFIG.CAP_GROW[career] ?? {};
  let capJump = 0;
  let maxedCount = 0;
  for (const k of STAT_KEYS) {
    const maxed = (statBefore[k] ?? 0) >= (s.caps[k] ?? 0);
    if (maxed) maxedCount += 1;
    const g = capGain(weights[k] ?? 0, 1, maxed);
    if (g > 0) {
      const was = s.caps[k] ?? 0;
      s.caps[k] = was + g;
      capJump += g;
      capRows.push(`${STAT_RU[k]}: ${was} → ${was + g} (+${g}${maxed ? ' — залит, ×10!' : ''})`);
    }
  }
  // статы не могут превысить новые пороги
  for (const k of STAT_KEYS) s.stats[k] = Math.min(s.stats[k] ?? 0, s.caps[k] ?? 0);
  log(state, `⬆ ${s.name}: ${career} → Lv${newLv} (−${price} PR, зарплата ×1.2, пороги +${capJump}${maxedCount > 0 ? `, залито ${maxedCount}/4 — ×10` : ''})`);

  // что открылось этим уровнем: жанры и типы под профессию (уровень достиг только что)
  const opened: string[] = [];
  for (const g of GENRES) {
    if (g.unlockJob === career && g.unlockLevel === newLv) opened.push(`🎮 жанр «${g.ru ?? g.name}»`);
  }
  for (const t of TYPES) {
    if (t.unlockJob === career && t.unlockLevel === newLv && (!t.unlockTraining || hasTraining(state.unlockedTrainings, t.unlockTraining))) {
      opened.push(`📦 тип «${t.nameRu ?? t.name}»`);
    }
  }
  const lines: string[] = [`${CAREER_LABELS[career] ?? career}: Lv${lv} → Lv${newLv}`];
  if (gain) {
    for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
      const d = { p: gain.p, s: gain.s, g: gain.g, so: gain.so };
      const key = k === 'program' ? 'p' : k === 'scenario' ? 's' : k === 'graphics' ? 'g' : 'so';
      const dv = d[key];
      if (dv > 0) lines.push(`${STAT_RU[k]}: ${statBefore[k]} → ${s.stats[k]} (+${dv})`);
    }
  }
  if (capRows.length) lines.push('', 'Пороги статов:', ...capRows);
  if (opened.length) lines.push('', 'Открыто:', ...opened.map((o) => `• ${o}`));
  const popup: PopupInfo = {
    title: 'Повышение уровня',
    text: `⬆ ${s.name}\n${lines.join('\n')}`,
  };
  pushHistory(s, state.week, 'levelup', `⬆ ${CAREER_LABELS[career] ?? career}: Lv${lv} → Lv${newLv}, пороги +${capJump}${maxedCount > 0 ? ` (залито ${maxedCount}/4 — ×10)` : ''}`);
  return { ok: true, popup };
}

// ─── обучение ───
// PLAN-41: прирост тренировки масштабируется от порога стата (×floor(порог/100), мин ×1),
// обучение не может превысить порог; супер-эффект ×3 (может усилить и минус). Учтено в счётчике.
function applyTraining(state: GameState, s: Staff, t: (typeof TRAININGS)[number], rng: Rng): { lines: string[]; applied: Record<string, number>; crits: number } {
  const before: Record<string, number> = { program: s.stats.program, scenario: s.stats.scenario, graphics: s.stats.graphics, sound: s.stats.sound };
  const deltas = { program: t.program ?? 0, scenario: t.scenario ?? 0, graphics: t.graphics ?? 0, sound: t.sound ?? 0 };
  const lines: string[] = [];
  const applied: Record<string, number> = { program: 0, scenario: 0, graphics: 0, sound: 0 };
  let crits = 0;
  for (const k of STAT_KEYS) {
    let d = effTrainDelta(deltas[k], s.caps[k] ?? 0);
    if (d === 0) continue;
    const crit = rng.chance(0.08);
    if (crit) { d *= 3; crits += 1; }
    const val = Math.max(0, Math.min(s.caps[k] ?? 0, (s.stats[k] ?? 0) + d));
    s.stats[k] = val;
    applied[k] = val - (before[k] ?? 0);
    if (val === before[k]) lines.push(`${STAT_RU[k]}: ${before[k]} (на пороге ${s.caps[k]})`);
    else lines.push(`${STAT_RU[k]}: ${before[k]} → ${val} (${val - (before[k] ?? 0) > 0 ? '+' : ''}${val - (before[k] ?? 0)})${crit ? ' — супер-эффект ×3!' : ''}`);
  }
  // P1-9 аудита-51: пишем канонический id (trainings.id = порядок TRAINING_IDS), а не имя из БД;
  // записи-имена старых сейвов продолжают работать через hasTraining
  const canon = TRAINING_IDS[t.id - 1];
  if (canon && !state.unlockedTrainings.includes(canon)) state.unlockedTrainings.push(canon);
  // PLAN-41: агрегат по методам (для истории/сводки в окне сотрудника)
  const agg = (s.trainCount ??= {})[String(t.id)] ??= { n: 0, gains: { program: 0, scenario: 0, graphics: 0, sound: 0 } };
  agg.n += 1;
  for (const k of STAT_KEYS) agg.gains[k] = (agg.gains[k] ?? 0) + (applied[k] ?? 0);
  return { lines, applied, crits };
}

export function trainStaff(state: GameState, staffId: string, trainingId: number, rng: Rng): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const t = TRAININGS.find((x) => x.id === trainingId);
  if (!t) return { ok: false, error: 'Нет такого тренинга' };
  if ((s.restDays ?? 0) > 0) return { ok: false, error: `${s.name} в отпуске (${s.restDays} дн.)` };
  if (state.officeLevel < (t.office ?? 1)) return { ok: false, error: `Нужен офис ${t.office}` };
  const cost = (t.costWan ?? 0) / 10;
  if (state.money < cost) return { ok: false, error: `Нужно ${cost}K` };
  if (s.power < 1) return { ok: false, error: `${s.name} без сил (POWER 0)` };

  state.money -= cost;
  s.power = Math.max(0, s.power - (t.power ?? 0));
  const res = applyTraining(state, s, t, rng);
  const tName = t.nameRu ?? t.name;
  log(state, `🎓 ${s.name}: тренинг «${tName}» (−${cost}K, POWER −${t.power ?? 0})`);
  const gained = STAT_KEYS.filter((k) => (res.applied[k] ?? 0) > 0).map((k) => `${STAT_SHORT[k]} +${res.applied[k]}`).join(' ');
  pushHistory(s, state.week, 'train', `🎓 «${tName}»${gained ? `: ${gained}` : ''}${res.crits ? ' — ×3!' : ''}`);
  const popup: PopupInfo = {
    title: 'Результат тренировки',
    text: `🎓 ${s.name} — «${tName}»\n(−${cost}K, POWER −${t.power ?? 0})\n\n${res.lines.length ? res.lines.join('\n') : 'Статы не изменились'}`,
  };
  return { ok: true, popup };
}

/** PLAN-41: «Тренировать до максимума» — сама крутит доступные методы, пока статы не упрутся
 *  в пороги или не кончатся POWER/деньги. Один сводный попап и одна запись в историю. */
export function trainToMax(state: GameState, staffId: string, rng: Rng): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  if ((s.restDays ?? 0) > 0) return { ok: false, error: `${s.name} в отпуске (${s.restDays} дн.)` };
  const base = (t: (typeof TRAININGS)[number], k: StatKey): number =>
    (k === 'program' ? t.program : k === 'scenario' ? t.scenario : k === 'graphics' ? t.graphics : t.sound) ?? 0;
  const pool = TRAININGS.filter((t) => state.officeLevel >= (t.office ?? 1));
  const total: Record<string, number> = { program: 0, scenario: 0, graphics: 0, sound: 0 };
  let sessions = 0;
  let spent = 0;
  let powerSpent = 0;
  let crits = 0;
  outer: for (let iter = 0; iter < 60; iter++) {
    for (const t of pool) {
      if (s.power < 1 || s.power < (t.power ?? 0)) continue;
      const cost = (t.costWan ?? 0) / 10;
      if (state.money < cost) continue;
      const worth = STAT_KEYS.some((k) => effTrainDelta(base(t, k), s.caps[k] ?? 0) > 0 && (s.stats[k] ?? 0) < (s.caps[k] ?? 0));
      if (!worth) continue;
      state.money -= cost;
      s.power = Math.max(0, s.power - (t.power ?? 0));
      const r = applyTraining(state, s, t, rng);
      sessions += 1;
      spent += cost;
      powerSpent += t.power ?? 0;
      crits += r.crits;
      for (const k of STAT_KEYS) total[k] = (total[k] ?? 0) + (r.applied[k] ?? 0);
      if (s.power <= 0) break outer; // выдохся — стоп (как ручное обучение, не доводим до «ушёл домой»)
      continue outer;
    }
    break; // ни один метод больше не работает — всё на порогах / нет денег
  }
  if (sessions === 0) {
    return { ok: false, error: 'Нечего тренировать: статы на порогах (или не хватает POWER/денег)' };
  }
  const gainedTxt = STAT_KEYS.filter((k) => (total[k] ?? 0) > 0).map((k) => `${STAT_SHORT[k]} +${total[k]}`).join(', ');
  const atCap = STAT_KEYS.every((k) => (s.stats[k] ?? 0) >= (s.caps[k] ?? 0));
  log(state, `⚡ ${s.name}: автотренировка ×${sessions} (−${Math.round(spent)}K, POWER −${powerSpent})${gainedTxt ? ` — ${gainedTxt}` : ''}${crits ? ` (×3 ×${crits})` : ''}`);
  pushHistory(s, state.week, 'train', `⚡ Автотренировка ×${sessions}${gainedTxt ? `: ${gainedTxt}` : ''}${crits ? ' — ×3!' : ''}`);
  const capsTxt = STAT_KEYS.map((k) => `${STAT_SHORT[k]} ${s.stats[k]}/${s.caps[k]}`).join(' · ');
  const popup: PopupInfo = {
    title: 'Автотренировка',
    text: `⚡ ${s.name}: ${sessions} занятий (−${Math.round(spent)}K, POWER −${powerSpent})\n${gainedTxt || 'прироста нет'}\n${capsTxt}${atCap ? '\n🎯 Все статы на порогах! Пора на левелап.' : ''}`,
  };
  return { ok: true, popup };
}

// ─── смена профессии ───
/** чего не хватает для смены профессии (пустой список = требования выполнены) */
export function careerPrereqMissing(s: Staff, target: CareerId): string[] {
  const req = CONFIG.CAREER_PREREQ[target] ?? {};
  return Object.entries(req)
    .filter(([job, lv]) => (s.careers[job as CareerId] ?? 0) < lv)
    .map(([job, lv]) => `${CAREER_LABELS[job] ?? job} Lv${lv} (у вас Lv${s.careers[job as CareerId] ?? 0})`);
}

/** механика перехода: бонусы первого входа + переключение профессии. Вызывается ТОЛЬКО из
 *  applyCareerManual — свободной смены профессии в игре нет (требования проверяет он же). */
export function changeCareer(state: GameState, staffId: string, target: CareerId): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  if (target === s.activeCareer) return { ok: false, error: 'Уже эта профессия' };
  const old = s.activeCareer;
  s.activeCareer = target;
  // PLAN-41: бонусы смены — только при ПЕРВОМ входе в профессию (fresh): статы тянутся к её
  // профилю (что-то растёт, что-то слабеет), пороги подрастают (веса ×CAP_CHANGE_MULT; ×10 если
  // стат был залит). Возврат в уже освоенную профессию — просто переключение (иначе бесконечная
  // «ферма» бонусов туда-обратно). Новичок в профессии начинает с Lv1 — чтобы её сразу можно было качать.
  const preview = careerChangePreview(s.stats, s.caps, s.careers, target);
  const fresh = preview.fresh;
  if (fresh) s.careers[target] = 1;
  const shiftTxt: string[] = [];
  const capTxt: string[] = [];
  const maxedCount = preview.maxedCount;
  if (fresh) {
    for (const k of STAT_KEYS) {
      const st = preview.stats[k];
      if (st.to !== st.from) {
        s.stats[k] = st.to;
        shiftTxt.push(`${STAT_SHORT[k]} ${st.to > st.from ? '+' : ''}${st.to - st.from}`);
      }
    }
    for (const k of STAT_KEYS) {
      const cp = preview.caps[k];
      if (cp.gain > 0) {
        s.caps[k] = (s.caps[k] ?? 0) + cp.gain;
        capTxt.push(`${STAT_SHORT[k]} +${cp.gain}${cp.maxed ? ' ×10' : ''}`);
      }
    }
    for (const k of STAT_KEYS) s.stats[k] = Math.min(s.stats[k] ?? 0, s.caps[k] ?? 0); // статы не выше порогов
  }
  log(state, `🔁 ${s.name}: смена профессии ${old} → ${target} (по руководству)${fresh && shiftTxt.length ? ` (статы: ${shiftTxt.join(', ')}; пороги: ${capTxt.join(', ')})` : ''}`);
  pushHistory(s, state.week, 'career', `🔁 ${CAREER_LABELS[old] ?? old} → ${CAREER_LABELS[target] ?? target}${fresh ? '' : ' (профессия знакома)'}${fresh && shiftTxt.length ? `; статы: ${shiftTxt.join(', ')}` : ''}${fresh && capTxt.length ? `; пороги: ${capTxt.join(', ')}` : ''}`);
  const lines: string[] = [`🔁 ${CAREER_LABELS[old] ?? old} → ${CAREER_LABELS[target] ?? target}`];
  if (!fresh) {
    lines.push('Профессия знакома — пороги без бонуса (бонус даётся при первом входе в профессию)');
  } else {
    if (shiftTxt.length) lines.push(`Статы: ${shiftTxt.join(', ')}`);
    if (capTxt.length) lines.push(`Пороги: ${capTxt.join(', ')}`);
    lines.push(maxedCount === 4 ? '🎯 Было залито по максимуму — пороги выросли ×10!' : `Залито ${maxedCount}/4 статов — залей все до порогов перед сменой: рост порогов ×10`);
  }
  const popup: PopupInfo = { title: 'Смена профессии', text: `🔁 ${s.name}\n${lines.join('\n')}` };
  return { ok: true, popup };
}

// ─── продавец (1–31 мая, с года 2) ───
// v1.43: приход БЕЗ паузы-попапа — игра идёт своим ходом, клиент показывает тост-заметку
// (store.trackSalesman); доступен весь май — чтобы успеть даже на ускорении
export function tickSalesman(state: GameState): void {
  const w = (state.week - 1) % CONFIG.YEAR_LENGTH;
  if (state.year >= 2) {
    if (w === CONFIG.SALESMAN_DAY - 1 && !state.salesmanHere) {
      state.salesmanHere = true;
      log(state, '🛒 Продавец Тыквенных Продуктов в офисе! Загляните в «Найм»');
    }
    if (w === CONFIG.SALESMAN_DAY_END && state.salesmanHere) {
      state.salesmanHere = false;
      log(state, '🛒 Продавец ушёл. До следующего мая');
    }
  }
}

export function dismissSalesman(state: GameState): void {
  if (state.pendingEvent?.type === 'salesman') state.pendingEvent = null;
}

// AP-06: цену бустера спрашивает и политика автопилота (policy.ts) — не только продавец
export function boosterPrice(state: GameState, type: string): number | null {
  const n = state.boosterPurchases[type] ?? 0;
  const row = BOOSTER_PRICES.find((b) => b.office === state.officeLevel && b.purchaseNo === n + 1);
  return row?.price ?? null;
}

// купить бустер (использование — applyBooster)
export function buyBooster(state: GameState, type: string): ActionResult {
  if (!state.salesmanHere) return { ok: false, error: 'Продавец ушёл' };
  if (!(CONFIG.BOOSTER_TYPES as readonly string[]).includes(type)) return { ok: false, error: 'Неизвестный бустер' };
  const price = boosterPrice(state, type);
  if (price === null) return { ok: false, error: 'Продавец больше ничего не продаёт' };
  if (state.money < price) return { ok: false, error: `Нужно ${price}K` };
  state.money -= price;
  state.boosterPurchases[type] = (state.boosterPurchases[type] ?? 0) + 1;
  // аудит-51: покупка даёт заряд применения (расходник); счётчик покупок остаётся для роста цен
  state.boosterCharges[type] = (state.boosterCharges[type] ?? 0) + 1;
  log(state, `🧪 Куплен бустер ${type} за ${price}K`);
  return { ok: true };
}

// применить бустер к текущей разработке (очки атрибута игры)
const BOOSTER_ATTR: Record<string, 'fun' | 'creativity' | 'graphics' | 'sound'> = {
  fun: 'fun', creativity: 'creativity', graphics: 'graphics', sound: 'sound',
};
// AP-06: профильные профессии бустеров — экспорт для политики (выбор цели применения)
export const BOOSTER_KEY_JOB: Record<string, CareerId> = {
  fun: 'coder', creativity: 'writer', graphics: 'designer', sound: 'sound',
};

export function applyBooster(state: GameState, staffId: string, type: string, rng: Rng): ActionResult {
  const g = state.activeGame;
  if (!g || g.phase === 'released') return { ok: false, error: 'Нет активной разработки' };
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const attr = BOOSTER_ATTR[type];
  if (!attr) return { ok: false, error: 'Неизвестный бустер' };
  // P1 аудита-51: применяется только купленный заряд (один клик — один заряд); счётчик покупок
  // boosterPurchases остаётся «куплено всего» для кривой цен и не трогается
  const charge = state.boosterCharges[type] ?? 0;
  if (charge <= 0) return { ok: false, error: 'Нет купленного бустера этого типа' };
  state.boosterCharges[type] = charge - 1;
  const uses = s.boosterUses[type] ?? 0;
  // ключевая профессия бустера даёт больше очков (research/02 §11);
  // раньше keyJob вычислялся, но не использовался — все получали «ключевые» 18–22
  const keyJob = s.activeCareer === BOOSTER_KEY_JOB[type];
  let gain: number;
  if (uses === 0) {
    gain = keyJob
      ? rng.int(CONFIG.BOOSTER_KEY_GAIN[0]!, CONFIG.BOOSTER_KEY_GAIN[1]!)
      : rng.int(CONFIG.BOOSTER_OTHER_GAIN[0]!, CONFIG.BOOSTER_OTHER_GAIN[1]!);
  } else if (uses === 1) {
    gain = keyJob
      ? rng.int(CONFIG.BOOSTER_KEY_GAIN_2[0]!, CONFIG.BOOSTER_KEY_GAIN_2[1]!)
      : rng.int(CONFIG.BOOSTER_OTHER_GAIN_2[0]!, CONFIG.BOOSTER_OTHER_GAIN_2[1]!);
  } else gain = 0;
  s.boosterUses[type] = uses + 1;
  if (gain > 0) {
    g.points[attr] += gain;
    g.hype += 2;
    log(state, `🧪 ${s.name} применил бустер ${type}: +${gain} ${attr}${keyJob ? '' : ' (профессия не профильная — эффект ниже)'}`);
  } else {
    log(state, `🧪 Бустер ${type} больше не работает (${s.name})`);
  }
  return { ok: true };
}

// Dead Bull: восстановить POWER + PR
export function buyDeadBull(state: GameState, staffId: string): ActionResult {
  if (!state.salesmanHere) return { ok: false, error: 'Продавец ушёл' };
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const price = CONFIG.DEAD_BULL_PRICE[state.officeLevel - 1] ?? 550;
  if (state.money < price) return { ok: false, error: `Нужно ${price}K` };
  state.money -= price;
  s.power = s.maxPower;
  state.research += CONFIG.DEAD_BULL_RESEARCH;
  log(state, `🥤 ${s.name}: Dead Bull (+POWER, +${CONFIG.DEAD_BULL_RESEARCH} PR)`);
  return { ok: true };
}

// Career Change Manual: покупка В ЗАПАС (применяется в «Найм» → «Профессии»)
export function buyCareerManual(state: GameState): ActionResult {
  if (!state.salesmanHere) return { ok: false, error: 'Продавец ушёл' };
  const price = CONFIG.CAREER_MANUAL_PRICE[state.officeLevel - 1] ?? 550;
  if (state.money < price) return { ok: false, error: `Нужно ${price}K` };
  state.money -= price;
  state.careerManuals = (state.careerManuals ?? 0) + 1;
  log(state, `📘 Куплено руководство по смене профессии (−${price}K, в запасе: ${state.careerManuals})`);
  return { ok: true };
}

// применить руководство из запаса: смена профессии. Требования ОБЯЗАТЕЛЬНЫ (руководство их
// не снимает); запас −1 только при успехе; неудача — руководство не тратится.
export function applyCareerManual(state: GameState, staffId: string, target: CareerId): ActionResult {
  if ((state.careerManuals ?? 0) <= 0) return { ok: false, error: 'Нет руководства в запасе — продавец приходит в мае' };
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const missing = careerPrereqMissing(s, target);
  if (missing.length > 0) return { ok: false, error: `Не хватает: ${missing.join(', ')}` };
  const res = changeCareer(state, staffId, target);
  if (!res.ok) return res;
  state.careerManuals -= 1;
  log(state, `📘 Применено руководство: осталось ${state.careerManuals}`);
  return res;
}

// ─── M4: реклама ───
// Фанаты растут с убыванием до потолка типа (plan/09): прирост = (кап − накоплено) × 0.15 + 50;
// исчерпанный тип отклоняется (иначе молчаливая пустая трата — «не работает»).
export function buyAd(state: GameState, adId: number): ActionResult {
  const ad = ADS.find((a) => a.id === adId);
  if (!ad) return { ok: false, error: 'Нет такой рекламы' };
  if (state.officeLevel < (ad.office ?? 1)) return { ok: false, error: `Нужен офис ${ad.office}` };
  const cost = (ad.costWan ?? 0) / 10;
  if (state.money < cost) return { ok: false, error: `Нужно ${cost}K` };
  const cap = CONFIG.AD_FAN_CAPS[adId] ?? 0;
  if (cap <= 0) return { ok: false, error: 'У этого вида рекламы нет данных (потолок фанатов)' };
  const acc = state.adFansGained[adId] ?? 0;
  if (acc >= cap) return { ok: false, error: 'Фанаты больше не растут — этот способ исчерпан, нужен другой' };
  state.money -= cost;
  const gain = Math.min(Math.round((cap - acc) * CONFIG.AD_FAN_GROWTH + CONFIG.AD_FAN_MIN), cap - acc);
  state.fans += gain;
  state.adFansGained[adId] = acc + gain;
  // реклама поднимает ИЗВЕСТНОСТЬ текущей разработки (research/02 §12: fame ↑ via ads;
  // fame + hype вместе дают множитель продаж при релизе)
  if (state.activeGame && state.activeGame.phase !== 'released') {
    state.activeGame.fame += CONFIG.AD_FAME_GAIN;
  }
  log(state, `📣 «${ad.nameRu ?? ad.name}» (−${Math.round(cost)}K): +${gain} фанатов`);
  return { ok: true };
}

// ─── M4: контракты ───
export function takeContract(state: GameState, contractId: number, staffIds: string[], _rng: Rng): ActionResult {
  const c = CONTRACTS.find((x) => x.id === contractId);
  if (!c) return { ok: false, error: 'Нет такого контракта' };
  if (state.officeLevel < (c.office ?? 1)) return { ok: false, error: `Нужен офис ${c.office}` };
  if (state.contracts.some((x) => x.id === contractId && !x.done)) return { ok: false, error: 'Контракт уже взят' };
  // M9: занятость — человек на контракте не может взяться за второй и не работает над проектом
  const busy = busyStaffIds(state);
  if (staffIds.some((id) => busy.has(id))) return { ok: false, error: 'Есть сотрудник, занятый на другом контракте' };
  // M9: повтор — только после кулдауна (сдал/провалил → ждём CONTRACT_COOLDOWN_WEEKS)
  const lastDone = state.contracts
    .filter((x) => x.id === contractId && x.done)
    .reduce((m, x) => Math.max(m, x.finishedWeek ?? -99999), -99999);
  const cdDays = CONFIG.CONTRACT_COOLDOWN_WEEKS * 7;
  if (state.week - lastDone < cdDays) {
    return { ok: false, error: `Повторно этот заказ — через ${Math.ceil((cdDays - (state.week - lastDone)) / 7)} нед.` };
  }
  if (staffIds.length === 0 || staffIds.length > CONFIG.CONTRACT_MAX_STAFF) {
    return { ok: false, error: `Назначьте 1–${CONFIG.CONTRACT_MAX_STAFF} сотрудников` };
  }
  const valid = staffIds.every((id) => state.staff.some((s) => s.id === id));
  if (!valid) return { ok: false, error: 'Неверный сотрудник' };
  state.contracts.push({
    id: contractId,
    name: c.name,
    staffIds,
    deadline: state.week + (c.weeks ?? 10) * 7, // срок в днях
    progress: { program: 0, scenario: 0, graphics: 0, sound: 0 },
    done: false,
  });
  log(state, `📝 Взят контракт «${c.name}» (срок ${c.weeks} нед.)`);
  return { ok: true };
}

export function tickContracts(state: GameState, rng: Rng): void {
  for (const c of state.contracts) {
    if (c.done) continue;
    // аудит-51 01-P2-6: отпуск/дом не работают над контрактом (как и над проектом в devTick)
    const team = c.staffIds
      .map((id) => staffOf(state, id))
      .filter((s): s is Staff => !!s && s.homeWeeks === 0 && (s.restDays ?? 0) === 0);
    const sum = (k: 'program' | 'scenario' | 'graphics' | 'sound') => team.reduce((a, s) => a + s.stats[k], 0);
    c.progress.program += sum('program') * CONFIG.CONTRACT_WEEKLY_RATE;
    c.progress.scenario += sum('scenario') * CONFIG.CONTRACT_WEEKLY_RATE;
    c.progress.graphics += sum('graphics') * CONFIG.CONTRACT_WEEKLY_RATE;
    c.progress.sound += sum('sound') * CONFIG.CONTRACT_WEEKLY_RATE;
    const data = CONTRACTS.find((x) => x.id === c.id);
    if (!data) { c.done = true; continue; }
    const met = (req: number | null, got: number) => (req === null || req === 0) || got >= req;
    if (met(data.reqProgram, c.progress.program)
      && met(data.reqScenario, c.progress.scenario)
      && met(data.reqGraphics, c.progress.graphics)
      && met(data.reqSound, c.progress.sound)) {
      c.done = true;
      c.finishedWeek = state.week; // M9: для кулдауна повтора
      const reward = (rng.int(data.rewardMin ?? 0, data.rewardMax ?? 0) * 0.1) as number;
      const pr = rng.int(data.prMin ?? 0, data.prMax ?? 0);
      state.money += reward;
      state.research += pr;
      log(state, `✅ Контракт «${c.name}» выполнен: +${Math.round(reward)}K, +${pr} PR`);
    } else if (state.week >= c.deadline) {
      c.done = true;
      c.finishedWeek = state.week; // M9: для кулдауна повтора
      log(state, `⏰ Контракт «${c.name}» провален (срок вышел)`);
    }
  }
}

// ─── M4: своя консоль ───
// Компоненты (цены, требования, срок) — в shared/consoles.ts: один источник для движка и формы.

function hwEngineerCount(state: GameState): number {
  return state.staff.filter((s) => s.activeCareer === 'hw').length;
}

export function startOwnConsole(
  state: GameState, name: string,
  type: 'console' | 'portable', cpu: string, media: string,
): ActionResult {
  if (state.officeLevel < 3) return { ok: false, error: 'Своя консоль — только в большом офисе (3)' };
  if (hwEngineerCount(state) < 1) return { ok: false, error: 'Нужен хардвер-инженер' };
  if (state.ownConsole) return { ok: false, error: 'Консоль уже разрабатывается' };
  const cpuData = OWN_CONSOLE_CPUS.find((c) => c.id === cpu);
  const mediaData = OWN_CONSOLE_MEDIA.find((m) => m.id === media);
  const typeData = OWN_CONSOLE_TYPES.find((t) => t.id === type);
  if (!cpuData || !mediaData || !typeData) return { ok: false, error: 'Неверные компоненты' };
  if (hwEngineerCount(state) < cpuData.hw) return { ok: false, error: `Нужно ${cpuData.hw} хардвер-инженеров` };
  if (hwEngineerCount(state) < mediaData.hw) return { ok: false, error: `Нужно ${mediaData.hw} хардвер-инженеров` };
  const cost = typeData.cost + cpuData.cost + mediaData.cost;
  if (state.money < cost) return { ok: false, error: `Нужно ${cost}K` };
  state.money -= cost;
  const cpuIdx = OWN_CONSOLE_CPUS.findIndex((c) => c.id === cpu);
  const mediaIdx = OWN_CONSOLE_MEDIA.findIndex((m) => m.id === media);
  const oc: OwnConsoleState = {
    name: name.trim() || 'Студийная консоль',
    type,
    cpu,
    media,
    cost,
    weeksTotal: ownConsoleDays(cpuIdx, mediaIdx), // в днях
    progress: 0,
  };
  state.ownConsole = oc;
  log(state, `🛠 Начата разработка своей консоли «${oc.name}» (${Math.round(oc.weeksTotal / 7)} нед., ${cost}K)`);
  return { ok: true };
}

export function tickOwnConsole(state: GameState): void {
  const oc = state.ownConsole;
  if (!oc) return;
  oc.progress += 1;
  if (oc.progress >= oc.weeksTotal) {
    state.ownConsole = null;
    const id = `own-${oc.type}`;
    const startBase = ownConsoleStartBase(state.fans); // фанаты студии покупают свою консоль
    state.consoles[id] = {
      licensed: true,
      base: startBase,
      availableAtWeek: state.week,
      removedAtWeek: null,
      name: oc.name,
      cpu: oc.cpu,
      media: oc.media,
    };
    log(state, `🕹 Своя консоль «${oc.name}» готова! База: ${startBase}K (фанаты студии), растёт с релизами`);
  }
}

// ─── переезд офиса ───
function officeUpgradeInfo(state: GameState): { level: number; cost: number; ready: boolean; reason: string } | null {
  if (state.officeLevel >= 3) return null;
  const next = state.officeLevel + 1;
  if (next === 2) {
    const ready = state.year >= 4 && state.money >= 1000 && state.history.length > 0;
    return { level: 2, cost: 600, ready, reason: 'Год 4+, ≥1000K и хотя бы одна выпущенная игра' };
  }
  // офис 3: 7-й год и 3500K на счету (переезд стоит 2500K)
  const ready = state.year >= 7 && state.money >= 3500;
  return { level: 3, cost: 2500, ready, reason: 'Нужны 7-й год и ≥3500K на счету' };
}

export function moveOffice(state: GameState): ActionResult {
  const info = officeUpgradeInfo(state);
  if (!info) return { ok: false, error: 'Уже самый большой офис' };
  if (!info.ready) return { ok: false, error: `Переезд пока недоступен: ${info.reason}` };
  if (state.money < info.cost) return { ok: false, error: `Нужно ${info.cost}K` };
  state.money -= info.cost;
  state.officeLevel = info.level as 2 | 3;
  log(state, `🏢 Переезд в офис ${info.level} (−${info.cost}K, мест: ${info.level === 2 ? 6 : 8})`);
  return { ok: true };
}

