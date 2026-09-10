// Автопилот (plan/14): серверная логика — валидация решения LLM, контекст решения,
// политика авто-резолва событий, и AutopilotController (SRV-22) — оркестрация сессии:
// «театр» событий, обсуждение→решение, таймаут плана.
import { CONFIG } from '../core/config';
import { GENRES, TYPES, CONSOLES, consoleById, genreById, typeById } from '../core/data/db';
import { startProjectAction } from '../core/engine';
import { comboGrade, consoleAvailable } from '../core/systems/dev';
import { autopilotProjectInput, comboCostK, sequelOpportunity } from '../core/sim/policy';
import { createPlayer, type PolicyStats } from '../core/sim/policy';
import { DIRECTION_LABELS, DIRECTION_ORDER } from '../core/types';
import type { GameRecord, GameState, StartProjectInput } from '../core/types';
import { topUpDirection, type AutopilotPlan, type AutopilotStep } from '../shared/autopilot';
import type { ChatState } from '../shared/chat';
import { buildDecisionPrompt, parseDecision } from './chatgen';
import type { ChatThread } from './game';
import type { LlmFn } from './giga';

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
  combos: string;
  consoles: string;
  directionPoints: number;
  sequel?: string;
  /** AP-04: свежие письма фанатов (настроение по играм) — влияют на выбор жанра */
  fans?: string;
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
  // топ комбо по градации (S/A/B), до 10 штук
  const gradeRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
  const combos: { line: string; rank: number; cost: number }[] = [];
  for (const g of unlockedGenres.slice(0, 20)) {
    for (const t of unlockedTypes.slice(0, 79)) {
      const grade = comboGrade(g.id, t.id);
      if (grade === 'C') continue;
      const cost = comboCostK(state, g.id, t.id, licensed[0]?.id ?? 'pc-game', 'normal');
      combos.push({ line: `${g.ru ?? g.name} × ${t.nameRu ?? t.name} = ${grade} (~${Math.round(cost)}K)`, rank: gradeRank[grade] ?? 3, cost });
    }
  }
  combos.sort((a, b) => a.rank - b.rank || a.cost - b.cost);
  // AP-05: подсказка о сиквеле — комбо с лучшим результатом в зале славы (если жанр/тип ещё открыты)
  const seq = sequelOpportunity(state);
  const seqGenre = seq ? unlockedGenres.find((g) => g.id === seq.genreId) : undefined;
  const seqType = seq ? unlockedTypes.find((t) => t.id === seq.typeId) : undefined;
  const sequelLine = seq && seqGenre && seqType
    ? `«${seqGenre.ru ?? seqGenre.name} × ${seqType.nameRu ?? seqType.name}» — ${seq.score}/40`
    : undefined;
  // AP-04: свежие письма фанатов — команда их «читает»: разгром меняет жанр, восторг зовёт в сиквел
  const recentMail = state.mail.slice(-3);
  const fans = recentMail.length
    ? recentMail
        .map((l) => `${l.sentiment === 'love' ? 'восторг' : l.sentiment === 'hate' ? 'разгром' : 'нейтрально'} — «${l.gameName}»`)
        .join('; ')
    : undefined;
  return {
    team: state.staff.map((s) => `${s.name} (${s.activeCareer} Lv${s.careers[s.activeCareer] ?? 0}, id:${s.id})`).join('; '),
    money: Math.round(state.money),
    research: Math.round(state.research),
    office: state.officeLevel,
    genres: unlockedGenres.map((g) => `${g.id}="${g.ru ?? g.name}"`).join(', '),
    types: unlockedTypes.map((t) => `${t.id}="${t.nameRu ?? t.name}"`).join(', '),
    combos: combos.slice(0, 12).map((c) => c.line).join('; '),
    consoles: licensed.map((c) => `${c.id}="${c.name}"`).join(', '),
    directionPoints: state.directionPoints,
    sequel: sequelLine,
    fans,
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
export function createAutopilotPolicy(): { turn(state: GameState): void; stats: PolicyStats } {
  // SRV-04: политика резолвит события и выпускает игры, но НЕ стартует проекты (это делает чат)
  const player = createPlayer({ resolveOnly: true });
  const stats: PolicyStats = { hires: 0, releases: 0, boostAccepts: 0, licenses: 0 };
  return {
    stats,
    turn(state: GameState): void {
      // вызываем только когда есть что резолвить (событие) или готово к релизу —
      // иначе политика сама стартовала бы свои проекты вместо решений чата
      const busy = !!state.pendingEvent || (state.activeGame?.phase === 'debug' && state.activeGame.bugs <= 5);
      if (!busy) return;
      player.turn(state, stats);
    },
  };
}

export { autopilotProjectInput };

/** AP-02: почему команда выбрала именно так — градация комбо, бюджет и серия (игрок видит логику). */
export function decisionReason(state: GameState, plan: AutopilotPlan): string {
  const genre = genreById(plan.genreId);
  const type = typeById(plan.typeId);
  const combo = comboGrade(plan.genreId, plan.typeId);
  const seq = sequelOpportunity(state);
  const isSeq = !!seq && seq.genreId === plan.genreId && seq.typeId === plan.typeId;
  const cost = comboCostK(state, plan.genreId, plan.typeId, plan.consoleId, plan.mode);
  const budget = state.money > 4000 ? 'бюджет свободный' : state.money > 1200 ? 'бюджет ровный' : 'прижимаемся по деньгам';
  const grade = combo === 'S' ? 'это S-комбо, грех не взять' : combo === 'A' ? 'крепкое A-комбо' : `комбо ${combo} — зато по деньгам сходится`;
  const parts = [
    isSeq ? `серия: у «${genre?.ru ?? genre?.name ?? plan.genreId} × ${type?.nameRu ?? type?.name ?? plan.typeId}» был хит на ${seq!.score}/40 — делаем продолжение` : '',
    grade,
    `~${Math.round(cost)}K, ${budget}`,
  ].filter(Boolean);
  return parts.join('; ');
}

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
  generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void>;
}

/** Оркестрация автопилота (SRV-22): «театр» событий, обсуждение→решение, таймаут плана. */
export class AutopilotController {
  private readonly policy = createAutopilotPolicy();
  private deciding = false; // LLM-решение в процессе
  private pendingDecision = false; // ждём конца обсуждения, чтобы вызвать решение
  private pendingPlanDeadline = 0; // дедлайн самостоятельного старта, если клиент не нажал «Начать»
  private lastHadActiveGame = false; // переход activeGame→null сбрасывает decidedThisIdle
  private pendingEventSince: number | null = null; // «театр»: попап висит ~2.6с
  private decisionEpoch = 0; // SRV-03: отмена решений автопилота (take_control во время LLM-запроса)
  private speedBefore = 1; // AP-07: скорость до включения автопилота (в неё вернём контроль)
  private autoTarget = 4; // AP-07: ускоренный темп между событиями (4-8×, ниже не опускаем)
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
    // AP-07: адаптивный темп — команда не ползёт на 1×; уже разогнанные 8× не опускаем
    this.speedBefore = this.h.speed;
    this.autoTarget = Math.max(4, this.h.speed);
    if (this.h.speed < this.autoTarget) this.h.setSpeed(this.autoTarget);
    this.h.pushSystem('🤖 Босс отдал команде управление — решаем сами!');
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
      this.h.pushSystem('🧑‍💼 Босс вернулся! Команда спешно делает вид, что всё это время усердно работала.');
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
      released.length ? `Средний счёт: ${avg}/40` : '',
      best ? `Лучшая: «${best.name}» — ${best.score}/40${best.score >= CONFIG.HALL_OF_FAME ? ' — зал славы!' : ''}` : '',
      `Деньги: ${delta >= 0 ? '+' : ''}${delta}K (${Math.round(this.session.money)}K → ${Math.round(g.money)}K)`,
    ].filter(Boolean);
    return { title: '🤖 Итоги автосессии', text: lines.join('\n') };
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
        this.policy.turn(g);
        this.pendingEventSince = null;
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
      this.h.emitStep({ kind: 'open', app: 'chat' }); // после релиза — новое обсуждение тоже видно
      void this.h.generatePhase('autopilot_discuss');
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

    // (4) AP-08: затишье — редкая реплика команды, чтобы паузы в чате оживали
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
      // упор решает чат: решению отдаём последние реплики обсуждения (autopilot_discuss)
      const discussion = this.h.chat.msgs
        .filter((m) => !m.system)
        .slice(-12)
        .map((m) => `${m.author}: ${m.text.slice(0, 300)}`)
        .join('\n');
      const { text } = await this.h.llm(buildDecisionPrompt(ctx, discussion), 800);
      if (cancelled()) return;
      const plan = parseDecision(text);
      if (plan) fitDirection(plan, this.h.game.directionPoints); // приводим упор к бюджету: перерасход ужимаем, недобор добиваем до всего пула
      const err = plan ? validateDecision(plan, this.h.game) : 'не удалось разобрать JSON';
      if (err || !plan) {
        console.error('[gds] автопилот: решение LLM отклонено, фолбэк:', err ?? 'null');
        const fb = autopilotProjectInput(this.h.game);
        if (fb && !cancelled()) {
          announce(fb);
          this.h.pushSystem('📋 GigaChat не решился — команда выбрала сама (по старой доброй таблице комбо).');
        }
      } else {
        const genre = genreById(plan.genreId);
        const type = typeById(plan.typeId);
        const con = consoleById(plan.consoleId);
        if (cancelled()) return;
        this.h.pushSystem(`📋 Решено: «${genre?.ru ?? genre?.name ?? plan.genreId} × ${type?.nameRu ?? type?.name ?? plan.typeId}» на ${con?.name ?? plan.consoleId}. ${dirSummary(plan.direction)}`);
        // AP-02: одна строка причины — игрок понимает логику команды (градация/бюджет/серия)
        this.h.pushSystem(`🧑‍💼 Почему так: ${decisionReason(this.h.game, plan)}.`);
        announce(plan);
      }
    } catch (e) {
      console.error('[gds] автопилот: решение не получено, фолбэк:', String(e).slice(0, 200));
      const fb = autopilotProjectInput(this.h.game);
      if (fb && !cancelled()) {
        announce(fb);
        this.h.pushSystem('📋 GigaChat недоступен — команда решила по старинке.');
      }
    } finally {
      this.deciding = false;
      this.h.emit();
    }
  }
}
