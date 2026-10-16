import type { CareerId } from './data/schema';
import type { HireMethodId, Mode } from './config';
import type { DifficultyId } from './difficulty';

export type { Mode };
export type ComboGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

/** M8: сообщение отрывка чата в карточке игры архива. */
export interface DecisionChatMsg {
  author: string;
  text: string;
  week: number;
}

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

/** PLAN-41: персональные пороги статов сотрудника */
export interface StaffCaps { program: number; scenario: number; graphics: number; sound: number }
/** PLAN-41: запись истории сотрудника (кольцо ≤ 60) */
export interface StaffHistoryEntry {
  week: number;
  kind: 'hire' | 'career' | 'levelup' | 'train' | 'rest' | 'back';
  text: string;
}

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
  caps: StaffCaps; // PLAN-41: пороги статов — обучение не может их превысить
  history: StaffHistoryEntry[]; // PLAN-41: история (профессии, левелапы, обучение, отпуск)
  trainCount: Record<string, { n: number; gains: StaffCaps }>; // PLAN-41: сводка обучения по методам
  restDays: number; // PLAN-41: >0 — в отпуске (дней осталось)

  // ─── PLAN-48: главный герой (игрок) и партнёр ───
  /** ГГ: вечный сотрудник-игрок — уволить нельзя; в чате подписан своим именем вместо «Вы» */
  hero?: boolean;
  /** доля партнёра 0–20%: даёт +D ко всем четырём статам; увольнение — только выкуп/рента */
  partnerPct?: number;
  /** характер для LLM-чата: у ГГ — выбранный/свой; у остальных — persona из контентной БД */
  persona?: string | null;
  /** папка аватарок игрока в LLMPics (player-01..60) вместо staff.id */
  avatarId?: string;
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
  /** PLAN-30: всего багов за разработку (с учётом исправленных) */
  bugsTotal?: number;
  debugCarry?: number; // AP-13: остаток скорости отладки между днями (доли бага)
  /** M9: медиа-событие отложено — попап-пауза висела, покажем в следующий свободный день */
  pendingMedia?: boolean;
  /** PLAN-39: мини-игра на 50% разработки уже показана (один раз за проект) */
  mg50?: boolean;
  weekStarted: number;
  phase: 'proposal' | 'dev' | 'debug' | 'released';
  proposalStaffId: string | null;
  assignments: Partial<Record<Role, string[]>>;
  contribTotal: Record<string, number>; // суммарный вклад по сотрудникам за проект (для отчёта)
  plot?: string; // краткий сюжет из мастера
  /** M8: отрывок чата, где команда решила разрабатывать эту игру (снимок на старте проекта) */
  decisionChat?: DecisionChatMsg[];
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
  /** M8: отрывок чата, где команда решила разрабатывать эту игру (архивы до обновления — без него) */
  decisionChat?: DecisionChatMsg[];
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
  /** PLAN-30: всего багов за разработку (с учётом исправленных) */
  bugsTotal?: number;
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
  // своя консоль (own-*): имя и компоненты сохраняются при завершении; старые сейвы — без них
  name?: string;
  cpu?: string;
  media?: string;
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
  /** M9: неделя завершения (успех или провал) — для кулдауна повтора */
  finishedWeek?: number;
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
  /** SER-22: число тихих попыток дорисовать текст LLM (после 5 — заготовка движка) */
  llmTries?: number;
  /** жанр игры — для конкретики в тексте письма */
  genre?: string;
  fansDelta: number; // эффект уже применён к state.fans
  text: string; // движковая заготовка; сервер заменяет текстом LLM (llm = true)
  llm: boolean;
  /** 05-P2-6: особое письмо — двадцатилетие студии (без игры/оценки, без реакции команды) */
  kind?: 'anniversary';
}

// ─── M5: Gamedex (выставка в июле, офис 2+) ───
export type GamedexOption = 'none' | 'booth' | 'costumes' | 'girls' | 'star';

// ─── PLAN-44: сюжетные линии (контент — shared/storylines.ts; движок — core/systems/story.ts) ───
/** v1.40: процедурный квест — собран questgen.ts, хранится в сейве целиком (текст и params). */
export interface GenQuestData {
  template: string;
  title: string;
  text: string;
  options: { id: string; label: string; cost?: number; fans?: number; money?: number }[];
  /** числа, согласованные между текстом и эффектами (суммы в K) */
  params: Record<string, number>;
}

export interface StoryArcState {
  /** 1-based номер шага, который ждёт решения игрока */
  step: number;
  done: boolean;
  /** v1.40: данные процедурного квеста (только для arcId === 'quest') */
  gen?: GenQuestData;
  /** неделя, на которой придёт эпилог (ставится при выборе в завязке) */
  waitUntil?: number;
  /** участник арки */
  staffId?: string;
  staffName?: string;
  /** второй участник (арки-взаимодействия между сотрудниками) */
  staffId2?: string;
  staffName2?: string;
  /** 11.10.2026: пол участников — родовые формы текстов и логов (старые сейвы — нет) */
  staffGender?: 'M' | 'F';
  staffGender2?: 'M' | 'F';
  /** «Игра мечты»: жанр из обещания (сверяется с релизами) */
  genreId?: string;
  /** неделя старта арки (релизы после неё считаются исполнением мечты) */
  startWeek?: number;
  /** промежуточный ролл арки («разговор» в споре самолюбий) */
  good?: boolean;
  outcome?: 'stay' | 'left' | 'promise' | 'declined' | 'rest' | 'bonus' | 'risk' | 'contest' | 'talk' | 'ignore' | 'mentor' | 'decline' | 'veteran' | 'young' | 'both';
}

export interface StoryState {
  arcs: Record<string, StoryArcState>;
  flags: Record<string, number>;
}

/** PLAN-49 (Э1): роль саги, закреплённая за сотрудником (фиксируется при старте саги). */
export interface SagaRoleRef {
  staffId: string;
  name: string;
  gender: 'M' | 'F';
}

/**
 * аудит-51 05-P2-6: финал партии — счёт по активам после завершения истории.
 * Ставится тиком (сага завершена, либо 20 лет без саги), показывается попапом один раз;
 * дальше партия продолжается в свободном режиме (решение юзера 10.10.2026).
 */
export interface FinaleState {
  /** попап итога уже показан — второй раз не беспокоим */
  shown: boolean;
  /** день, когда история завершилась (числа Э3) */
  week: number;
  /** капитал на момент завершения (K) — «счёт по активам» */
  worth: number;
}

/**
 * PLAN-49 (Э1): сага «Синяя Комета» — скрытая главная линия партии.
 * Главы = узлы SAGA_NODES (src/shared/saga-data.ts); решения — только игрок.
 * Шкалы (ШУМ/СОВЕСТЬ/доверие) скрыты и живут здесь; в UI — только намёки в текстах.
 */
export interface SagaState {
  /** текущий узел (id из SAGA_NODES) */
  node: string;
  /** фаза узла: выбор → «после выбора» (result) → финальный эпилог (final) → завершена (done).
   *  end — защита от битого перехода (узла нет в данных). */
  stage: 'choice' | 'result' | 'final' | 'done' | 'end';
  /** индекс выбранного варианта на фазе result */
  chosen?: number;
  /** строковые флаги («без партнёра», «научный путь»…) */
  flags: string[];
  /** артефакты на руках («флаер + коробка», «лот №23»…) */
  artifacts: string[];
  /** доверие по персонажам (Вера, Мороз, Каспер, Глеб, Ростоцкий, Виталик…) */
  trust: Record<string, number>;
  /** скрытые шкалы: noise, conscience, culture, biz */
  scales: Record<string, number>;
  /** роли штата: Скептик, Мечтатель, Технарь, Юрист, Финдир (+ Партнёр) */
  roles: Record<string, SagaRoleRef>;
  /** пейсер: неделя игры, с которой показывать следующую главу (пауза 180–230 дней) */
  holdUntil?: number;
  /** PLAN-49 Э3: день игры старта саги — база «эпохи» в числах (1983 + 40 лет к старту) */
  startWeek?: number;
  /** Э3: день показа предыдущего узла (для «Проходит N лет» в интерлюдиях) */
  lastWeek?: number;
  /** Э3: пауза перед текущим узлом, дней (week − lastWeek на момент показа) */
  lastGap?: number;
}

/** PLAN-52 M2b: телевидение — каналы медиа-империи (эпохи — в CONFIG.TV_CHANNELS) */
export type TvChannelId = 'svetlyachok' | 'soroka' | 'oblako' | 'mayak' | 'polnoch';

/** PLAN-52 M2b: предложение канала — сезон по франшизе (week — когда пришло) */
export interface TvOffer {
  channelId: TvChannelId;
  franchiseKey: string;
  week: number;
}

/** PLAN-52 M2b: идущий сезон мультсериала */
export interface TvShow {
  channelId: TvChannelId;
  franchiseKey: string;
  name: string;
  /** дней до финала (убывает с тиком) */
  weeksLeft: number;
  lengthDays: number;
  /** K за неделю эфира */
  rate: number;
  fansPerWeek: number;
  startedWeek: number;
}

export type TvOutcome = 'legend' | 'hit' | 'ok' | 'flop';

/** PLAN-52 M2b: итоги завершённого сезона (строка в «Империи») */
export interface TvResult {
  channelId: TvChannelId;
  franchiseKey: string;
  name: string;
  rating: number;
  outcome: TvOutcome;
  week: number;
}

/** PLAN-52 M2b: состояние телевидения (миграция v21) */
export interface TvState {
  show: TvShow | null;
  offer: TvOffer | null;
  /** день следующего предложения (переносится при каждом оффере) */
  nextOfferWeek: number;
  /** последний завершённый сезон */
  lastResult?: TvResult | null;
  /** попап итогов отложен (заняли другим событием) — покажем в первый свободный день */
  pendingResult?: boolean;
}

export type PendingEvent =
  | { type: 'boost'; staffId: string; cost: number }
  | { type: 'boost_result'; text: string; outcome: 'success' | 'fail' }
  | { type: 'salesman' }
  | { type: 'gamedex'; year: number }
  | { type: 'disaster'; text: string }
  | { type: 'ready_to_release'; text: string }
  | { type: 'release_result'; text: string }
  | { type: 'info'; title: string; text: string }
  /** PLAN-39: мини-игра на 50% разработки; gameId добирает сервер из мешка аккаунта */
  | { type: 'minigame'; gameId: string }
  /** PLAN-44: сюжетная линия — ждём выбор игрока (текст шага рендерит UI из STORY_ARCS) */
  | { type: 'story'; arcId: string; step: number }
  /** PLAN-49: сага «Синяя Комета» — выбор/итог главы/эпилог (детали — в state.saga) */
  | { type: 'saga'; node: string; stage: 'choice' | 'result' | 'final' | 'end'; chosen?: number }
  /** 05-P2-6: итог партии после завершения истории (детали — в state.finale) */
  | { type: 'finale' }
  /** PLAN-52 M2b: ТВ — предложение канала или итоги сезона (детали — в state.tv) */
  | { type: 'tv'; stage: 'offer' | 'result' }
  | null;

/** PLAN-24: сохраняемый вид рабочего стола (фон + раскладка окон). Игровая логика его не читает. */
export interface UiState {
  /** id обоев из public/wallpapers или null (обычный бирюзовый стол) */
  wallpaper?: string | null;
  windows?: UiWindow[];
  /** расстановка иконок на столе: id приложения → координаты верхнего левого угла */
  icons?: Record<string, { x: number; y: number }>;
  /** M3.8: уровень эффектов экрана разработки; не задан — авто (prefers-reduced-motion) */
  fx?: 'min' | 'mid' | 'full';
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

/** PLAN-52 M1: франшиза — игра с оценкой 80+ и её продолжения; живёт в «Империи» (медиа-империя, этап 1). */
/** PLAN-52 M2: линия мерча — эпохи: фигурки → плюш → футболки → карточки */
export type MerchLineId = 'figures' | 'plush' | 'shirts' | 'cards';
/** PLAN-52 M2: вложения при запуске линии (скромно/нормально/солидно) */
export type MerchBudgetId = 'low' | 'norm' | 'high';
/** PLAN-52 M2: редкость карточки в паке */
export type CardRarity = 'common' | 'rare' | 'legend';

export interface Franchise {
  /** имя франшизы — имя первой игры серии (далее не меняется) */
  name: string;
  genreId: string;
  typeId: string;
  /** сила бренда 0..100 (дробная внутри; в UI округляется) */
  brand: number;
  bornWeek: number;
  /** последний релиз серии (для расчёта забвения) */
  lastReleaseWeek: number;
  releases: { name: string; week: number; score: number }[];
  /** запущенная линия мерча: тип, вложения, дата старта (или null) */
  merch: { startedWeek: number; line: MerchLineId; budget: MerchBudgetId } | null;
  /** сколько полных лет забвения уже списано (защита от повторного списания) */
  decayed: number;
  /** PLAN-52 M2b: день последнего эфира сериала по франшизе (освежает забвение) */
  lastShowWeek?: number;
}

/** PLAN-52 M2: паки коллекционных карточек — кулдаун и последнее вскрытие (мини-окно в «Империи») */
export interface CardPackState {
  /** неделя последнего вскрытия (−9999 = ещё не открывали пак) */
  lastWeek: number;
  /** последнее вскрытие — мини-окно показывается, пока игрок его не подтвердит */
  last: {
    week: number;
    franchiseKey: string;
    /** карты пака: редкость + имя игры серии (на коллекционной карточке) */
    cards: { rarity: CardRarity; name: string }[];
    fansGained: number;
    brandGained: number;
    acked: boolean;
  } | null;
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
  /** M6: уровень сложности партии (сохраняется в сейве; старые сейвы без поля — «нормальный») */
  difficulty?: DifficultyId;
  /** M7: текущий список поиска сотрудников (живёт до следующего поиска; хранится в сейве) */
  activeSearch?: { method: HireMethodId; ids: string[]; week: number };
  genreLevels: Record<string, number>;
  typeLevels: Record<string, number>;
  consoles: Record<string, ConsoleState>;
  awards: { grand: number; design: number; music: number; runnerUp: number; worst: number };
  emergencyFundUsed: boolean;
  bankrupt: boolean;
  pendingEvent: PendingEvent;
  /** PLAN-44: сюжетные линии (миграция v11; у очень старых сейвов пересоздастся в migrate) */
  story?: StoryState;
  /** PLAN-49: сага «Синяя Комета» — скрытая главная линия партии */
  saga?: SagaState;
  /** аудит-51 05-P2-6: финал партии — счёт по активам и свободная игра после истории */
  finale?: FinaleState;
  /** 05-P2-6: письмо двадцатилетия отправлено (не слать повторно; старым сейвам — миграция) */
  anniversary20?: boolean;
  /** отложенный попап результата действия (показывается после текущего события) */
  lastPopup: PopupInfo | null;
  log: LogEntry[];
  rngState: number;
  year: number; // 1-based

  // ─── M3 ───
  salesmanHere: boolean; // продавец в офисе (май, с года 2)
  boosterPurchases: Record<string, number>; // тип бустера → куплено раз (цены растут)
  boosterCharges: Record<string, number>; // тип бустера → куплено и ещё не применено (аудит-51: расходник применения)
  careerManuals: number; // запас руководств по смене профессии (продавец; применяются в «Найм» → «Профессии»)
  unlockedTrainings: string[]; // тренинги, пройденные хотя бы раз (анлок типов)
  releasePopupShown: boolean; // попап «игра готова» уже показан для текущей игры
  introShown?: boolean; // аудит-51 P1-11: онбординг новой партии (false = показать; у старых сейвов нет — не показываем)
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
  /** PLAN-48: вечная рента партнёра — % от продаж игр (после расставания через долю) */
  partnerRentPct?: number;
  /** PLAN-52 M1: франшизы (медиа-империя; у старых сейвов выводится из history в migrate v19) */
  franchises?: Record<string, Franchise>;
  /** PLAN-52 M2: паки карточек (доступны с линией «карточки», с 1996) */
  cards?: CardPackState;
  /** PLAN-52 M2b: телевидение — предложения каналов и сезоны мультсериалов (миграция v21) */
  tv?: TvState;
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
