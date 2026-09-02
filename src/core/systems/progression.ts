// M3+M4: прокачка (левел-ап, обучение, карьеры), продавец (бустеры/Dead Bull/Manual),
// реклама, контракты, своя консоль, переезд офиса.
import { CONFIG } from '../config';
import {
  ADS, BOOSTER_PRICES, CONTRACTS, TRAININGS,
} from '../data/db';
import type { CareerId } from '../data/schema';
import type { Rng } from '../rng';
import type {
  ActionResult, GameState, OwnConsoleState, Staff,
} from '../types';

export function log(state: GameState, text: string): void {
  state.log.push({ week: state.week, year: state.year, text });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}

function staffOf(state: GameState, staffId: string): Staff | undefined {
  return state.staff.find((s) => s.id === staffId);
}

// ─── левел-ап ───
export function levelUpStaff(state: GameState, staffId: string, rng: Rng): ActionResult {
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const career = s.activeCareer;
  const lv = s.careers[career] ?? 0;
  if (lv >= 5) return { ok: false, error: 'Максимальный уровень' };
  const price = CONFIG.LEVEL_PR[career]?.[lv - 1];
  if (!price) return { ok: false, error: 'Нет данных о цене' };
  if (state.research < price) return { ok: false, error: `Нужно ${price} PR (есть ${Math.round(state.research)})` };

  state.research -= price;
  s.careers[career] = lv + 1;
  s.levelUps += 1;
  const gain = CONFIG.LEVEL_STATS[career]?.[lv - 1];
  if (gain) {
    s.stats.program += gain.p;
    s.stats.scenario += gain.s;
    s.stats.graphics += gain.g;
    s.stats.sound += gain.so;
  }
  log(state, `⬆ ${s.name}: ${career} → Lv${lv + 1} (−${price} PR, зарплата ×1.2)`);
  return { ok: true };
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
  const deltas = { program: t.program ?? 0, scenario: t.scenario ?? 0, graphics: t.graphics ?? 0, sound: t.sound ?? 0 };
  let applied = 0;
  for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
    let d = deltas[k];
    if (d === 0) continue;
    // супер-эффективность: шанс ×3 (research/01 §4)
    if (rng.chance(0.08)) d *= 3;
    s.stats[k] = Math.max(0, s.stats[k] + d);
    applied += d;
  }
  if (!state.unlockedTrainings.includes(t.name)) state.unlockedTrainings.push(t.name);
  log(state, `🎓 ${s.name}: тренинг «${t.name}» (−${cost}K, POWER −${t.power ?? 0})`);
  void applied;
  return { ok: true };
}

// ─── смена профессии ───
export const CAREER_ORDER: CareerId[] = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'];

export function careerPrereqsMet(s: Staff, target: CareerId): boolean {
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

export function boosterPrice(state: GameState, type: string): number | null {
  const n = state.boosterPurchases[type] ?? 0;
  const row = BOOSTER_PRICES.find((b) => b.office === state.officeLevel && b.purchaseNo === n + 1);
  return row?.price ?? null;
}

// купить бустер (использование — useBooster)
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
const BOOSTER_KEY_JOB: Record<string, CareerId> = {
  fun: 'coder', creativity: 'writer', graphics: 'designer', sound: 'sound',
};

export function useBooster(state: GameState, staffId: string, type: string, rng: Rng): ActionResult {
  const g = state.activeGame;
  if (!g || g.phase === 'released') return { ok: false, error: 'Нет активной разработки' };
  const s = staffOf(state, staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  const attr = BOOSTER_ATTR[type];
  if (!attr) return { ok: false, error: 'Неизвестный бустер' };
  const uses = s.boosterUses[type] ?? 0;
  const keyJob = s.activeCareer === BOOSTER_KEY_JOB[type];
  let gain: number;
  if (uses === 0) gain = rng.int(CONFIG.BOOSTER_KEY_GAIN[0]!, CONFIG.BOOSTER_KEY_GAIN[1]!);
  else if (uses === 1) gain = rng.int(CONFIG.BOOSTER_KEY_GAIN_2[0]!, CONFIG.BOOSTER_KEY_GAIN_2[1]!);
  else gain = 0;
  s.boosterUses[type] = uses + 1;
  if (gain > 0) {
    g.points[attr] += gain;
    g.hype += 2;
    log(state, `🧪 ${s.name} применил бустер ${type}: +${gain} ${attr}`);
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
export function buyAd(state: GameState, adId: number): ActionResult {
  const ad = ADS.find((a) => a.id === adId);
  if (!ad) return { ok: false, error: 'Нет такой рекламы' };
  if (state.officeLevel < (ad.office ?? 1)) return { ok: false, error: `Нужен офис ${ad.office}` };
  const cost = (ad.costWan ?? 0) / 10;
  if (state.money < cost) return { ok: false, error: `Нужно ${cost}K` };
  state.money -= cost;
  const fans = Math.round(cost * CONFIG.AD_FAN_RATE);
  state.fans += fans;
  if (state.activeGame && state.activeGame.phase !== 'released') {
    state.activeGame.hype += CONFIG.AD_HYPE;
  }
  state.adsBought[ad.id] = (state.adsBought[ad.id] ?? 0) + 1;
  log(state, `📣 Реклама «${ad.name}» (−${cost}K): +${fans} фанатов`);
  return { ok: true };
}

// ─── M4: контракты ───
export function takeContract(state: GameState, contractId: number, staffIds: string[], rng: Rng): ActionResult {
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
export const OWN_CONSOLE_TYPES = [
  { id: 'console', label: 'Стационарная', cost: 6000 },
  { id: 'portable', label: 'Портативная', cost: 4000 },
] as const;
export const OWN_CONSOLE_CPUS = [
  { id: '16-bit', label: '16-бит чип', cost: 1000, hw: 1 },
  { id: '32-bit', label: '32-бит чип', cost: 10000, hw: 1 },
  { id: '64-bit', label: '64-бит чип', cost: 50000, hw: 1 },
  { id: 'potato-chip', label: 'Чип «Картошка»', cost: 90000, hw: 4 },
] as const;
export const OWN_CONSOLE_MEDIA = [
  { id: 'cartridge', label: 'Картридж', cost: 3000, hw: 1 },
  { id: 'cd', label: 'CD-ROM', cost: 5000, hw: 1 },
  { id: 'dvd', label: 'DVD-ROM', cost: 15000, hw: 1 },
  { id: 'bd', label: 'BD-ROM', cost: 35000, hw: 1 },
  { id: 'punch-cards', label: 'Перфокарты', cost: 93999.9, hw: 6 },
] as const;

export function hwEngineerCount(state: GameState): number {
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
    weeksTotal: (CONFIG.OWN_CONSOLE_WEEKS_BASE + (cpuIdx + mediaIdx) * CONFIG.OWN_CONSOLE_WEEKS_PER_INDEX) * 7, // в днях
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
export function officeUpgradeInfo(state: GameState): { level: number; cost: number; ready: boolean; reason: string } | null {
  if (state.officeLevel >= 3) return null;
  const next = state.officeLevel + 1;
  if (next === 2) {
    const ready = state.year >= 4 && state.money >= 1000 && state.history.length > 0;
    return { level: 2, cost: 600, ready, reason: 'Год 4+, ≥1000K и хотя бы одна выпущенная игра' };
  }
  const ready = state.year >= 10 || (state.money >= 3500 && (state.awards.grand > 0 || state.awards.design > 0 || state.awards.music > 0)) || (state.year >= 7 && state.money >= 3500);
  return { level: 3, cost: 2500, ready, reason: 'Год 10+; или 3500K + награда (7–9 год); или 3500K (10+)' };
}

export function moveOffice(state: GameState): ActionResult {
  const info = officeUpgradeInfo(state);
  if (!info) return { ok: false, error: 'Уже самый большой офис' };
  if (!info.ready) return { ok: false, error: `Условия: ${info.reason}` };
  if (state.money < info.cost) return { ok: false, error: `Нужно ${info.cost}K` };
  state.money -= info.cost;
  state.officeLevel = info.level as 2 | 3;
  log(state, `🏢 Переезд в офис ${info.level} (−${info.cost}K, мест: ${info.level === 2 ? 6 : 8})`);
  return { ok: true };
}

// проверка анлока типа: тренинг тоже требуется
export function isTypeUnlockedByTraining(state: GameState, training: string | null): boolean {
  if (!training) return true;
  return state.unlockedTrainings.some((t) => t.toLowerCase().includes(training.toLowerCase()));
}

// консоль существует и доступна
export function ownConsoleAvailable(state: GameState): boolean {
  return !!state.consoles['own-console'] || !!state.consoles['own-portable'];
}
