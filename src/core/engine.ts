// Движок: создание игры, тик (день), публичные действия.
import { CONFIG, type HireMethodId } from './config';
import { CONSOLES } from './data/db';
import { createRng, rngFromState } from './rng';
import { log } from './log';
import { SAVE_VERSION } from './migrate';
import type { DirectionAxis, GamedexOption, GameState, StartProjectInput } from './types';
import {
  fireStaff, hireStaff, hireStaffById, makeStaffFromData, paySalaries, pickAvatar, dailyPower,
} from './systems/staff';
import {
  debugTick, devTick, releaseGame, resolveBoost, startProject,
} from './systems/dev';
import {
  buyAd, buyBooster, buyCareerManual, buyDeadBull, changeCareer, dismissSalesman,
  levelUpStaff, moveOffice, startOwnConsole, takeContract, tickContracts, tickOwnConsole,
  tickSalesman, trainStaff, applyBooster,
} from './systems/progression';
import type { CareerId } from './data/schema';
import {
  awardsCeremony, consoleEvents, dailySales, fanDecay, resolveGamedex, tickGamedex,
  tickMediaEvents, tryUnlockEventConsoles,
} from './systems/market';
import { tickFanLetters } from './systems/mail';

export function newGame(seed = 1): GameState {
  const rng = createRng(seed);
  const state: GameState = {
    seed,
    saveVersion: SAVE_VERSION,
    week: 1,
    year: 1,
    money: CONFIG.START_MONEY,
    research: CONFIG.START_RESEARCH,
    fans: CONFIG.START_FANS,
    directionPoints: CONFIG.START_DIRECTION_POINTS,
    lastGenreId: null,
    lastTypeId: null,
    lastMode: 'normal',
    lastDirection: { cute: 0, realism: 0, approach: 5, niche: 0, simple: 0, innovation: 0, world: 0, polish: 5 },
    officeLevel: 1,
    staff: [],
    hiredIds: [],
    activeGame: null,
    released: [],
    history: [],
    genreLevels: {},
    typeLevels: {},
    consoles: {},
    awards: { grand: 0, design: 0, music: 0, runnerUp: 0, worst: 0 },
    emergencyFundUsed: false,
    bankrupt: false,
    pendingEvent: null,
    lastPopup: null,
    log: [],
    rngState: rng.state,
    salesmanHere: false,
    boosterPurchases: {},
    unlockedTrainings: [],
    gamedexHere: false,
    lastGamedex: null,
    gamedexFame: 0,
    contracts: [],
    adFansGained: {},
    ownConsole: null,
    mail: [],
    mailId: 0,
    releasePopupShown: false,
    devContrib: [],
  };

  // стартовая команда: Кодер + Сценарист
  for (const id of ['newb-ownerton', 'john-gameson']) {
    const st = makeStaffFromData(id);
    if (st) {
      st.avatar = pickAvatar(rng);
      state.staff.push(st);
      state.hiredIds.push(st.id);
    }
  }

  // консоли: появление по дате выхода обрабатывает consoleEvents (market.ts) —
  // он же пишет «Слух»/«поступила в продажу»; здесь поле пустое до релиза консоли
  for (const c of CONSOLES) {
    state.consoles[c.id] = {
      licensed: c.licenseCost === 0,
      base: c.installBase,
      availableAtWeek: null,
      removedAtWeek: null,
    };
  }

  log(state, 'Компания основана. Денег: 500K. Персонал: 2. Удачи!');
  // BUG-01: консоли, вышедшие к первому дню (PC, Microx SX), доступны сразу —
  // раньше их «выдавал» только первый тик, и на паузе форма новой игры была пуста
  consoleEvents(state);
  return state;
}

// ---- публичные действия ----

export function startProjectAction(state: GameState, input: StartProjectInput) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = startProject(state, input);
  state.rngState = rng.state;
  // запоминаем выборы игрока: подставляются в следующий визард и известны LLM-чату
  if (res.ok) {
    state.lastGenreId = input.genreId;
    state.lastTypeId = input.typeId;
    state.lastMode = input.mode;
    const full: Record<DirectionAxis, number> = { cute: 0, realism: 0, approach: 0, niche: 0, simple: 0, innovation: 0, world: 0, polish: 0 };
    for (const k of Object.keys(input.direction) as DirectionAxis[]) full[k] = input.direction[k] ?? 0;
    state.lastDirection = full;
  }
  return res;
}

export function hireAction(state: GameState, method: HireMethodId, opts?: { maxFee?: number }) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = hireStaff(state, method, rng, opts);
  state.rngState = rng.state;
  return res;
}

// нанять конкретного кандидата (выбор в окне «Найм»)
export function hireByIdAction(state: GameState, method: HireMethodId, staffId: string, opts?: { maxFee?: number }) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = hireStaffById(state, staffId, method, rng, opts);
  state.rngState = rng.state;
  return res;
}

export function fireAction(state: GameState, staffId: string) {
  return fireStaff(state, staffId);
}

export function buyLicenseAction(state: GameState, consoleId: string): { ok: boolean; error?: string } {
  const c = CONSOLES.find((x) => x.id === consoleId);
  const cs = state.consoles[consoleId];
  if (!c || !cs) return { ok: false, error: 'Нет такой консоли' };
  if (cs.licensed) return { ok: false, error: 'Уже куплена' };
  if (cs.availableAtWeek === null || cs.availableAtWeek > state.week) return { ok: false, error: 'Консоль ещё не вышла' };
  if (cs.removedAtWeek !== null && cs.removedAtWeek <= state.week) return { ok: false, error: 'Консоль снята с производства' };
  if (state.money < c.licenseCost) return { ok: false, error: `Не хватает денег (нужно ${c.licenseCost}K)` };
  state.money -= c.licenseCost;
  cs.licensed = true;
  log(state, `Куплена лицензия на «${c.name}» (${c.licenseCost}K)`);
  return { ok: true };
}

export function releaseAction(state: GameState, name?: string) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = releaseGame(state, rng, name);
  state.rngState = rng.state;
  return res;
}

export function resolveBoostAction(state: GameState, accept: boolean, amount?: number) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = resolveBoost(state, rng, accept, amount);
  state.rngState = rng.state;
  return res;
}

export function dismissSalesmanAction(state: GameState) {
  dismissSalesman(state);
}

// закрыть любой информационный попап (результат буста/происшествие/продавец/оценки) — время продолжит идти
export function resolveEventAction(state: GameState) {
  const t = state.pendingEvent?.type;
  if (t === 'boost_result' || t === 'disaster' || t === 'salesman' || t === 'release_result' || t === 'info') state.pendingEvent = null;
  // показываем отложенный попап результата действия (тренировка/уровень), если он был
  if (state.lastPopup) {
    const p = state.lastPopup;
    state.lastPopup = null;
    state.pendingEvent = { type: 'info', title: p.title, text: p.text };
  }
}

// ---- M3: персонал ----

export function levelUpAction(state: GameState, staffId: string) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = levelUpStaff(state, staffId, rng);
  state.rngState = rng.state;
  return res;
}

export function trainAction(state: GameState, staffId: string, trainingId: number) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = trainStaff(state, staffId, trainingId, rng);
  state.rngState = rng.state;
  return res;
}

export function changeCareerAction(state: GameState, staffId: string, target: CareerId, viaManual = false) {
  return changeCareer(state, staffId, target, viaManual);
}

export function buyBoosterAction(state: GameState, type: string) {
  return buyBooster(state, type);
}

export function applyBoosterAction(state: GameState, staffId: string, type: string) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = applyBooster(state, staffId, type, rng);
  state.rngState = rng.state;
  return res;
}

export function buyDeadBullAction(state: GameState, staffId: string) {
  return buyDeadBull(state, staffId);
}

export function buyCareerManualAction(state: GameState, staffId: string, target: CareerId) {
  return buyCareerManual(state, staffId, target);
}

export function moveOfficeAction(state: GameState) {
  return moveOffice(state);
}

// ---- M4: рынок ----

export function buyAdAction(state: GameState, adId: number) {
  return buyAd(state, adId);
}

export function takeContractAction(state: GameState, contractId: number, staffIds: string[]) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = takeContract(state, contractId, staffIds, rng);
  state.rngState = rng.state;
  return res;
}

export function startOwnConsoleAction(
  state: GameState, name: string, type: 'console' | 'portable', cpu: string, media: string,
) {
  return startOwnConsole(state, name, type, cpu, media);
}

// Gamedex: выбрать стенд (выставка в июле, офис 2+)
export function resolveGamedexAction(state: GameState, option: GamedexOption) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = resolveGamedex(state, option, rng);
  state.rngState = rng.state;
  return res;
}

// ---- тик ----

export function tick(state: GameState): void {
  const rng = rngFromState(state.rngState, state.seed);

  // 1. производство (пауза, если ждём решение игрока)
  const worked = !!state.activeGame && state.activeGame.phase !== 'released' && !state.pendingEvent;
  if (state.pendingEvent) {
    // ждём игрока; только продажи идут
  } else {
    devTick(state, rng);
    debugTick(state, rng);
  }
  dailyPower(state, worked, rng);

  // 2. продажи + медиа-события после релиза (статья/TV/баг) + письма фанатов
  dailySales(state);
  tickMediaEvents(state, rng);
  tickFanLetters(state, rng);

  // 3. рынок/консоли
  consoleEvents(state);
  tryUnlockEventConsoles(state);
  fanDecay(state);

  // 4. календарь (1 день = 1 тик; год = 365 дней, старт 1 апреля 1985)
  const dayInYear = ((state.week - 1) % CONFIG.YEAR_LENGTH) + 1;
  if (dayInYear === CONFIG.PAYDAY_DAY) paySalaries(state);
  if (dayInYear === CONFIG.AWARDS_DAY) awardsCeremony(state, rng);

  // 5. M3/M4/M5: продавец, Gamedex, контракты, своя консоль
  tickSalesman(state);
  tickGamedex(state);
  tickContracts(state, rng);
  tickOwnConsole(state);

  // 6. конец недели
  state.rngState = rng.state;
  state.week += 1;
  state.year = Math.floor((state.week - 1) / CONFIG.YEAR_LENGTH) + 1;
}

export function advanceWeeks(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) {
    if (state.bankrupt) break;
    tick(state);
  }
}
