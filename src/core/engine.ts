// Движок: создание игры, тик (день), публичные действия.
import { CONFIG, type HireMethodId } from './config';
import { comboKey } from '../shared/rank';
import { CONSOLES } from './data/db';
import { createRng, rngFromState } from './rng';
import { log } from './log';
import { SAVE_VERSION } from './migrate';
import type { ActionResult, DirectionAxis, GamedexOption, GameState, StartProjectInput } from './types';
import { minigameClosedOutcome, minigameOutcome, minigameTitle } from '../shared/minigames';
import { gform } from '../shared/gender';
import {
  fireStaff, startSearch, hireFromSearch, makeStaffFromData, paySalaries, pickAvatar, dailyPower, restStaff, tickRest,
  makeHeroStaff, makePartnerStaff, partnerBuyout, partnerRent,
} from './systems/staff';
import {
  debugTick, devTick, releaseGame, resolveBoost, startProject,
} from './systems/dev';
import {
  applyCareerManual, buyAd, buyBooster, buyCareerManual, buyDeadBull, dismissSalesman,
  levelUpStaff, moveOffice, startOwnConsole, takeContract, tickContracts, tickOwnConsole,
  tickSalesman, trainStaff, trainToMax, applyBooster,
} from './systems/progression';
import type { CareerId } from './data/schema';
import {
  awardsCeremony, consoleEvents, dailySales, fanDecay, resolveGamedex, tickGamedex,
  tickMediaEvents, tryUnlockEventConsoles,
} from './systems/market';
import { tickFanLetters } from './systems/mail';
import { resolveStory, tickStory } from './systems/story';
import { resolveSaga, tickSaga } from './systems/saga';
import type { HeroSetup } from '../shared/hero';

/** PLAN-18: что игрок выбирает на старте (экран новой игры). */
export interface NewGameOptions {
  /** название студии */
  studioName?: string;
  /** кого взять в стартовую команду — 2 id из начального пула («Initially available»; легаси-путь без ГГ) */
  staffIds?: string[];
  /** PLAN-48: главный герой (игрок) — первый сотрудник новой партии */
  hero?: HeroSetup;
  /** PLAN-48: партнёр — сотрудник из начального пула */
  partnerId?: string;
  /** PLAN-48: доля партнёра 0–20% — даёт +D ко всем четырём статам */
  partnerPct?: number;
}

/** классическая стартовая пара (фолбэк, если выбор игрока некорректен) */
export const START_PAIR = ['newb-ownerton', 'john-gameson'] as const;
export const DEFAULT_STUDIO_NAME = 'Game Dev Studio';

export function newGame(seed = 1, opts: NewGameOptions = {}): GameState {
  const rng = createRng(seed);
  const state: GameState = {
    seed,
    saveVersion: SAVE_VERSION,
    studioName: opts.studioName?.trim() || DEFAULT_STUDIO_NAME,
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
    story: { arcs: {}, flags: { nextQuestWeek: 25 } },
    lastPopup: null,
    log: [],
    rngState: rng.state,
    salesmanHere: false,
    boosterPurchases: {},
    boosterCharges: {},
    careerManuals: 0,
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

  // PLAN-48: новый старт — главный герой (игрок) + партнёр из начального пула.
  // Без hero — легаси-путь PLAN-18: двое из начального пула.
  if (opts.hero) {
    const hero = makeHeroStaff(opts.hero);
    state.staff.push(hero);
    state.hiredIds.push(hero.id);
    const partner = makePartnerStaff(opts.partnerId, opts.partnerPct ?? 0);
    if (partner) {
      partner.avatar = pickAvatar(rng);
      state.staff.push(partner);
      state.hiredIds.push(partner.id);
    }
    log(state, `${gform('Основатель/Основательница', hero.gender)}: ${hero.name}${partner ? ` · партнёр: ${partner.name} (доля ${partner.partnerPct ?? 0}%)` : ''}`);
  } else {
    // стартовая команда: выбор игрока (2 из начального пула) или классическая пара.
    // PLAN-18: экран новой игры отдаёт staffIds; дубли и лишние id отсекаем.
    const wanted = (opts.staffIds?.length ? opts.staffIds : [...START_PAIR])
      .filter((id, i, all) => typeof id === 'string' && all.indexOf(id) === i)
      .slice(0, 2);
    for (const id of wanted) {
      const st = makeStaffFromData(id);
      if (st) {
        st.avatar = pickAvatar(rng);
        state.staff.push(st);
        state.hiredIds.push(st.id);
      }
    }
    // страховка: невалидный выбор (таких сотрудников нет) — классическая пара
    if (state.staff.length === 0) {
      for (const id of START_PAIR) {
        const st = makeStaffFromData(id);
        if (st) {
          st.avatar = pickAvatar(rng);
          state.staff.push(st);
          state.hiredIds.push(st.id);
        }
      }
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
    // PLAN-22: проект запущен — комбо считается открытым игроком (синхронизация в аккаунт на автосейве)
    const pair = comboKey(input.genreId, input.typeId);
    state.openedCombos = state.openedCombos ?? [];
    if (!state.openedCombos.includes(pair)) state.openedCombos.push(pair);
  }
  return res;
}

// M7: поиск сотрудников — платный; список кандидатов хранится в сейве (до следующего поиска)
export function searchAction(state: GameState, method: HireMethodId) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = startSearch(state, method, rng);
  state.rngState = rng.state;
  return res;
}

// нанять кандидата из текущего списка поиска (выбор в окне «Найм»)
export function hireFromSearchAction(state: GameState, staffId: string) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = hireFromSearch(state, staffId, rng);
  state.rngState = rng.state;
  return res;
}

export function fireAction(state: GameState, staffId: string) {
  return fireStaff(state, staffId);
}

/** PLAN-48: расставание с партнёром — вариант 1: выкуп доли (D% кассы разом). */
export function partnerBuyoutAction(state: GameState) {
  return partnerBuyout(state);
}

/** PLAN-48: расставание с партнёром — вариант 2: рента (D/4 % продаж игр навсегда). */
export function partnerRentAction(state: GameState) {
  return partnerRent(state);
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

// PLAN-39: результат мини-игры из врезки (0–100 %) — эффект PR + строка в журнал.
// closed=true — партию закрыли досрочно: максимальный штраф, результат не учитывается.
export function resolveMinigameAction(state: GameState, pct: number, closed = false): ActionResult {
  const ev = state.pendingEvent;
  if (ev?.type !== 'minigame') return { ok: false, error: 'Сейчас нет мини-игры' };
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const { pr, note } = closed ? minigameClosedOutcome() : minigameOutcome(p);
  state.pendingEvent = null;
  if (pr > 0) state.research += pr;
  else if (pr < 0) state.research = Math.max(0, state.research + pr);
  log(state, closed
    ? `🎮 Мини-игра «${minigameTitle(ev.gameId)}» закрыта досрочно — ${note}`
    : `🎮 Мини-игра «${minigameTitle(ev.gameId)}» — ${p}%: ${note}`);
  return { ok: true };
}

/** PLAN-39: нейтрально закрыть мини-игру (автопилот её не играет). */
export function skipMinigame(state: GameState, why: string): void {
  const ev = state.pendingEvent;
  if (ev?.type !== 'minigame') return;
  state.pendingEvent = null;
  log(state, `🎮 Мини-игра «${minigameTitle(ev.gameId)}» пропущена (${why})`);
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

export function buyCareerManualAction(state: GameState) {
  return buyCareerManual(state);
}

export function applyCareerManualAction(state: GameState, staffId: string, target: CareerId) {
  return applyCareerManual(state, staffId, target);
}

// PLAN-41: отпуск и автотренировка (окно сотрудника)
export function restStaffAction(state: GameState, staffId: string) {
  return restStaff(state, staffId);
}

export function trainToMaxAction(state: GameState, staffId: string) {
  const rng = rngFromState(state.rngState, state.seed);
  const res = trainToMax(state, staffId, rng);
  state.rngState = rng.state;
  return res;
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

// PLAN-44: сюжетная линия — игрок выбрал вариант в попапе
export function resolveStoryAction(state: GameState, option: string): ActionResult {
  const rng = rngFromState(state.rngState, state.seed);
  const res = resolveStory(state, option, rng);
  state.rngState = rng.state;
  return res;
}

// PLAN-49: сага «Синяя Комета» — выбор игрока в главе (срезу rng не нужен)
export function resolveSagaAction(state: GameState, option: string): ActionResult {
  return resolveSaga(state, option);
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
  tickRest(state); // PLAN-41: отсчёт отпуска — по возвращении POWER полный

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
  // M6: PAYDAY_DAY чемпиона (372) шире года — приводим по модулю (372 → 7 апреля),
  // иначе строгое равенство не срабатывало бы никогда и зарплаты исчезли бы из игры
  const paydayDay = ((CONFIG.PAYDAY_DAY - 1) % CONFIG.YEAR_LENGTH) + 1;
  if (dayInYear === paydayDay) paySalaries(state);
  if (dayInYear === CONFIG.AWARDS_DAY) awardsCeremony(state, rng);

  // 5. M3/M4/M5: продавец, Gamedex, контракты, своя консоль
  tickSalesman(state);
  tickGamedex(state);
  tickContracts(state, rng);
  tickOwnConsole(state);
  tickStory(state, rng);
  tickSaga(state); // PLAN-49: сага «Синяя Комета» — старт/восстановление попапа главы

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
