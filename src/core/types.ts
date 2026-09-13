import type { CareerId } from './data/schema';
import type { Mode } from './config';

export type { Mode };
export type ComboGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface Stats {
  fun: number;
  creativity: number;
  graphics: number;
  sound: number;
}

export const EMPTY_STATS: Stats = { fun: 0, creativity: 0, graphics: 0, sound: 0 };

export type DirectionAxis =
  | 'cute' | 'realism' | 'approach' | 'niche'
  | 'simple' | 'innovation' | 'world' | 'polish';

// вклад сотрудника за последний тик (для анимации в UI)
export interface DevContrib {
  staffId: string;
  attr: 'fun' | 'creativity' | 'graphics' | 'sound';
  amount: number;
}

// подписи осей направления (визард + системные сообщения чата — единый источник)
export const DIRECTION_LABELS: Record<DirectionAxis, string> = {
  cute: 'Милый', realism: 'Реализм', approach: 'Доступность', niche: 'Нишевость',
  simple: 'Простота', innovation: 'Инновация', world: 'Игровой мир', polish: 'Полировка',
};

// порядок осей в визарде/сводках
export const DIRECTION_ORDER: DirectionAxis[] = ['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish'];

// веса осей направления → атрибуты (09 §2.3)
export const DIRECTION_WEIGHTS: Record<DirectionAxis, Stats> = {
  cute: { fun: 0.4, creativity: 0, graphics: 0.6, sound: 0 },
  realism: { fun: 0, creativity: 0, graphics: 0.7, sound: 0.3 },
  approach: { fun: 0.8, creativity: 0.2, graphics: 0, sound: 0 },
  niche: { fun: 0, creativity: 1.0, graphics: 0, sound: 0 },
  simple: { fun: 1.0, creativity: 0, graphics: 0, sound: 0 },
  innovation: { fun: 0.2, creativity: 0.8, graphics: 0, sound: 0 },
  world: { fun: 0.5, creativity: 0.5, graphics: 0, sound: 0 },
  polish: { fun: 0.25, creativity: 0.25, graphics: 0.25, sound: 0.25 },
};

export type Role = 'proposal' | 'program' | 'graphics' | 'sound' | 'debug';

export interface Staff {
  id: string;
  name: string;
  gender: 'M' | 'F';
  salary: number; // K/год база (данные)
  hireFee: number; // K
  maxPower: number;
  power: number;
  stats: { program: number; scenario: number; graphics: number; sound: number };
  careers: Record<CareerId, number>;
  activeCareer: CareerId;
  levelUps: number; // повышений уровня ПОСЛЕ найма (зарплата ×1.2^levelUps)
  boosterUses: Record<string, number>; // бустер → сколько раз использован на игре
  avatar: string; // путь к аватарке (UI)
  homeWeeks: number; // >0: ушёл домой
  lastRole: Role | null; // штраф «повтор» (механика prev)
}

export interface ActiveGame {
  consoleId: string;
  genreId: string;
  typeId: string;
  mode: Mode;
  comboGrade: ComboGrade;
  direction: Record<DirectionAxis, number>; // сумма = потраченные очки направления
  points: Stats;
  totalCost: number; // K
  progress: number; // 0..1 (время: дни / 100 × режим)
  bugs: number;
  debugCarry?: number; // AP-13: остаток скорости отладки между днями (доли бага)
  weekStarted: number;
  phase: 'proposal' | 'dev' | 'debug' | 'released';
  proposalStaffId: string | null;
  assignments: Partial<Record<Role, string[]>>;
  contribTotal: Record<string, number>; // суммарный вклад по сотрудникам за проект (для отчёта)
  plot?: string; // краткий сюжет из мастера
  // события
  boostOffered: boolean;
  boostUsed: boolean;
  fame: number; // известность текущего проекта
  hype: number; // ожидание текущего проекта
  // результат
  name: string;
  score: number | null;
  judgeScores: number[];
  reviewMessages: string[];
  releaseWeek: number | null;
  sales: { week: number; units: number; revenue: number; unitsF?: number }[];
  totalUnits: number;
  totalRevenue: number;
  ended: boolean; // снята с продаж
  mediaMult?: number; // множитель остатка продаж от медиа-событий (статья/TV/баг), 1 = нет
  paidUnits?: number; // PLAN-29: ФАКТ продано копий (с медиа-множителем) — для окна «Продажи»
  paidRevenue?: number; // PLAN-29: ФАКТ доход (K) — механики не читают, только отчёт
}

export interface GameRecord {
  name: string;
  plot?: string; // краткий сюжет из мастера
  genreId: string;
  typeId: string;
  consoleId: string;
  score: number;
  units: number;
  revenue: number;
  releaseWeek: number;
  /** PLAN-30: оценки десяти критиков (3–10) и их отзывы — для модалки прессы */
  judgeScores?: number[];
  reviewMessages?: string[];
  year: number;
  attrs: Stats;
  bugs: number;
  awards: string[];
  paidUnits?: number; // PLAN-29: факт по копям (заполняется при снятии с продаж)
  paidRevenue?: number; // PLAN-29: факт по деньгам (K)
  contrib?: Record<string, number>; // вклад сотрудников (имя → очки), для отчёта
}

export interface ConsoleState {
  licensed: boolean;
  base: number; // тыс.
  availableAtWeek: number | null;
  removedAtWeek: number | null;
}

export interface LogEntry {
  week: number;
  year: number;
  text: string;
}

// ─── M4: контракт ───
export interface ContractState {
  id: number; // id из БД
  name: string;
  staffIds: string[];
  deadline: number; // неделя, к которой нужно успеть
  progress: { program: number; scenario: number; graphics: number; sound: number };
  done: boolean;
}

// ─── M4: своя консоль ───
export interface OwnConsoleState {
  name: string;
  type: 'console' | 'portable';
  cpu: string;
  media: string;
  cost: number; // K
  weeksTotal: number;
  progress: number; // недель прошло
}

// ─── M5: письмо фаната ───
/** 4 тона письма: восторг / ностальгия / разбор / идеи (10.09.2026) */
export type FanLetterStyle = 'delight' | 'nostalgia' | 'rant' | 'ideas';

export interface FanLetter {
  id: number;
  week: number; // день получения
  year: number;
  gameName: string;
  score: number; // оценка игры, о которой письмо
  fanName: string;
  gender: 'M' | 'F';
  sentiment: 'love' | 'neutral' | 'hate';
  /** стиль письма (4 тона); в старых сейвах нет — сервер возьмёт по sentiment */
  style?: FanLetterStyle;
  /** жанр игры — для конкретики в тексте письма */
  genre?: string;
  fansDelta: number; // эффект уже применён к state.fans
  text: string; // движковая заготовка; сервер заменяет текстом LLM (llm = true)
  llm: boolean;
}

// ─── M5: Gamedex (выставка в июле, офис 2+) ───
export type GamedexOption = 'none' | 'booth' | 'costumes' | 'girls' | 'star';

export type PendingEvent =
  | { type: 'boost'; staffId: string; cost: number }
  | { type: 'boost_result'; text: string; outcome: 'success' | 'fail' }
  | { type: 'salesman' }
  | { type: 'gamedex'; year: number }
  | { type: 'disaster'; text: string }
  | { type: 'ready_to_release'; text: string }
  | { type: 'release_result'; text: string }
  | { type: 'info'; title: string; text: string }
  | null;

/** PLAN-24: сохраняемый вид рабочего стола (фон + раскладка окон). Игровая логика его не читает. */
export interface UiState {
  /** id обоев из public/wallpapers или null (обычный бирюзовый стол) */
  wallpaper?: string | null;
  windows?: UiWindow[];
  /** расстановка иконок на столе: id приложения → координаты верхнего левого угла */
  icons?: Record<string, { x: number; y: number }>;
}

export interface UiWindow {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  maximized: boolean;
  closed: boolean;
  z: number;
}

export interface GameState {
  seed: number;
  saveVersion: number; // версия формата сейва (миграции — src/core/migrate.ts)
  /**
   * PLAN-24: вид рабочего стола, который игрок ждёт увидеть на любом устройстве, — фон и раскладка
   * окон (какие открыты, где стоят, что свёрнуто). Игровая логика эти поля не читает.
   */
  ui?: UiState;
  /** PLAN-18: название студии (выбор игрока на старте; у старых сейвов — «Game Dev Studio») */
  studioName: string;
  week: number; // 1-based
  money: number; // K
  research: number; // PR
  fans: number;
  directionPoints: number;
  // последний выбор в визарде (для следующей игры и контекста LLM-чата)
  lastGenreId: string | null;
  lastTypeId: string | null;
  lastMode: Mode;
  lastDirection: Record<DirectionAxis, number>;
  officeLevel: 1 | 2 | 3;
  staff: Staff[];
  hiredIds: string[]; // кто уже нанят/уволен (для пула)
  activeGame: ActiveGame | null; // проект в производстве
  released: ActiveGame[]; // выпущенные игры, ещё продающиеся
  history: GameRecord[];
  /** PLAN-22: комбо «жанр|тип», открытые игроком (набор аккаунта, подмешивается на старте сессии) */
  openedCombos?: string[];
  genreLevels: Record<string, number>;
  typeLevels: Record<string, number>;
  consoles: Record<string, ConsoleState>;
  awards: { grand: number; design: number; music: number; runnerUp: number; worst: number };
  emergencyFundUsed: boolean;
  bankrupt: boolean;
  pendingEvent: PendingEvent;
  /** отложенный попап результата действия (показывается после текущего события) */
  lastPopup: PopupInfo | null;
  log: LogEntry[];
  rngState: number;
  year: number; // 1-based

  // ─── M3 ───
  salesmanHere: boolean; // продавец в офисе (май, с года 2)
  boosterPurchases: Record<string, number>; // тип бустера → куплено раз (цены растут)
  unlockedTrainings: string[]; // тренинги, пройденные хотя бы раз (анлок типов)
  releasePopupShown: boolean; // попап «игра готова» уже показан для текущей игры
  devContrib: DevContrib[]; // вклад сотрудников за последний тик (UI-анимация)

  // ─── M5: Gamedex ───
  gamedexHere: boolean; // выставка в городе (1–7 июля, офис 2+)
  lastGamedex: { year: number; option: GamedexOption } | null; // для «приедается» (ротация)
  gamedexFame: number; // известность от стендов → к СЛЕДУЮЩЕМУ проекту (списывается на старте)

  // ─── M5 ───
  contracts: ContractState[];
  adFansGained: Record<string, number>; // накоплено фанатов по типу (потолки/убывание рекламы)
  ownConsole: OwnConsoleState | null;
  mail: FanLetter[]; // письма фанатов (текст дописывает LLM на сервере)
  mailId: number; // счётчик id писем
}

export interface StartProjectInput {
  consoleId: string;
  genreId: string;
  typeId: string;
  mode: Mode;
  direction: Partial<Record<DirectionAxis, number>>;
  proposalStaffId: string;
  assignments: { program: string[]; graphics: string[]; sound: string[]; debug: string[] };
  name?: string; // заданное игроком название (иначе генерируется на релизе)
  plot?: string; // краткий сюжет
}

export interface PopupInfo {
  title: string;
  text: string;
}

export type ActionResult = { ok: true; popup?: PopupInfo } | { ok: false; error: string };
