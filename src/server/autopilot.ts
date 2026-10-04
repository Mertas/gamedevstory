// Автопилот (plan/14): серверная логика — валидация решения LLM, контекст решения,
// политика авто-резолва событий, и AutopilotController (SRV-22) — оркестрация сессии:
// «театр» событий, обсуждение→решение, таймаут плана.
import { CONFIG } from '../core/config';
import type { HireMethodId } from '../core/config';
import { GENRES, TYPES, CONSOLES, TRAININGS, ADS, STAFF, genreById, typeById } from '../core/data/db';
import { startProjectAction } from '../core/engine';
import { HIRE_METHOD_LABELS } from '../shared/hire';
import { consoleAvailable, consoleDataFor } from '../core/systems/dev';
import { autopilotProjectInput, comboCostK, sequelOpportunity, type PolicyAction, resolvePendingEvent } from '../core/sim/policy';
import { createPlayer, type PolicyStats } from '../core/sim/policy';
import { DIRECTION_LABELS, DIRECTION_ORDER } from '../core/types';
import type { GameRecord, GameState, StartProjectInput } from '../core/types';
import { topUpDirection, type AutopilotPlan, type AutopilotStep } from '../shared/autopilot';
import type { ChatState } from '../shared/chat';
import { buildDecisionPrompt, parseDecision } from './chatgen';
import type { ChatThread } from './game';
import type { LlmFn } from './giga';
import { score100 } from '../shared/rules';

/** AP-08: в затишье команда перекидывается репликой не чаще этого интервала (реальное время, мс). */
const IDLE_CHAT_MS = 90_000;

/** Проверка решения LLM по правилам игры; null = ок, иначе текст ошибки. */
export function validateDecision(plan: AutopilotPlan, state: GameState): string | null {
  const genre = GENRES.find((g) => g.id === plan.genreId);
  const type = TYPES.find((t) => t.id === plan.typeId);
  const consoleData = CONSOLES.find((c) => c.id === plan.consoleId);
  if (!genre) return `неизвестный жанр ${plan.genreId}`;
  if (!type) return `неизвестный тип ${plan.typeId}`;
  if (!consoleData) return `неизвестная консоль ${plan.consoleId}`;
  // анлоки жанра/типа — как в policy.pickBestCombo
  if (genre.unlockJob && genre.unlockLevel) {
    if (!state.staff.some((s) => (s.careers[genre.unlockJob as keyof typeof s.careers] ?? 0) >= genre.unlockLevel!)) {
      return `жанр ${plan.genreId} не открыт`;
    }
  }
  if (type.unlockJob && type.unlockLevel) {
    if (!state.staff.some((s) => (s.careers[type.unlockJob as keyof typeof s.careers] ?? 0) >= type.unlockLevel!)) {
      return `тип ${plan.typeId} не открыт`;
    }
  }
  if (type.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(type.unlockTraining!.toLowerCase()))) {
    return `тип ${plan.typeId} требует тренинг ${type.unlockTraining}`;
  }
  if (!state.consoles[plan.consoleId]?.licensed) return `консоль ${plan.consoleId} не куплена`;
  if (!consoleAvailable(state, plan.consoleId)) return `консоль ${plan.consoleId} недоступна`;
  if (!(plan.mode in CONFIG.MODE)) return `неизвестный режим ${plan.mode}`;
  // упор направления: только известные оси, целые 0..8, сумма в пределах бюджета игры
  const dirAxes = new Set(['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish']);
  let dirSpent = 0;
  for (const [axis, v] of Object.entries(plan.direction ?? {})) {
    if (!dirAxes.has(axis)) return `неизвестная ось направления ${axis}`;
    if (!Number.isInteger(v) || v < 0 || v > 8) return `ось ${axis}: нужно целое 0..8 (дано ${String(v)})`;
    dirSpent += v;
  }
  if (dirSpent > state.directionPoints) return `очки направления перерасходованы (${dirSpent} > ${state.directionPoints})`;
  if (!state.staff.some((s) => s.id === plan.proposalStaffId)) return `нет сотрудника ${plan.proposalStaffId}`;
  const known = new Set(state.staff.map((s) => s.id));
  // одна роль на человека: сценарист тоже занят (движок добавит его в proposal сам),
  // дубль в ролях визард всё равно не сможет показать — раньше он молча «съезжал»
  const assigned = new Set<string>();
  for (const ids of Object.values(plan.assignments ?? {})) {
    for (const id of ids) {
      if (!known.has(id)) return `неизвестный сотрудник в ролях: ${id}`;
      if (id === plan.proposalStaffId) return `сценарист ${id} не может быть в другой роли (одна роль на человека)`;
      if (assigned.has(id)) return `сотрудник ${id} в двух ролях (одна роль на человека)`;
      assigned.add(id);
    }
  }
  const cost = comboCostK(state, plan.genreId, plan.typeId, plan.consoleId, plan.mode);
  if (cost > state.money) return `денег не хватает (нужно ${Math.round(cost)}K)`;
  return null;
}

/** Контекст для LLM-решения: команда, деньги, открытые жанры/типы, топ комбо, консоли, бюджет упора. */
export function buildDecisionContext(state: GameState): {
  team: string;
  money: number;
  research: number;
  office: number;
  genres: string;
  types: string;
  consoles: string;
  directionPoints: number;
  sequel?: string;
  /** AP-04: свежие письма фанатов (настроение по играм) — влияют на выбор жанра */
  fans?: string;
  /** 16: последние релизы студии — «история», человеческий мотив выбора */
  history?: string;
  /** 16: прошлый проект (жанр/тип/режим) — команда помнит, о чём говорила */
  lastProject?: string;
} {
  const unlockedGenres = GENRES.filter((g) => {
    if (g.unlockJob && g.unlockLevel) {
      return state.staff.some((s) => (s.careers[g.unlockJob as keyof typeof s.careers] ?? 0) >= g.unlockLevel!);
    }
    return true;
  });
  const unlockedTypes = TYPES.filter((t) => {
    if (t.unlockJob && t.unlockLevel) {
      if (!state.staff.some((s) => (s.careers[t.unlockJob as keyof typeof s.careers] ?? 0) >= t.unlockLevel!)) return false;
    }
    if (t.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(t.unlockTraining!.toLowerCase()))) return false;
    return true;
  });
  const licensed = CONSOLES.filter((c) => state.consoles[c.id]?.licensed && consoleAvailable(state, c.id));
  // 16: история студии и прошлый проект — человеческие мотивы выбора (таблица комбо убрана)
  const historyLine = state.history.slice(-3).map((h) => {
    const hg = genreById(h.genreId);
    const ht = typeById(h.typeId);
    return `«${h.name}» — ${hg?.ru ?? hg?.name ?? h.genreId} × ${ht?.nameRu ?? ht?.name ?? h.typeId}, ${score100(h.score)}/100`;
  }).join('; ');
  const lastProjectLine = state.lastGenreId && state.lastTypeId
    ? `${genreById(state.lastGenreId)?.ru ?? state.lastGenreId} × ${typeById(state.lastTypeId)?.nameRu ?? state.lastTypeId} (режим ${state.lastMode ?? 'normal'})`
    : undefined;
  // AP-05: подсказка о сиквеле — комбо с лучшим результатом в зале славы (если жанр/тип ещё открыты)
  const seq = sequelOpportunity(state);
  const seqGenre = seq ? unlockedGenres.find((g) => g.id === seq.genreId) : undefined;
  const seqType = seq ? unlockedTypes.find((t) => t.id === seq.typeId) : undefined;
  const sequelLine = seq && seqGenre && seqType
    ? `«${seqGenre.ru ?? seqGenre.name} × ${seqType.nameRu ?? seqType.name}» — ${score100(seq.score)}/100`
    : undefined;
  // AP-04: свежие письма фанатов — команда их «читает»: разгром меняет жанр, восторг зовёт в сиквел
  const recentMail = state.mail.slice(-3);
  const fans = recentMail.length
    ? recentMail
        .map((l) => `${l.sentiment === 'love' ? 'восторг' : l.sentiment === 'hate' ? 'разгром' : 'нейтрально'} — «${l.gameName}»`)
        .join('; ')
    : undefined;
  return {
    team: state.staff.map((s) => {
      const persona = s.persona ?? STAFF.find((d) => d.id === s.id)?.persona;
      return `${s.name} (${s.activeCareer} Lv${s.careers[s.activeCareer] ?? 0}, ${s.gender === 'F' ? 'ж' : 'м'}, id:${s.id}${persona ? `; личность: ${persona}` : ''})`;
    }).join('; '),
    money: Math.round(state.money),
    research: Math.round(state.research),
    office: state.officeLevel,
    genres: unlockedGenres.map((g) => `${g.id}="${g.ru ?? g.name}"`).join(', '),
    types: unlockedTypes.map((t) => `${t.id}="${t.nameRu ?? t.name}"`).join(', '),
    consoles: licensed.map((c) => `${c.id}="${c.name}"`).join(', '),
    directionPoints: state.directionPoints,
    sequel: sequelLine,
    fans,
    history: historyLine || undefined,
    lastProject: lastProjectLine,
  };
}

/** Привести упор к бюджету партии. Перерасход ужимаем по одному с самой большой оси
 *  (топ-оси упора сохраняются), недобор добиваем до полного пула (topUpDirection):
 *  автопилот распределяет ВСЕ доступные очки — свободных не остаётся. */
export function fitDirection(plan: AutopilotPlan, directionPoints: number): void {
  const dir = plan.direction ?? {};
  const axes = Object.keys(dir);
  let spent = Object.values(dir).reduce((a, b) => a + b, 0);
  while (spent > directionPoints && axes.length) {
    let top = axes[0]!;
    for (const a of axes) if ((dir[a] ?? 0) > (dir[top] ?? 0)) top = a;
    if ((dir[top] ?? 0) <= 0) break;
    dir[top] = (dir[top] ?? 0) - 1;
    spent--;
  }
  topUpDirection(dir, directionPoints, DIRECTION_ORDER);
}

/** Политика автопилота: резолвит события и выпускает готовые игры, НО не стартует
 * проекты сам (решение — за чатом). Внутри — обычный «разумный игрок» из sim/policy. */
export function createAutopilotPolicy(): { turn(state: GameState, journal?: PolicyAction[]): void; stats: PolicyStats } {
  // SRV-04: политика резолвит события и выпускает игры, но НЕ стартует проекты (это делает чат)
  const player = createPlayer({ resolveOnly: true });
  const stats: PolicyStats = { hires: 0, fires: 0, releases: 0, boostAccepts: 0, licenses: 0 };
  return {
    stats,
    turn(state: GameState, journal?: PolicyAction[]): void {
      // вызываем только когда есть что резолвить (событие) или готово к релизу —
      // иначе политика сама стартовала бы свои проекты вместо решений чата
      const busy = !!state.pendingEvent || (state.activeGame?.phase === 'debug' && state.activeGame.bugs <= 5);
      if (!busy) return;
      player.turn(state, stats, journal);
    },
  };
}

/** Видимость автопилота (план «все действия видны»): журнал политики → шаги хореографии.
 *  Действие уже применено сервером — финальные нажатия «витринные» (cosmetic), чтобы
 *  повторный клик не применил тренинг/найм/рекламу во второй раз. */
export function policySteps(journal: PolicyAction[], state: GameState): AutopilotStep[] {
  const steps: AutopilotStep[] = [];
  let app = '';
  let tab = '';
  let lastHireMethod: HireMethodId | null = null; // M7: радио «тип поиска» жмём один раз на метод
  const openApp = (a: string): void => {
    if (app !== a) {
      steps.push({ kind: 'open', app: a });
      app = a;
      tab = '';
    }
  };
  const goTab = (t: 'team' | 'training' | 'salesman'): void => {
    if (tab !== t) {
      const label = t === 'team' ? 'Команда' : t === 'training' ? 'Обучение' : 'Продавец';
      steps.push({ kind: 'click', target: `hire-tab-${t}`, label: `Вкладка «${label}»`, quick: true });
      tab = t;
    }
  };
  for (const a of journal) {
    if (a.type === 'levelup') {
      openApp('hire');
      goTab('team');
      const name = state.staff.find((s) => s.id === a.staffId)?.name ?? 'сотруднику';
      steps.push({ kind: 'click', target: `lvl-${a.staffId}`, label: `Повышаю уровень: ${name}`, quick: true });
    } else if (a.type === 'train') {
      openApp('hire');
      goTab('training');
      const name = state.staff.find((s) => s.id === a.staffId)?.name ?? 'сотрудника';
      steps.push({ kind: 'card', staffId: a.staffId, app: 'hire', label: `Тренинг для: ${name}` });
      const t = TRAININGS.find((x) => x.id === a.trainingId);
      steps.push({ kind: 'click', target: `train-${a.trainingId}`, label: `Тренинг: ${t?.nameRu ?? t?.name ?? a.trainingId}`, quick: true });
    } else if (a.type === 'ad') {
      openApp('marketing');
      const ad = ADS.find((x) => x.id === a.adId);
      steps.push({ kind: 'click', target: `ad-${a.adId}`, label: `Реклама: ${ad?.nameRu ?? ad?.name ?? a.adId}`, quick: true });
    } else if (a.type === 'office') {
      openApp('hire');
      goTab('team');
      steps.push({ kind: 'click', target: 'office-move', label: 'Переезжаю в новый офис', quick: true });
    } else if (a.type === 'search' || a.type === 'hire') {
      openApp('hire');
      goTab('team');
      // M7: сначала платный поиск (без него списка кандидатов нет), клик «Искать» — витринный:
      // действие уже применено сервером, повторный настоящий клик списал бы деньги ещё раз
      if (a.method && a.method !== lastHireMethod) {
        steps.push({ kind: 'click', target: `hire-method-${a.method}`, label: `Тип поиска: ${HIRE_METHOD_LABELS[a.method]}`, quick: true });
        lastHireMethod = a.method;
      }
      if (a.type === 'search') {
        steps.push({ kind: 'click', target: 'hire-search', label: 'Ищу кандидатов', quick: true, cosmetic: true });
      }
      if (a.type === 'hire' && a.staffId) {
        const name = STAFF.find((s) => s.id === a.staffId)?.name ?? a.staffId; // кандидат ещё не в штате — имя из справочника
        steps.push({ kind: 'click', target: `hire-${a.staffId}`, label: `Принимаю в команду: ${name}`, quick: true });
      }
    } else if (a.type === 'fire') {
      // AP-09: увольнение видно — имя из журнала (сотрудника в штате уже нет)
      openApp('hire');
      goTab('team');
      const name = a.name ?? state.staff.find((s) => s.id === a.staffId)?.name ?? 'сотрудника';
      steps.push({ kind: 'click', target: `fire-${a.staffId}`, label: `Увольняю: ${name}`, quick: true });
    } else if (a.type === 'license') {
      openApp('hardware');
      const c = CONSOLES.find((x) => x.id === a.consoleId);
      steps.push({ kind: 'click', target: `lic-${a.consoleId}`, label: `Лицензия: ${c?.name ?? a.consoleId}`, quick: true });
    } else if (a.type === 'booster') {
      openApp('hire');
      goTab('salesman');
      steps.push({ kind: 'click', target: `booster-${a.boosterType}`, label: `Беру бустер (${a.boosterType})`, quick: true });
      // применение — в окне «Код» (панель «Бустеры»): выбрать сотрудника и нажать
      openApp('code');
      const name = state.staff.find((s) => s.id === a.staffId)?.name ?? 'сотрудника';
      steps.push({ kind: 'select', target: 'booster-staff', value: a.staffId, label: `Бустер — ${name}` });
      steps.push({ kind: 'click', target: `booster-use-${a.boosterType}`, label: 'Применяю бустер', quick: true });
    }
  }
  return steps;
}

export { autopilotProjectInput };

/** «Упор: Нишевость 6, Инновация 4» — на что чат решил сделать упор (видно игроку). */
function dirSummary(direction: Record<string, number>): string {
  const parts = DIRECTION_ORDER.filter((a) => (direction[a] ?? 0) > 0).map((a) => `${DIRECTION_LABELS[a]} ${direction[a]}`);
  return parts.length ? `Упор: ${parts.join(', ')}.` : 'Без упора в направлении.';
}

/** Всё, что контроллеру автопилота нужно от сессии (GameServer подходит структурно). */
export interface AutopilotHost {
  game: GameState;
  chat: ChatState;
  llm: LlmFn;
  autopilotOn: boolean;
  /** AP-07: текущая скорость игры — автопилот держит ускоренный темп и меняет его сам */
  speed: number;
  /** AP-07: смена скорости на хосте (валидация/эмит/перезапуск тикера — там же) */
  setSpeed(v: number): void;
  decidedThisIdle: boolean;
  pendingPlan: AutopilotPlan | null;
  chatThread: ChatThread | null;
  emit(): void;
  emitStep(s: AutopilotStep): void;
  pushSystem(text: string): void;
  /** 16: реплики обсуждения из решения — в очередь чата */
  publishDiscussion(lines: { author: string; text: string }[]): void;
  generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void>;
  /** PLAN-26: журнал промахов (клиент не отыграл шаги — писал сам сервер) */
  logAutopilot?(entry: Record<string, unknown>): void;
}

/** Оркестрация автопилота (SRV-22): «театр» событий, обсуждение→решение, таймаут плана. */
// SER-22: чем команда занята, пока автопилот ждёт нормальный ответ GigaChat.
const IDLE_FUN = [
  'Может, по кофе? Тут за углом новый автомат.',
  'Пока решаем — зарубимся в «Космических пиратов»?',
  'Перекур! Кто со мной на балкон?',
  'Я принёс настолки: «Колонизаторы», кто со мной?',
  'Хватит думать — пойдём в аркаду напротив, у меня жетоны остались.',
  'Чай? Печеньки у Декстера в тумбочке, я видел.',
  'Ставлю на то, что следующий проект будет про животных.',
  'Пятнадцать минут отдыха — и мы снова гении.',
  'Кто помнит, где мой стикер-пак с котиками? Показать?',
  'А давайте в пятницу пиццу за счёт студии?',
  'Поймал себя на мысли, что придумываю игру про перекуры.',
  'Разомнёмся? Я знаю упражнение для пальцев программиста.',
];

export class AutopilotController {
  private readonly policy = createAutopilotPolicy();
  private deciding = false; // LLM-решение в процессе
  private pendingDecision = false; // ждём конца обсуждения, чтобы вызвать решение
  private pendingPlanDeadline = 0; // дедлайн самостоятельного старта, если клиент не нажал «Начать»
  private lastHadActiveGame = false; // переход activeGame→null сбрасывает decidedThisIdle
  private pendingEventSince: number | null = null; // «театр»: попап висит ~2.6с
  private policyDeadline = 0; // PLAN-25: дедлайн, к которому клики мыши должны применить «хозяйство»
  private decisionEpoch = 0; // SRV-03: отмена решений автопилота (take_control во время LLM-запроса)
  private speedBefore = 1; // AP-07: скорость до включения автопилота (в неё вернём контроль)
  private autoTarget = 1; // AP-12: темп задаёт игрок (AP-07 разгонял до 4× — убрано)
  private loweredForEvent = false; // AP-07: мы сами уронили до 1× ради драматургии события
  private idleChatAt = 0; // AP-08: когда последний раз болтали просто так (реальное время)
  private session: { historyLen: number; money: number } | null = null; // AP-03: снимок на старте автосессии

  constructor(private readonly h: AutopilotHost) {}

  /** Куда и что нажимает виртуальная мышь для текущего события (театр). */
  private eventTarget(): { target: string; label: string } {
    const ev = this.h.game.pendingEvent;
    switch (ev?.type) {
      case 'boost': return { target: 'mb-accept', label: 'Принять улучшение' };
      case 'ready_to_release': return { target: 'mb-release', label: 'Выпустить игру' };
      case 'gamedex': return { target: 'mb-none', label: 'Не участвовать' };
      case 'salesman': return { target: 'mb-ok', label: 'Заглянуть' };
      default: return { target: 'mb-ok', label: 'Ок' };
    }
  }

  /** Ручное включение автопилота (кнопка «Отдать управление»): команда берётся за дело сама. */
  startAutopilot(): void {
    if (this.h.autopilotOn) return;
    this.h.autopilotOn = true;
    this.h.decidedThisIdle = false;
    this.pendingDecision = false;
    this.idleChatAt = Date.now(); // AP-08: первая реплика в затишье — не сразу после старта
    // AP-03: снимок для «Итогов автосессии» — что команда успеет, пока босс отдыхает
    this.session = { historyLen: this.h.game.history.length, money: this.h.game.money };
    // AP-12: темп задаёт игрок — автопилот НЕ разгоняет до 4× (как было в AP-07).
    // Поднимаем только паузу (0 → 1×), иначе команда физически не может играть;
    // уже разогнанные 8× тоже не сбавляем.
    this.speedBefore = this.h.speed;
    this.autoTarget = Math.max(1, this.h.speed);
    if (this.h.speed < this.autoTarget) this.h.setSpeed(this.autoTarget);
    const heroNow = this.h.game.staff.find((s) => s.hero);
    this.h.pushSystem(heroNow ? `🤖 ${heroNow.name} передаёт команде управление — решаем сами!` : '🤖 Босс передаёт команде управление — решаем сами!');
    this.h.emitStep({ kind: 'open', app: 'chat' }); // обсуждение должно быть ВИДНО
    this.h.emit();
  }

  /** Выключение автопилота: босс снова у руля; silent — без реплики «Босс вернулся» */
  stopAutopilot(silent: boolean): void {
    this.h.autopilotOn = false;
    this.decisionEpoch++; // SRV-03: in-flight runDecision потеряет право ставить план
    this.h.pendingPlan = null;
    this.pendingPlanDeadline = 0;
    this.deciding = false;
    this.pendingDecision = false;
    this.h.decidedThisIdle = false;
    this.pendingEventSince = null;
    // AP-07: вернуть человеческий темп — но только если автопилот его сам и держал
    this.loweredForEvent = false;
    if (this.h.speed === this.autoTarget && this.h.speed !== this.speedBefore) this.h.setSpeed(this.speedBefore);
    if (!silent) {
      // AP-03: экран «Итоги автосессии» — команда отчитывается за время у руля
      const summary = this.sessionSummary();
      if (summary) {
        if (this.h.game.pendingEvent) this.h.game.lastPopup = summary; // не перебиваем открытый попап
        else this.h.game.pendingEvent = { type: 'info', ...summary };
      }
      const heroBack = this.h.game.staff.find((s) => s.hero);
      this.h.pushSystem(`🧑‍💼 ${heroBack ? heroBack.name : 'Босс'} снова у руля! Команда спешно делает вид, что всё это время усердно работала.`);
      void this.h.generatePhase('boss_back');
    }
    this.session = null;
    this.h.emit();
  }

  /** AP-08: редкая реплика в простое — только когда чат полностью молчит и ничего не решается. */
  private maybeIdleChat(): void {
    const g = this.h.game;
    if (!g.activeGame || g.pendingEvent) return; // событие на экране — не до болтовни
    if (this.deciding || this.pendingDecision || this.h.pendingPlan) return;
    if (this.h.chatThread || this.h.chat.queue.length > 0) return; // команда ещё говорит — не перебиваем
    const now = Date.now();
    if (now - this.idleChatAt < IDLE_CHAT_MS) return;
    this.idleChatAt = now;
    void this.h.generatePhase('idle');
  }

  /** AP-03: «Итоги автосессии» для экрана после возвращения управления. */
  private sessionSummary(): { title: string; text: string } | null {
    if (!this.session) return null;
    const g = this.h.game;
    const released = g.history.slice(this.session.historyLen);
    const delta = Math.round(g.money - this.session.money);
    // сессию включили и тут же выключили (или ничего не случилось) — рассказывать нечего,
    // а попап-пауза зря замерла бы на экране
    if (!released.length && delta === 0) return null;
    const best = released.reduce<GameRecord | null>((a, b) => (a && a.score >= b.score ? a : b), null);
    const avg = released.length ? Math.round(released.reduce((s, r) => s + r.score, 0) / released.length) : 0;
    const lines = [
      released.length ? `Игр выпущено: ${released.length}` : 'Игр выпущено: 0 — команда только разминалась.',
      released.length ? `Средний счёт: ${score100(avg)}/100` : '',
      best ? `Лучшая: «${best.name}» — ${score100(best.score)}/100${best.score >= CONFIG.HALL_OF_FAME ? ' — зал славы!' : ''}` : '',
      `Деньги: ${delta >= 0 ? '+' : ''}${delta}K (${Math.round(this.session.money)}K → ${Math.round(g.money)}K)`,
    ].filter(Boolean);
    return { title: '🤖 Итоги автосессии', text: lines.join('\n') };
  }

  /** PLAN-25: клиент отыграл хореографию политики — откат не нужен. */
  autopilotStepsDone(): void {
    this.policyDeadline = 0;
  }

  maybeAutopilot(): void {
    const g = this.h.game;
    // (0) автопилот включается ТОЛЬКО кнопкой «Отдать управление» (таймаут простоя убран):
    // без явного включения виртуальная мышь и чат не работают — игра ждёт босса
    if (!this.h.autopilotOn) return;

    // (1) «театр» событий: попап висит ~2.6с реального времени — мышь (медленный полёт
    // ~1.2с + поиск элемента) успевает нажать; не успела — политика резолвит сама,
    // автопилот работает и без клиента
    if (g.pendingEvent) {
      // AP-07: событие — это драматургия: тормозим до 1×, чтобы попап и чат «сыграли» вживую
      if (!this.loweredForEvent && this.h.speed > 1) {
        this.loweredForEvent = true;
        this.h.setSpeed(1);
      }
      if (this.pendingEventSince === null) {
        this.pendingEventSince = Date.now();
        const t = this.eventTarget();
        this.h.emitStep({ kind: 'click', target: t.target, label: t.label });
      } else if (Date.now() - this.pendingEventSince >= 2600) {
        const journal: PolicyAction[] = [];
        // PLAN-25: «хозяйство» политика решает на КОПИИ состояния, событие резолвим на реальном.
        // Действия применят РЕАЛЬНЫЕ клики мыши (шаги ниже) — иначе игрок видел результат до клика
        // («сначала левелапит, а потом нажимает кнопку»). Нет клиента — откат по дедлайну ниже.
        this.policy.turn(structuredClone(g), journal);
        if (g.pendingEvent) resolvePendingEvent(g, this.policy.stats);
        this.pendingEventSince = null;
        if (journal.length) {
          this.policyDeadline = Date.now() + journal.length * 3000 + 8000;
          for (const s of policySteps(journal, g)) this.h.emitStep(s);
        }
        this.h.emit();
      }
    } else {
      this.pendingEventSince = null;
      // AP-07: событие закрылось — если темп роняли мы, возвращаем ускорение
      if (this.loweredForEvent) {
        this.loweredForEvent = false;
        if (this.h.speed === 1) this.h.setSpeed(this.autoTarget);
      }
    }

    // (2) обсуждение в чате → LLM-решение (один запрос со всеми параметрами)
    // сброс decidedThisIdle: активная игра только что закончилась (релиз) → следующий
    // раунд простоя снова решает чат (релиз политикой идёт мимо handle(), поэтому
    // сбрасываем по переходу activeGame → null, а не по действию)
    const hasActive = !!g.activeGame;
    if (!hasActive && this.lastHadActiveGame) this.h.decidedThisIdle = false;
    this.lastHadActiveGame = hasActive;
    if (
      !g.activeGame && !g.pendingEvent && !this.h.pendingPlan &&
      !this.deciding && !this.pendingDecision && !this.h.decidedThisIdle
    ) {
      this.h.decidedThisIdle = true;
      this.h.emitStep({ kind: 'open', app: 'chat' }); // обсуждение видно: решение принесёт и реплики (16)
      this.pendingDecision = true;
    }
    if (this.pendingDecision && !this.h.chatThread && !this.deciding) void this.runDecision();

    // (3) таймаут плана: клиент не успел/не смог нажать «Начать» — стартуем сами
    if (this.h.pendingPlan && !g.activeGame && !g.pendingEvent && Date.now() > this.pendingPlanDeadline) {
      const plan = this.h.pendingPlan;
      this.h.pendingPlan = null;
      let res = startProjectAction(g, plan as StartProjectInput);
      if (!res.ok) {
        const fb = autopilotProjectInput(g);
        if (fb) res = startProjectAction(g, fb);
      }
      this.h.emit();
    }

    // (4) PLAN-25: клиент не отыграл хореографию (нет браузера/завис) — доводим хозяйство сами
    if (this.policyDeadline && Date.now() > this.policyDeadline) {
      this.policyDeadline = 0;
      // PLAN-26: клиент не отыграл хореографию — сигнал в журнал (иначе такие случаи невидимы)
      this.h.logAutopilot?.({
        kind: 'deadline-fallback',
        target: null,
        label: 'клиент не отыграл шаги за дедлайн — хозяйство применил сервер',
        dom: null,
        recent: [],
      });
      const journal: PolicyAction[] = [];
      this.policy.turn(g, journal);
      if (journal.length) for (const s of policySteps(journal, g)) this.h.emitStep(s);
      this.h.emit();
    }

    // (5) AP-08: затишье — редкая реплика команды, чтобы паузы в чате оживали
    this.maybeIdleChat();
  }

  /** Решение LLM: какую игру делать. Невалидно/молчит — детерминированный фолбэк. */
  private async runDecision(): Promise<void> {
    this.pendingDecision = false;
    this.deciding = true;
    // SRV-03: снимок эпохи — «Взять управление» во время LLM-запроса отменяет решение
    const epoch = this.decisionEpoch;
    const cancelled = (): boolean => !this.h.autopilotOn || epoch !== this.decisionEpoch;
    const announce = (plan: AutopilotPlan): void => {
      if (cancelled()) return;
      this.h.pendingPlan = plan;
      // клиентская хореография визарда — десятки реальных кликов (~15–35с) + генерация
      // сюжета (до 25с ожидания LLM); фолбэк стартует сам только если клиента нет/завис
      this.pendingPlanDeadline = Date.now() + 120000;
      this.h.emitStep({ kind: 'open', app: 'code' });
      // «plan» включает ВСЮ хореографию визарда, включая финальный клик «Начать»
      this.h.emitStep({ kind: 'plan', plan });
    };
    try {
      const ctx = buildDecisionContext(this.h.game);
      // SER-22: ждём НОРМАЛЬНЫЙ ответ GigaChat — на пустых/битых ответах тихо повторяем. Никаких
      // системных сообщений об ошибках: команда в это время живёт своей жизнью (перекуры, кофе).
      const startedAt = Date.now();
      let attempt = 0;
      let lastFunAt = 0;
      let final: NonNullable<ReturnType<typeof parseDecision>> | null = null;
      while (!cancelled()) {
        attempt++;
        try {
          // 16: обсуждение и решение — из ОДНОГО ответа команды: что решили, то и применяется
          const { text } = await this.h.llm(buildDecisionPrompt(ctx), 900);
          if (cancelled()) return;
          const p = parseDecision(text);
          const pl = p?.plan ?? null;
          if (pl) fitDirection(pl, this.h.game.directionPoints);
          const err = pl ? validateDecision(pl, this.h.game) : 'не удалось разобрать JSON';
          if (!err && pl && p) {
            final = p;
            break;
          }
          console.log(`[gds] автопилот: ответ не принят (попытка ${attempt}):`, err ?? 'null');
        } catch (e) {
          console.log(`[gds] автопилот: ответ не получен (попытка ${attempt}):`, String(e).slice(0, 140));
        }
        const waited = Date.now() - startedAt;
        if (waited > 12_000 && Date.now() - lastFunAt > 20_000) {
          lastFunAt = Date.now();
          this.postIdleFun();
        }
        if (waited > 30 * 60_000) break; // страховка: полчаса ожидания — решаем сами, объявим как обычное
        await new Promise((r) => setTimeout(r, Math.min(15_000, 3000 + attempt * 1500)));
      }
      if (final && final.plan && !cancelled()) {
        const plan = final.plan;
        const genre = genreById(plan.genreId);
        const type = typeById(plan.typeId);
        const con = consoleDataFor(this.h.game, plan.consoleId);
        if (cancelled()) return;
        // реплики обсуждения — из того же ответа: чат и решение не могут разойтись
        const team = new Set(this.h.game.staff.map((s) => s.name));
        const lines = final.messages.filter((m) => team.has(m.author));
        if (lines.length) this.h.publishDiscussion(lines);
        const namePart = plan.name ? `«${plan.name}» — ` : '';
        this.h.pushSystem(`📋 Решено: ${namePart}«${genre?.ru ?? genre?.name ?? plan.genreId} × ${type?.nameRu ?? type?.name ?? plan.typeId}» на ${con?.name ?? plan.consoleId}. ${dirSummary(plan.direction)}`);
        announce(plan);
      } else if (!cancelled()) {
        const fb = autopilotProjectInput(this.h.game);
        if (fb) announce(fb); // страховочный выбор — без системных сообщений об ошибке
      }
    } finally {
      this.deciding = false;
      this.h.emit();
    }
  }

  /** SER-22: пока ждём нормальный ответ GigaChat, команда коротает время по-человечески. */
  private postIdleFun(): void {
    const staff = this.h.game.staff;
    if (staff.length === 0) return;
    const who = staff[Math.floor(Math.random() * staff.length)]!;
    const line = IDLE_FUN[Math.floor(Math.random() * IDLE_FUN.length)]!;
    this.h.publishDiscussion([{ author: who.name, text: line }]);
  }
}
