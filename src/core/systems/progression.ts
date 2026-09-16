// M3+M4: прокачка (левел-ап, обучение, карьеры), продавец (бустеры/Dead Bull/Manual),
// реклама, контракты, своя консоль, переезд офиса.
import { CONFIG } from '../config';
import {
  ADS, BOOSTER_PRICES, CONTRACTS, GENRES, TRAININGS, TYPES,
} from '../data/db';
import { log } from '../log';
import type { CareerId } from '../data/schema';
import { CAREER_LABELS } from '../../shared/careers';
import { OWN_CONSOLE_TYPES, OWN_CONSOLE_CPUS, OWN_CONSOLE_MEDIA, ownConsoleDays } from '../../shared/consoles';
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
  const price = CONFIG.LEVEL_PR[career]?.[lv - 1];
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
  log(state, `⬆ ${s.name}: ${career} → Lv${newLv} (−${price} PR, зарплата ×1.2)`);

  // что открылось этим уровнем: жанры и типы под профессию (уровень достиг только что)
  const opened: string[] = [];
  for (const g of GENRES) {
    if (g.unlockJob === career && g.unlockLevel === newLv) opened.push(`🎮 жанр «${g.ru ?? g.name}»`);
  }
  for (const t of TYPES) {
    if (t.unlockJob === career && t.unlockLevel === newLv && !(t.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(t.unlockTraining!.toLowerCase())))) {
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
  if (opened.length) lines.push('', 'Открыто:', ...opened.map((o) => `• ${o}`));
  const popup: PopupInfo = {
    title: 'Повышение уровня',
    text: `⬆ ${s.name}\n${lines.join('\n')}`,
  };
  return { ok: true, popup };
}

// ─── обучение ───
export function trainStaff(state: GameState, staffId: string, trainingId: number, rng: Rng): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const t = TRAININGS.find((x) => x.id === trainingId);
  if (!t) return { ok: false, error: 'Нет такого тренинга' };
  if (state.officeLevel < (t.office ?? 1)) return { ok: false, error: `Нужен офис ${t.office}` };
  const cost = (t.costWan ?? 0) / 10;
  if (state.money < cost) return { ok: false, error: `Нужно ${cost}K` };
  if (s.power < 1) return { ok: false, error: 'Сотрудник вымотался (POWER 0)' };

  state.money -= cost;
  s.power = Math.max(0, s.power - (t.power ?? 0));
  const before: Record<string, number> = { program: s.stats.program, scenario: s.stats.scenario, graphics: s.stats.graphics, sound: s.stats.sound };
  const deltas = { program: t.program ?? 0, scenario: t.scenario ?? 0, graphics: t.graphics ?? 0, sound: t.sound ?? 0 };
  const lines: string[] = [];
  for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
    let d = deltas[k];
    if (d === 0) continue;
    // супер-эффективность: шанс ×3 (research/01 §4)
    const crit = rng.chance(0.08);
    if (crit) d *= 3;
    s.stats[k] = Math.max(0, s.stats[k] + d);
    lines.push(`${STAT_RU[k]}: ${before[k]} → ${s.stats[k]} (+${d})${crit ? ' — супер-эффект ×3!' : ''}`);
  }
  if (!state.unlockedTrainings.includes(t.name)) state.unlockedTrainings.push(t.name);
  const tName = t.nameRu ?? t.name;
  log(state, `🎓 ${s.name}: тренинг «${tName}» (−${cost}K, POWER −${t.power ?? 0})`);
  const popup: PopupInfo = {
    title: 'Результат тренировки',
    text: `🎓 ${s.name} — «${tName}»\n(−${cost}K, POWER −${t.power ?? 0})\n\n${lines.length ? lines.join('\n') : 'Статы не изменились'}`,
  };
  return { ok: true, popup };
}

// ─── смена профессии ───
function careerPrereqsMet(s: Staff, target: CareerId): boolean {
  const req = CONFIG.CAREER_PREREQ[target];
  if (!req) return true; // базовые профессии — свободно
  return Object.entries(req).every(([job, lv]) => (s.careers[job as CareerId] ?? 0) >= lv);
}

export function changeCareer(state: GameState, staffId: string, target: CareerId, viaManual = false): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  if (target === s.activeCareer) return { ok: false, error: 'Уже эта профессия' };
  if (!viaManual && !careerPrereqsMet(s, target)) {
    const req = CONFIG.CAREER_PREREQ[target] ?? {};
    const need = Object.entries(req).map(([j, lv]) => `${j} Lv${lv}`).join(' + ');
    return { ok: false, error: `Требуются уровни: ${need}` };
  }
  const old = s.activeCareer;
  s.activeCareer = target;
  log(state, `🔁 ${s.name}: смена профессии ${old} → ${target}${viaManual ? ' (по руководству)' : ''}`);
  return { ok: true };
}

// ─── продавец (1–31 мая, с года 2); приход ставит время на паузу (как в оригинале) ───
// доступен весь май — чтобы успеть даже на ускорении
export function tickSalesman(state: GameState): void {
  const w = (state.week - 1) % CONFIG.YEAR_LENGTH;
  if (state.year >= 2) {
    if (w === CONFIG.SALESMAN_DAY - 1 && !state.salesmanHere) {
      state.salesmanHere = true;
      state.pendingEvent = { type: 'salesman' };
      log(state, '🛒 Продавец Тыквенных Продуктов в офисе! Загляните в «Найм»');
    }
    if (w === CONFIG.SALESMAN_DAY_END && state.salesmanHere) {
      state.salesmanHere = false;
      if (state.pendingEvent?.type === 'salesman') state.pendingEvent = null; // не оставляем паузу навсегда
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

// Career Change Manual: смена профессии без требований
export function buyCareerManual(state: GameState, staffId: string, target: CareerId): ActionResult {
  if (!state.salesmanHere) return { ok: false, error: 'Продавец ушёл' };
  const price = CONFIG.CAREER_MANUAL_PRICE[state.officeLevel - 1] ?? 550;
  if (state.money < price) return { ok: false, error: `Нужно ${price}K` };
  state.money -= price;
  const res = changeCareer(state, staffId, target, true);
  if (!res.ok) return res;
  log(state, `📘 Руководство по смене профессии (−${price}K)`);
  return { ok: true };
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
    const team = c.staffIds.map((id) => staffOf(state, id)).filter(Boolean) as Staff[];
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
      const reward = (rng.int(data.rewardMin ?? 0, data.rewardMax ?? 0) * 0.1) as number;
      const pr = rng.int(data.prMin ?? 0, data.prMax ?? 0);
      state.money += reward;
      state.research += pr;
      log(state, `✅ Контракт «${c.name}» выполнен: +${Math.round(reward)}K, +${pr} PR`);
    } else if (state.week >= c.deadline) {
      c.done = true;
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
    state.consoles[id] = {
      licensed: true,
      base: 0,
      availableAtWeek: state.week,
      removedAtWeek: null,
    };
    log(state, `🕹 Своя консоль «${oc.name}» готова! База: 0K, растёт с релизами`);
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

