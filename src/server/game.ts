// Игровая сессия на сервере: состояние + тикер + действия + чат-фазы (GigaChat) + автосейв.
import { CONFIG, type HireMethodId } from '../core/config';
import { COMBO_GRADES, ADS, BOOSTER_PRICES, CONSOLES, CONSUMABLE_PRICES, CONTRACTS, GENRES, GENRE_ORDER, STAFF, TRAININGS, TYPES, consoleById, genreById, typeById } from '../core/data/db';
import type { CareerId } from '../core/data/schema';
import { newGame, startProjectAction, tick } from '../core/engine';
import { DIRECTION_LABELS, DIRECTION_ORDER, type GameState, type FanLetter, type StartProjectInput } from '../core/types';
import { avatarFor, chatSystem, deliverChat, resetChat, type ChatMsg, type ChatState } from '../shared/chat';
import type { MetaData } from '../shared/meta';
import { buildLetterPrompt, buildMessages, buildDecisionPrompt, parseDecision, parseSingleMessage } from './chatgen';
import { generateStory, generateWithFallback, type LlmFn } from './giga';
import { buildDecisionContext, createAutopilotPolicy, fitDirection, validateDecision, autopilotProjectInput } from './autopilot';
import type { AutopilotPlan, AutopilotStep } from '../shared/autopilot';
import { SaveManager, SAVE_PATH } from './save';
import { dispatchClientAction, MAX_SPEED } from './actions';

/** «Упор: Нишевость 6, Инновация 4» — на что чат решил сделать упор (видно игроку). */
function dirSummary(direction: Record<string, number>): string {
  const parts = DIRECTION_ORDER.filter((a) => (direction[a] ?? 0) > 0).map((a) => `${DIRECTION_LABELS[a]} ${direction[a]}`);
  return parts.length ? `Упор: ${parts.join(', ')}.` : 'Без упора в направлении.';
}

export interface SessionSnapshot {
  game: GameState;
  chat: ChatState;
  speed: number;
  autopilot: boolean;
}

export type ClientAction = { autopilot?: boolean } & (
  | { type: 'start_project'; input: StartProjectInput }
  | { type: 'release' }
  | { type: 'hire'; method: HireMethodId; staffId?: string; maxFee?: number }
  | { type: 'fire'; staffId: string }
  | { type: 'buy_license'; consoleId: string }
  | { type: 'resolve_boost'; accept: boolean; amount?: number }
  | { type: 'resolve_salesman' }
  | { type: 'resolve_gamedex'; option: string }
  | { type: 'resolve_event' }
  | { type: 'generate_story'; genreId: string; typeId: string }
  | { type: 'set_speed'; v: number }
  | { type: 'new_game' }
  | { type: 'get_state' }
  // M3
  | { type: 'level_up'; staffId: string }
  | { type: 'train'; staffId: string; trainingId: number }
  | { type: 'chat_message'; text: string }
  | { type: 'change_career'; staffId: string; target: CareerId }
  | { type: 'buy_booster'; booster: string }
  | { type: 'use_booster'; staffId: string; booster: string }
  | { type: 'buy_dead_bull'; staffId: string }
  | { type: 'buy_career_manual'; staffId: string; target: CareerId }
  | { type: 'move_office' }
  // M4
  | { type: 'buy_ad'; adId: number }
  | { type: 'take_contract'; contractId: number; staffIds: string[] }
  | { type: 'start_own_console'; name: string; kind: 'console' | 'portable'; cpu: string; media: string }
  // автопилот (plan/14): включение — только вручную (кнопка «Взять/Отдать управление»)
  | { type: 'take_control' }
  | { type: 'set_autopilot'; on: boolean }
);

interface ChatThread {
  phase: string;
  extra: Record<string, unknown>;
  left: number; // сколько ответов осталось сгенерировать
  nextAt: number; // не генерировать раньше этого дня
  busy: boolean; // LLM-вызов в процессе
  errors: number;
  openingDone?: boolean;
  openingFor?: string; // кто должен открыть серию (новичок представляется)
  lines?: Array<{ author: string; text: string }>; // реплики этого диалога — память для следующих
  spoken?: string[]; // кто уже говорил в этом диалоге — ротация
}

/** LLM-инъекция (LLM-05): в тестах — fake-LLM, в проде — GigaChat. savePath — временный файл в тестах. */
export interface GameServerDeps {
  llm?: LlmFn;
  story?: (genreRu: string, typeRu: string) => Promise<{ title: string; plot: string }>;
  savePath?: string;
}

export class GameServer {
  game: GameState;
  chat: ChatState;
  private llm: LlmFn;
  private story: (genreRu: string, typeRu: string) => Promise<{ title: string; plot: string }>;
  private saves: SaveManager;
  speed = 1;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(s: SessionSnapshot) => void>();
  private chatThread: ChatThread | null = null; // фазы чата в процессе генерации
  // SRV-11/12: очереди, а не одиночные слоты — второе сообщение/сцена не затирают первое
  private pendingPlayers: string[] = [];
  private pendingPhases: { phase: string; extra?: Record<string, unknown>; openingFor?: string }[] = [];
  lastAction: { ok: boolean; error?: string } | null = null;
  // ─── автопилот (plan/14): включается только кнопкой, решение в чате, «театр» событий ───
  autopilotOn = false;
  private autopilotPolicy = createAutopilotPolicy();
  pendingPlan: AutopilotPlan | null = null; // решение, ждёт клика «Начать» клиента
  private pendingPlanDeadline = 0;
  private deciding = false; // LLM-решение в процессе
  private pendingDecision = false; // ждём конца обсуждения, чтобы вызвать решение
  decidedThisIdle = false; // решение для текущего простоя уже сделано
  private lastHadActiveGame = false; // переход activeGame→null сбрасывает decidedThisIdle
  private pendingEventSince: number | null = null; // «театр»: попап висит ~2.6с
  private decisionEpoch = 0; // SRV-03: отмена решений автопилота (take_control во время LLM-запроса)
  private stepListeners = new Set<(s: AutopilotStep) => void>();
  // письма фанатов: текст дописывает LLM (по одному, не чаще раза в игровой день)
  private letterBusy = false;
  private letterNextAt = 0;
  mailShownId = 0; // последнее письмо, опубликованное в чат
  private fanReplyQueued = false; // реакция команды ждёт свободного чата

  constructor(deps: GameServerDeps = {}) {
    this.llm = deps.llm ?? generateWithFallback;
    this.story = deps.story ?? generateStory;
    this.saves = new SaveManager(deps.savePath ?? SAVE_PATH);
    const loaded = this.saves.read();
    this.game = loaded?.game ?? newGame(Math.floor(Math.random() * 99991) + 1);
    this.chat = loaded?.chat ?? resetChat();
    this.mailShownId = this.game.mail?.length ? this.game.mail[this.game.mail.length - 1]!.id : 0;
    this.startTicker();
  }

  // ─── подписка ───
  subscribe(fn: (s: SessionSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): SessionSnapshot {
    return { game: this.game, chat: this.chat, speed: this.speed, autopilot: this.autopilotOn };
  }

  // шаги хореографии автопилота (виртуальная мышь клиента)
  subscribeSteps(fn: (s: AutopilotStep) => void): () => void {
    this.stepListeners.add(fn);
    return () => { this.stepListeners.delete(fn); };
  }

  private emitStep(s: AutopilotStep): void {
    for (const l of this.stepListeners) l(s);
  }

  meta(): MetaData {
    return {
      genres: GENRES.map((g) => ({ id: g.id, name: g.name, ru: g.ru, popularity: g.popularity, costWan: g.costWan, unlockJob: g.unlockJob, unlockLevel: g.unlockLevel })),
      types: TYPES.map((t) => ({ id: t.id, name: t.name, nameRu: t.nameRu, popularity: t.popularity, unlockJob: t.unlockJob, unlockLevel: t.unlockLevel, unlockTraining: t.unlockTraining })),
      consoles: CONSOLES.map((c) => ({
        id: c.id, name: c.name, company: c.company,
        licenseCost: c.licenseCost, installBase: c.installBase, costMult: c.costMult,
        unlock: c.unlock, removed: c.removed,
      })),
      staff: STAFF.map((s) => ({
        id: s.id, name: s.name, gender: s.gender, salary: s.salary, hireFee: s.hireFee,
        maxPower: s.maxPower, stats: s.stats, careers: s.careers, activeCareer: s.activeCareer, unlock: s.unlock,
        persona: s.persona,
      })),
      comboGrades: COMBO_GRADES,
      genreOrder: GENRE_ORDER,
      trainings: TRAININGS.map((t) => ({
        id: t.id, name: t.name, nameRu: t.nameRu, costWan: t.costWan, power: t.power,
        program: t.program, scenario: t.scenario, graphics: t.graphics, sound: t.sound, office: t.office,
      })),
      ads: ADS.map((a) => ({ id: a.id, name: a.name, nameRu: a.nameRu, costWan: a.costWan, office: a.office })),
      contracts: CONTRACTS.map((c) => ({
        id: c.id, name: c.name, nameRu: c.nameRu, rewardMin: c.rewardMin, rewardMax: c.rewardMax,
        prMin: c.prMin, prMax: c.prMax, weeks: c.weeks,
        reqProgram: c.reqProgram, reqScenario: c.reqScenario, reqGraphics: c.reqGraphics, reqSound: c.reqSound,
        office: c.office,
      })),
      boosterPrices: BOOSTER_PRICES.map((b) => ({ office: b.office, purchaseNo: b.purchaseNo, price: b.price })),
      consumablePrices: CONSUMABLE_PRICES.map((c) => ({ name: c.name, office: c.office, price: c.price })),
    };
  }

  emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  // ─── тикер ───
  private lastPulse = 0; // последний state-пульс при висящем событии (пауза)
  startTicker(): void {
    if (this.timer) clearInterval(this.timer);
    // SRV-01: кламп на случай любого источника (валидация set_speed — первая линия)
    const clamped = Number.isFinite(this.speed) ? Math.min(Math.max(this.speed, 0), MAX_SPEED) : 1;
    this.timer = setInterval(() => {
      // SRV-07: исключение в тике не должно ронять процесс — лог + принудительный сейв
      try {
        if (this.speed <= 0 || this.game.bankrupt) return;
        if (this.game.pendingEvent) {
          // пульс: пока событие ждёт решения, шлём state ~раз в 1.5с. Клиент, потерявший
          // попап (клик ушёл в оборванный WS), вернёт его; открытый попап не пересоздаётся
          // (клиент сверяет evKey).
          if (Date.now() - this.lastPulse >= 1500) {
            this.lastPulse = Date.now();
            this.emit();
          }
          // аудит 06.09: театр автопилота обязан работать И при висящем событии —
          // иначе мышь не летит к «Выпустить игру», и событие никто не резолвит
          this.maybeAutopilot();
          return;
        }
        tick(this.game);
        deliverChat(this.game, this.chat);
        this.maybeTriggerPhases();
        if (this.chatThread) void this.nextReply();
        this.maybeMailLetters();
        this.maybeAutopilot();
        this.saves.autosave(this.game, this.chat);
        this.emit();
      } catch (e) {
        console.error('[gds] ошибка тика (сервер продолжает работу):', String(e).slice(0, 300));
        this.saves.autosave(this.game, this.chat, true);
      }
    }, Math.round(CONFIG.TICK_MS / Math.max(0.5, clamped)));
  }

  // ─── действия игрока ───
  /** забрать результат последнего действия (для action_result) */
  actionResult(): { ok: boolean; error?: string } | null {
    const r = this.lastAction;
    this.lastAction = null;
    return r;
  }

  run(res: { ok: boolean; error?: string; popup?: { title: string; text: string } }): void {
    this.lastAction = res;
    // попап результата действия: если уже висит другое событие — откладываем
    if (res.ok && res.popup) {
      if (this.game.pendingEvent) this.game.lastPopup = res.popup;
      else this.game.pendingEvent = { type: 'info', title: res.popup.title, text: res.popup.text };
    }
  }

  private storyCb: ((res: { ok: boolean; title?: string; plot?: string; error?: string }) => void) | null = null;
  setStoryCb(cb: (res: { ok: boolean; title?: string; plot?: string; error?: string }) => void): void {
    this.storyCb = cb;
  }

  /** генерация названия и сюжета через GigaChat (асинхронно, ответ — в storyCb) */
  async runStory(msg: { genreId: string; typeId: string }): Promise<void> {
    try {
      const g = genreById(msg.genreId);
      const t = typeById(msg.typeId);
      if (!g || !t) throw new Error('Жанр или тема не найдены');
      const s = await this.story(g.ru ?? g.name, t.nameRu ?? t.name);
      this.storyCb?.({ ok: true, ...s });
    } catch (e) {
      this.storyCb?.({ ok: false, error: e instanceof Error ? e.message : 'Ошибка генерации' });
    }
  }

  /** SRV-22: диспетчер действий клиента — см. server/actions.ts */
  handle(msg: ClientAction): void {
    dispatchClientAction(this, msg);
  }

  // ─── автопилот (plan/14) ───
  stopAutopilot(silent: boolean): void {
    this.autopilotOn = false;
    this.decisionEpoch++; // SRV-03: in-flight runDecision потеряет право ставить план
    this.pendingPlan = null;
    this.pendingPlanDeadline = 0;
    this.deciding = false;
    this.pendingDecision = false;
    this.decidedThisIdle = false;
    this.pendingEventSince = null;
    if (!silent) {
      this.pushSystem('🧑‍💼 Босс вернулся! Команда спешно делает вид, что всё это время усердно работала.');
      void this.generatePhase('boss_back');
    }
    this.emit();
  }

  /** SRV-09: сброс сессионной чат-машины при новой игре/импорте сейва. */
  resetSession(): void {
    this.chatThread = null;
    this.pendingPlayers = [];
    this.pendingPhases = [];
    this.letterBusy = false;
    this.letterNextAt = 0;
    this.fanReplyQueued = false;
  }

  /** Куда и что нажимает виртуальная мышь для текущего события (театр). */
  private autopilotEventTarget(): { target: string; label: string } {
    const ev = this.game.pendingEvent;
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
    if (this.autopilotOn) return;
    this.autopilotOn = true;
    this.decidedThisIdle = false;
    this.pendingDecision = false;
    this.pushSystem('🤖 Босс отдал команде управление — решаем сами!');
    this.emitStep({ kind: 'open', app: 'chat' }); // обсуждение должно быть ВИДНО
    this.emit();
  }

  private maybeAutopilot(): void {
    const g = this.game;
    // (0) автопилот включается ТОЛЬКО кнопкой «Отдать управление» (таймаут простоя убран):
    // без явного включения виртуальная мышь и чат не работают — игра ждёт босса
    if (!this.autopilotOn) return;

    // (1) «театр» событий: попап висит ~2.6с реального времени — мышь (медленный полёт
    // ~1.2с + поиск элемента) успевает нажать; не успела — политика резолвит сама,
    // автопилот работает и без клиента
    if (g.pendingEvent) {
      if (this.pendingEventSince === null) {
        this.pendingEventSince = Date.now();
        const t = this.autopilotEventTarget();
        this.emitStep({ kind: 'click', target: t.target, label: t.label });
      } else if (Date.now() - this.pendingEventSince >= 2600) {
        this.autopilotPolicy.turn(g);
        this.pendingEventSince = null;
        this.emit();
      }
    } else {
      this.pendingEventSince = null;
    }

    // (2) обсуждение в чате → LLM-решение (один запрос со всеми параметрами)
    // сброс decidedThisIdle: активная игра только что закончилась (релиз) → следующий
    // раунд простоя снова решает чат (релиз политикой идёт мимо handle(), поэтому
    // сбрасываем по переходу activeGame → null, а не по действию)
    const hasActive = !!g.activeGame;
    if (!hasActive && this.lastHadActiveGame) this.decidedThisIdle = false;
    this.lastHadActiveGame = hasActive;
    if (
      !g.activeGame && !g.pendingEvent && !this.pendingPlan &&
      !this.deciding && !this.pendingDecision && !this.decidedThisIdle
    ) {
      this.decidedThisIdle = true;
      this.emitStep({ kind: 'open', app: 'chat' }); // после релиза — новое обсуждение тоже видно
      void this.generatePhase('autopilot_discuss');
      this.pendingDecision = true;
    }
    if (this.pendingDecision && !this.chatThread && !this.deciding) void this.runDecision();

    // (3) таймаут плана: клиент не успел/не смог нажать «Начать» — стартуем сами
    if (this.pendingPlan && !g.activeGame && !g.pendingEvent && Date.now() > this.pendingPlanDeadline) {
      const plan = this.pendingPlan;
      this.pendingPlan = null;
      let res = startProjectAction(g, plan as StartProjectInput);
      if (!res.ok) {
        const fb = autopilotProjectInput(g);
        if (fb) res = startProjectAction(g, fb);
      }
      this.emit();
    }
  }

  /** Решение LLM: какую игру делать. Невалидно/молчит — детерминированный фолбэк. */
  private async runDecision(): Promise<void> {
    this.pendingDecision = false;
    this.deciding = true;
    // SRV-03: снимок эпохи — «Взять управление» во время LLM-запроса отменяет решение
    const epoch = this.decisionEpoch;
    const cancelled = (): boolean => !this.autopilotOn || epoch !== this.decisionEpoch;
    const announce = (plan: AutopilotPlan): void => {
      if (cancelled()) return;
      this.pendingPlan = plan;
      // клиентская хореография визарда — десятки реальных кликов (~15–35с) + генерация
      // сюжета (до 25с ожидания LLM); фолбэк стартует сам только если клиента нет/завис
      this.pendingPlanDeadline = Date.now() + 120000;
      this.emitStep({ kind: 'open', app: 'code' });
      // «plan» включает ВСЮ хореографию визарда, включая финальный клик «Начать»
      this.emitStep({ kind: 'plan', plan });
    };
    try {
      const ctx = buildDecisionContext(this.game);
      // упор решает чат: решению отдаём последние реплики обсуждения (autopilot_discuss)
      const discussion = this.chat.msgs
        .filter((m) => !m.system)
        .slice(-12)
        .map((m) => `${m.author}: ${m.text.slice(0, 300)}`)
        .join('\n');
      const { text } = await this.llm(buildDecisionPrompt(ctx, discussion), 800);
      if (cancelled()) return;
      const plan = parseDecision(text);
      if (plan) fitDirection(plan, this.game.directionPoints); // приводим упор к бюджету: перерасход ужимаем, недобор добиваем до всего пула
      const err = plan ? validateDecision(plan, this.game) : 'не удалось разобрать JSON';
      if (err || !plan) {
        console.error('[gds] автопилот: решение LLM отклонено, фолбэк:', err ?? 'null');
        const fb = autopilotProjectInput(this.game);
        if (fb && !cancelled()) {
          announce(fb);
          this.pushSystem('📋 GigaChat не решился — команда выбрала сама (по старой доброй таблице комбо).');
        }
      } else {
        const genre = genreById(plan.genreId);
        const type = typeById(plan.typeId);
        const con = consoleById(plan.consoleId);
        if (cancelled()) return;
        this.pushSystem(`📋 Решено: «${genre?.ru ?? genre?.name ?? plan.genreId} × ${type?.nameRu ?? type?.name ?? plan.typeId}» на ${con?.name ?? plan.consoleId}. ${dirSummary(plan.direction)}`);
        announce(plan);
      }
    } catch (e) {
      console.error('[gds] автопилот: решение не получено, фолбэк:', String(e).slice(0, 200));
      const fb = autopilotProjectInput(this.game);
      if (fb && !cancelled()) {
        announce(fb);
        this.pushSystem('📋 GigaChat недоступен — команда решила по старинке.');
      }
    } finally {
      this.deciding = false;
      this.emit();
    }
  }

  // ─── чат: фазы по прогрессу ───
  private maybeTriggerPhases(): void {
    const g = this.game.activeGame;
    if (!g) return;
    if (!this.chat.phases.alpha && g.progress >= 0.4) {
      this.chat.phases.alpha = true;
      void this.generatePhase('alpha');
    }
    if (!this.chat.phases.beta && g.progress >= 0.8) {
      this.chat.phases.beta = true;
      void this.generatePhase('beta');
    }
    if (!this.chat.phases.debug && g.phase === 'debug') {
      this.chat.phases.debug = true;
      void this.generatePhase('debug');
    }
  }

  async generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void> {
    // чат занят (отвечает игроку / идёт другая фаза) — встаём в очередь
    if (this.chatThread) {
      // SRV-12: очередь сцен (FIFO, лимит 5) — события не схлопываются в одно
      if (this.pendingPhases.length < 5) this.pendingPhases.push({ phase, extra, openingFor });
      return;
    }
    // событие фазы → живая серия: реплики по одной, с ответами друг другу
    const left = phase === 'boost' ? 2 : phase === 'hire' ? 3 : phase === 'fanmail' ? 4 : phase === 'autopilot_discuss' ? 3 : phase === 'boss_back' ? 4 : 5; // ответов после открывающей
    this.chatThread = { phase, extra: extra ?? {}, left, busy: false, nextAt: this.game.week, errors: 0, openingFor };
    void this.nextReply();
  }

  /** SRV-22: реплика игрока — в очередь FIFO, если команда ещё отвечает (вызывает диспетчер). */
  queuePlayerMessage(text: string): void {
    if (this.chatThread) this.pendingPlayers.push(text); // SRV-11: FIFO — все вопросы будут отвечены
    else this.startPlayerThread(text);
  }

  // игрок написал в чат: команда отвечает серией из 1..7 реплик (зависит от «объёма» вопроса)
  private startPlayerThread(text: string): void {
    const l = text.length;
    const hi = l < 50 ? 2 : l < 140 ? 4 : 7;
    const left = 1 + Math.floor(Math.random() * hi);
    this.chatThread = { phase: 'player', extra: { text }, left, busy: false, nextAt: this.game.week, errors: 0 };
    void this.nextReply();
  }

  // одна реплика диалога: кто-то отвечает на последнюю (или открывает серию)
  private async nextReply(): Promise<void> {
    const t = this.chatThread;
    if (!t || t.busy) return;
    if (!t.openingDone) {
      t.busy = true;
      t.openingDone = true;
      try {
        await this.fetchOneReply(t, undefined);
        t.left--;
      } catch (e) {
        t.errors++;
        console.error(`[gds] LLM-реплика не удалась (фаза ${t.phase}):`, String(e).slice(0, 200));
      } finally {
        t.busy = false;
        this.maybeEndThread();
      }
      return;
    }
    if (this.game.week < t.nextAt) return;
    t.busy = true;
    try {
      await this.fetchOneReply(t, this.lastStaffText() ?? undefined);
      t.left--;
      t.errors = 0;
    } catch (e) {
      t.errors++;
      console.error(`[gds] LLM-реплика не удалась (фаза ${t.phase}):`, String(e).slice(0, 200));
    } finally {
      t.busy = false;
      t.nextAt = this.game.week + 3; // следующая генерация — после доставки (week+2)
      this.maybeEndThread();
    }
  }

  private maybeEndThread(): void {
    const t = this.chatThread;
    if (!t) return;
    if (t.left > 0 && t.errors < 3) return;
    this.chatThread = null;
    // LLM-02: серия оборвалась из-за ошибок LLM — игрок должен это видеть
    if (t.errors >= 3) this.pushSystem('📡 Связь с командой пропала — они не смогли ответить. Напишите ещё раз.');
    const nextPlayer = this.pendingPlayers.shift();
    if (nextPlayer !== undefined) {
      // сначала ответим на вопросы игрока (FIFO), потом — отложенные события
      this.startPlayerThread(nextPlayer);
    } else {
      const p = this.pendingPhases.shift();
      if (p) void this.generatePhase(p.phase, p.extra, p.openingFor);
    }
  }

  // ─── Порядок чата (10.09.2026): события не рвут живые диалоги ───
  /** «Пол» очереди: раньше этой недели новое сообщение не должно выскочить вперёд. */
  private chatFloor(): number {
    let w = this.game.week;
    for (const m of this.chat.queue) if (m.week > w) w = m.week;
    return w;
  }

  /** Системная запись: если в очереди есть недоставленные сообщения — встаёт за ними (очередь). */
  pushSystem(text: string): void {
    if (this.chat.queue.length === 0) {
      chatSystem(this.game, this.chat, text);
      return;
    }
    this.chat.queue.push({
      week: this.chatFloor(), author: 'Система', avatar: '', text, system: true, trigger: 'week',
    });
    this.emit();
  }

  // ─── M5: письма фанатов ───
  // (1) LLM дописывает текст письма; (2) готовое письмо публикуется в ЧАТ целиком, и команда
  // реагирует серией реплик (фаза 'fanmail'); (3) если чат был занят — реакция откладывается.
  private maybeMailLetters(): void {
    // (1) LLM-текст: одно письмо за раз, не чаще раза в игровой день и не во время реплики чата
    if (!this.letterBusy && this.game.week >= this.letterNextAt && !this.chatThread?.busy) {
      const pending = this.game.mail.find((m) => !m.llm);
      if (pending) {
        this.letterBusy = true;
        this.letterNextAt = this.game.week + 1;
        void this.writeLetterText(pending);
      }
    }
    // (2) письмо готово (текст LLM или заготовка) — в чат, но не в середину живого диалога:
    // публикуем, когда чат свободен, и встаём в конец очереди — хронология недель не рвётся (10.09.2026)
    if (!this.chatThread && this.pendingPlayers.length === 0) {
      for (const l of this.game.mail) {
        if (l.id <= this.mailShownId || !l.llm) continue;
        this.mailShownId = l.id;
        const emoji = l.sentiment === 'love' ? '💌' : l.sentiment === 'hate' ? '💔' : '✉️';
        this.chat.queue.push({
          week: this.chatFloor(), author: `${l.fanName} (фанат)`, avatar: '', text: `${emoji} ${l.text}`, trigger: 'week',
        });
        this.emit();
        if (this.pendingPhases.length > 0) {
          this.fanReplyQueued = true; // впереди события — реакция после текущей серии
        } else {
          void this.generatePhase('fanmail', { text: l.text, fanName: l.fanName, gameName: l.gameName, sentiment: l.sentiment });
        }
        return; // одно письмо за тик
      }
    }
    // (3) отложенная реакция на последнее показанное письмо
    if (this.fanReplyQueued && !this.chatThread && this.pendingPhases.length === 0 && this.pendingPlayers.length === 0) {
      this.fanReplyQueued = false;
      const l = this.game.mail.find((x) => x.id === this.mailShownId);
      if (l) {
        void this.generatePhase('fanmail', { text: l.text, fanName: l.fanName, gameName: l.gameName, sentiment: l.sentiment });
      }
    }
  }

  private async writeLetterText(letter: FanLetter): Promise<void> {
    try {
      const messages = buildLetterPrompt(letter);
      const { text } = await this.llm(messages, 250);
      const t = text.trim().replace(/^["«]|["»]$/g, '').slice(0, 700);
      if (t.length >= 20) letter.text = t; // иначе оставляем заготовку движка
    } catch (e) {
      console.error('[gds] LLM-текст письма не получен — остаётся заготовка:', String(e).slice(0, 200));
    }
    letter.llm = true;
    this.letterBusy = false;
    this.saves.autosave(this.game, this.chat, true); // LLM-текст письма не должен теряться при дебаунсе
    this.emit();
  }

  private lastStaffText(): string | null {
    for (const m of [...this.chat.msgs].reverse()) {
      if (m.author !== 'Система') return m.text;
    }
    return null;
  }

  /** Зачины недавних реплик (для «не повторяй»): реплики этого треда + доставленные в чат. */
  private recentOpenings(t: ChatThread): string[] {
    const parts = (t.lines ?? []).slice(-4).map((h) => h.text.slice(0, 60));
    for (const m of [...this.chat.msgs].reverse()) {
      if (m.system || m.author === 'Система' || m.author.endsWith('(фанат)')) continue;
      parts.push(m.text.slice(0, 60));
      if (parts.length >= 6) break;
    }
    return parts.slice(0, 6);
  }

  /** Ротация говорящих: сначала не говорившие в диалоге, затем самые молчаливые по игре. */
  private silentFirstTeam(spoken: string[]): string[] {
    const counts = new Map<string, number>();
    for (const m of this.chat.msgs) {
      if (m.system || m.author === 'Система' || m.author.endsWith('(фанат)')) continue;
      counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
    }
    return this.game.staff
      .map((s) => s.name)
      .filter((n) => !spoken.includes(n))
      .sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
  }

  private async fetchOneReply(t: NonNullable<ChatThread>, replyToParam: string | undefined): Promise<void> {
    // память диалога + ротация говорящих (10.09.2026): реплика видит весь тред и недавние
    // зачины, а не только последнюю строку; слово получают те, кто давно молчит
    const lines = t.lines ?? [];
    const lastLine = lines.length ? lines[lines.length - 1]! : null;
    const replyTo = lastLine ? lastLine.text : replyToParam;
    const spoken = t.spoken ?? [];
    const silent = this.silentFirstTeam(spoken);
    const ctx = this.buildContext(t.phase, t.extra);
    const opts = {
      replyTo,
      openingFor: replyTo ? undefined : t.openingFor,
      history: lines.slice(0, -1).slice(-6),
      recent: this.recentOpenings(t),
      spoken,
      suggest: t.openingFor && !replyTo ? [] : silent.slice(0, 3),
    };
    const first = await this.llm(buildMessages(t.phase, ctx, opts), 600);
    let parsed = parseSingleMessage(first.text);
    // ротация: модель выбрала уже говорившего, хотя есть молчащие → один повтор с жёстким списком
    if (parsed && replyTo && spoken.length > 0 && silent.length > 0 && spoken.includes(parsed.author)) {
      const again = await this.llm(buildMessages(t.phase, ctx, { ...opts, hardRotate: true }), 600);
      parsed = parseSingleMessage(again.text) ?? parsed;
    }
    const valid = parsed && this.game.staff.some((s) => s.name === parsed.author) && parsed.text.length >= 4 && parsed.text.length <= 500;
    if (!valid || !parsed) throw new Error('нет валидной реплики');
    // запомнили реплику и говорящего: следующие вызовы увидят историю и не повторят автора
    t.lines = [...lines, { author: parsed.author, text: parsed.text }];
    if (!spoken.includes(parsed.author)) t.spoken = [...spoken, parsed.author];
    const msg: ChatMsg = {
      week: Math.max(this.game.week + (replyTo ? 2 : 1), this.chatFloor()),
      author: parsed.author,
      avatar: avatarFor(this.game, parsed.author),
      text: parsed.text,
      trigger: 'week',
    };
    this.chat.queue.push(msg);
    this.emit();
  }

  private buildContext(phase: string, extra?: Record<string, unknown>): Record<string, unknown> {
    const g = this.game.activeGame;
    const project = g
      ? {
          genre: genreById(g.genreId)?.name ?? g.genreId,
          type: typeById(g.typeId)?.name ?? g.typeId,
          console: consoleById(g.consoleId)?.name ?? g.consoleId,
          mode: g.mode,
          combo: g.comboGrade,
          progress: Math.round(g.progress * 100),
          bugs: Math.round(g.bugs),
          points: Object.fromEntries(Object.entries(g.points).map(([k, v]) => [k, Math.round(v)])),
          direction: Object.fromEntries(Object.entries(g.direction).map(([k, v]) => [k, Math.round(v)])),
          name: g.name || null,
          plot: g.plot || null,
        }
      : null;
    return {
      phase,
      week: this.game.week,
      year: this.game.year,
      money: Math.round(this.game.money),
      fans: Math.round(this.game.fans),
      research: Math.round(this.game.research),
      project,
      // как игрок распределил очки направления в последнем проекте (и режим) — чтобы
      // сотрудники могли обсуждать выбор в чате
      lastProject: {
        genre: this.game.lastGenreId ? genreById(this.game.lastGenreId)?.name ?? this.game.lastGenreId : null,
        type: this.game.lastTypeId ? typeById(this.game.lastTypeId)?.name ?? this.game.lastTypeId : null,
        mode: this.game.lastMode,
        direction: this.game.lastDirection,
      },
      staff: this.game.staff.map((s) => ({
        id: s.id,
        name: s.name,
        career: s.activeCareer,
        stats: s.stats,
        power: s.power,
        // личность из контентной БД (research/04 → personalities): используется промптом чата
        persona: STAFF.find((d) => d.id === s.id)?.persona ?? null,
      })),
      facts: extra ?? {},
    };
  }

  // ─── сейвы ───
  /** SRV-08: принудительный сейв (SIGINT/SIGTERM/краш) — вызывается из server.ts */
  saveNow(): void {
    this.saves.autosave(this.game, this.chat, true);
  }

  /** остановка тикера (тесты, graceful shutdown) */
  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  exportSave(): string {
    return this.saves.exportPayload(this.game, this.chat);
  }

  importSave(raw: string): boolean {
    const res = this.saves.importPayload(raw);
    if (!res) return false;
    this.game = res.game;
    this.chat = res.chat ?? resetChat();
    this.resetSession(); // SRV-09
    this.mailShownId = this.game.mail?.length ? this.game.mail[this.game.mail.length - 1]!.id : 0;
    this.saves.autosave(this.game, this.chat, true);
    this.emit();
    return true;
  }
}
