// Игровая сессия на сервере: состояние + тикер + действия + чат-фазы (GigaChat) + автосейв.
import { type HireMethodId } from '../core/config';
import { COMBO_GRADES, ADS, BOOSTER_PRICES, CONSOLES, CONSUMABLE_PRICES, CONTRACTS, GENRES, GENRE_ORDER, MESSAGES, STAFF, TRAININGS, TYPES, genreById, typeById } from '../core/data/db';
import { consoleDataFor } from '../core/systems/dev';
import { CRITICS, PRESS_FALLBACK_RU } from '../core/data/critics'; // PLAN-30: 10 журналов
import type { CareerId } from '../core/data/schema';
import { newGame } from '../core/engine';
import { consoleEvents } from '../core/systems/market';
import { type GameState, type StartProjectInput } from '../core/types';
import { resetChat, type ChatState } from '../shared/chat';
import type { MetaData } from '../shared/meta';

import { generateStory, generateWithFallback, type LlmFn, type LlmMessage } from './giga';
import { AutopilotController } from './autopilot';
import type { AutopilotPlan, AutopilotStep } from '../shared/autopilot';
import { SaveManager, SAVE_PATH, type PersistAdapter } from './save';
import { writeAutopilotLog, dispatchClientAction, MAX_SPEED } from './actions';
import { log } from '../core/log';
import { MINIGAME_ROTATION } from '../shared/minigames';
import { GameTicker } from './ticker';
import { ChatOrchestrator } from './chatflow';
import { MailService } from './mail';

export interface SessionSnapshot {
  game: GameState;
  chat: ChatState;
  speed: number;
  autopilot: boolean;
  /** PLAN-40: победа аккаунта (100/100) — открыт авторежим */
  victory: boolean;
  /** PLAN-40: релизов за всю историю аккаунта — пороги скоростей */
  accountReleases: number;
}

export type ClientAction = { autopilot?: boolean } & (
  | { type: 'start_project'; input: StartProjectInput }
  | { type: 'release' }
  | { type: 'search'; method: HireMethodId }
  | { type: 'hire'; staffId: string }
  | { type: 'fire'; staffId: string }
  | { type: 'buy_license'; consoleId: string }
  | { type: 'resolve_boost'; accept: boolean; amount?: number }
  | { type: 'resolve_salesman' }
  | { type: 'resolve_gamedex'; option: string }
  | { type: 'resolve_minigame'; pct?: number; closed?: boolean } // PLAN-39: результат врезки / досрочное закрытие (макс. штраф)
  | { type: 'resolve_event' }
  | { type: 'user_typing' } // SER-27: игрок печатает (для панели разговоров)
  | { type: 'generate_story'; genreId: string; typeId: string; reqId?: number }
  | { type: 'set_speed'; v: number }
  | { type: 'set_ui'; ui: unknown } // PLAN-24: фон и раскладка окон в сейве
  | { type: 'autopilot_done' } // PLAN-25: клиент отыграл хореографию политики (клики применили действия)
  | { type: 'autopilot_log'; entry: unknown } // PLAN-26: журнал промахов автопилота
  | { type: 'new_game' }
  | { type: 'get_state' }
  // M3
  | { type: 'level_up'; staffId: string }
  | { type: 'train'; staffId: string; trainingId: number }
  | { type: 'chat_message'; text: string }
  | { type: 'buy_booster'; booster: string }
  | { type: 'use_booster'; staffId: string; booster: string }
  | { type: 'buy_dead_bull'; staffId: string }
  | { type: 'buy_career_manual' } // в запас (применяется в окне сотрудника)
  | { type: 'apply_career_manual'; staffId: string; target: CareerId }
  | { type: 'rest_staff'; staffId: string } // PLAN-41: отправить в отпуск (7 дней → POWER полный)
  | { type: 'train_to_max'; staffId: string } // PLAN-41: автотренировка до порогов
  | { type: 'move_office' }
  // M4
  | { type: 'buy_ad'; adId: number }
  | { type: 'take_contract'; contractId: number; staffIds: string[] }
  | { type: 'start_own_console'; name: string; kind: 'console' | 'portable'; cpu: string; media: string }
  // автопилот (plan/14): включение — только вручную (кнопка «Взять/Отдать управление»)
  | { type: 'take_control' }
  | { type: 'set_autopilot'; on: boolean }
);

export interface ChatThread {
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
  /** PLAN-18: хранилище партии (у пользователей — запись в БД); по умолчанию — файл savePath */
  persist?: PersistAdapter;
  /** PLAN-22: открытые комбо аккаунта — подмешиваются в состояние при подъёме сессии */
  openedCombos?: string[];
  /** PLAN-22: новые открытия уезжают в аккаунт на автосейве */
  onCombosChanged?: (combos: string[]) => void;
  /** PLAN-39: следующая мини-игра из мешка аккаунта (без повторов) */
  nextMinigameId?: () => string;
  /** PLAN-40: победа аккаунта (100/100) — открыт авторежим */
  victory?: boolean;
  /** PLAN-40: релизов за всю историю аккаунта — пороги скоростей */
  accountReleases?: number;
}

// ─── PLAN-30: пресса — общий промпт и разбор ответа (релиз и самолечение) ───

/**
 * Сообщение LLM: {{facts}} и {{critics}} подставляются построчно вызывающим кодом.
 * Промпт требует ровно 10 реплик, тон — по оценке критика.
 */
function buildPressMessages(facts: string, critics: string): LlmMessage[] {
  return [
    {
      role: 'system',
      content: 'Ты пишешь короткие рецензии для игровой прессы. Отвечай ТОЛЬКО JSON-массивом из 10 строк, без пояснений.',
    },
    {
      role: 'user',
      content: `Ниже игра и десять критиков со своими оценками. Напиши для каждого ОДИН короткий отзыв (1–2 предложения) В ЕГО МАНЕРЕ, на русском. Тон согласуй с оценкой: 3–4 разгром, 5–6 прохлада, 7–8 похвала с оговорками, 9–10 восторг. Без имён, только реплика.\n\nИгра:\n${facts}\n\nКритики:\n${critics}\n\nФормат ответа: ["текст 1", "текст 2", ..., "текст 10"]`,
    },
  ];
}


/** Строка «1. Имя, журнал «…», характер. Его оценка: X/10» для десяти критиков. */
function criticsLine(scores: number[]): string {
  return CRITICS.map((c, i) => `${i + 1}. ${c.name}, журнал «${c.magazine}», ${c.persona}. Его оценка: ${scores[i] ?? 0}/10`).join('\n');
}

/** Все русские фолбэки одним набором — для проверки самолечения. */
const RU_FALLBACKS = new Set(Object.values(PRESS_FALLBACK_RU).flat());

/** Разбор ответа: только массив ровно из 10 непустых строк; причина отказа — в лог. */
function parsePressAnswer(text: string, attempt: number): string[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) {
    console.warn(`[gds] пресса: попытка ${attempt} — в ответе нет массива:`, text.slice(0, 160));
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch (e) {
    console.warn(`[gds] пресса: попытка ${attempt} — битый JSON:`, String(e).slice(0, 100));
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== CRITICS.length) {
    console.warn(`[gds] пресса: попытка ${attempt} — не 10 строк:`, JSON.stringify(parsed).slice(0, 140));
    return null;
  }
  const clean = parsed.map((t) => String(t ?? '').trim().slice(0, 300));
  if (clean.some((t) => t.length < 5)) {
    console.warn(`[gds] пресса: попытка ${attempt} — пустые строки`);
    return null;
  }
  return clean;
}

export class GameServer {
  game: GameState;
  chat: ChatState;
  llm: LlmFn;
  private story: (genreRu: string, typeRu: string) => Promise<{ title: string; plot: string }>;
  private saves: PersistAdapter;
  speed = 1;
  private readonly ticker = new GameTicker(this);
  private readonly chatflow = new ChatOrchestrator(this);
  private readonly mailer = new MailService(this);
  private readonly pilot = new AutopilotController(this);
  private listeners = new Set<(s: SessionSnapshot) => void>();
  chatThread: ChatThread | null = null; // фазы чата в процессе генерации
  // SRV-11/12: очереди, а не одиночные слоты — второе сообщение/сцена не затирают первое
  pendingPlayers: string[] = [];
  pendingPhases: { phase: string; extra?: Record<string, unknown>; openingFor?: string }[] = [];
  lastAction: { ok: boolean; error?: string } | null = null;
  // ─── автопилот (plan/14): состояние сессии; логика — в autopilot.ts (AutopilotController) ───
  autopilotOn = false;
  /** SER-27: когда игрок последний раз печатал в чате (для статуса «печатает» в панели). */
  lastTypingAt = 0;
  pendingPlan: AutopilotPlan | null = null; // решение, ждёт клика «Начать» клиента
  decidedThisIdle = false; // решение для текущего простоя уже сделано
  private stepListeners = new Set<(s: AutopilotStep) => void>();
  // письма фанатов: текст дописывает LLM (по одному, не чаще раза в игровой день)
  letterBusy = false;
  letterNextAt = 0;
  mailShownId = 0; // последнее письмо, опубликованное в чат
  fanReplyQueued = false; // реакция команды ждёт свободного чата
  /** PLAN-22: сколько пар уже отправлено в аккаунт (не гоняем запись на каждом автосейве) */
  private syncedCombos = 0;
  private onCombosChanged?: (combos: string[]) => void;
  /** PLAN-39: мешок мини-игр аккаунта — поставщик id следующей игры */
  private nextMinigameId?: () => string;
  /** PLAN-40: победа аккаунта (100/100) — гейт авторежима; релизы аккаунта — гейты скоростей */
  victory = false;
  accountReleases = 0;

  constructor(deps: GameServerDeps = {}) {
    this.llm = deps.llm ?? generateWithFallback;
    this.story = deps.story ?? generateStory;
    this.saves = deps.persist ?? new SaveManager(deps.savePath ?? SAVE_PATH);
    const loaded = this.saves.read();
    this.game = loaded?.game ?? newGame(Math.floor(Math.random() * 99991) + 1);
    this.chat = loaded?.chat ?? resetChat();
    // BUG-01: догон консольных событий, пропущенных к текущему дню (старый сейв/пауза)
    if (loaded) consoleEvents(this.game);
    // PLAN-22: набор аккаунта — источник правды по доступности комбо (сейв мог отстать)
    this.onCombosChanged = deps.onCombosChanged;
    // PLAN-39/40: прогресс аккаунта — победа и релизы (пороги авторежима и скоростей)
    this.nextMinigameId = deps.nextMinigameId;
    this.victory = deps.victory === true;
    this.accountReleases = Math.max(0, Math.floor(deps.accountReleases ?? 0));
    this.game.openedCombos = [...new Set([...(this.game.openedCombos ?? []), ...(deps.openedCombos ?? [])])];
    this.syncedCombos = this.game.openedCombos.length;
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
    return {
      game: this.game, chat: this.chat, speed: this.speed, autopilot: this.autopilotOn,
      victory: this.victory, accountReleases: this.accountReleases,
    };
  }

  // шаги хореографии автопилота (виртуальная мышь клиента)
  subscribeSteps(fn: (s: AutopilotStep) => void): () => void {
    this.stepListeners.add(fn);
    return () => { this.stepListeners.delete(fn); };
  }

  emitStep(s: AutopilotStep): void {
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
  /** (пере)запуск тикера после смены скорости (цикл — в ticker.ts, SRV-22) */
  startTicker(): void {
    this.ticker.start();
  }

  /** AP-07: смена скорости из автопилота (адаптивный темп) — та же валидация, что у set_speed */
  setSpeed(v: number): void {
    if (!Number.isFinite(v) || v < 0 || v > MAX_SPEED) return;
    this.speed = v;
    this.startTicker();
    this.emit();
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

  // SRV-05: подписчики на результат сюжета — по одному на соединение; ответ адресуется
  // reqId-эхом, клиент матчит свой запрос (вкладки больше не перехватывают чужой сюжет)
  private storyListeners = new Set<(res: { ok: boolean; reqId?: number; title?: string; plot?: string; error?: string }) => void>();

  /** подписка на результат генерации сюжета; возвращает функцию отписки */
  addStoryListener(cb: (res: { ok: boolean; reqId?: number; title?: string; plot?: string; error?: string }) => void): () => void {
    this.storyListeners.add(cb);
    return () => { this.storyListeners.delete(cb); };
  }

  /** генерация названия и сюжета через GigaChat (асинхронно, ответ — подписчикам с reqId) */
  async runStory(msg: { genreId: string; typeId: string; reqId?: number }): Promise<void> {
    const emitStory = (res: { ok: boolean; title?: string; plot?: string; error?: string }): void => {
      for (const l of this.storyListeners) l({ ...res, reqId: msg.reqId });
    };
    try {
      const g = genreById(msg.genreId);
      const t = typeById(msg.typeId);
      if (!g || !t) throw new Error('Жанр или тема не найдены');
      const s = await this.story(g.ru ?? g.name, t.nameRu ?? t.name);
      emitStory({ ok: true, ...s });
    } catch (e) {
      emitStory({ ok: false, error: e instanceof Error ? e.message : 'Ошибка генерации' });
    }
  }

  /** SRV-22: диспетчер действий клиента — см. server/actions.ts */
  handle(msg: ClientAction): void {
    dispatchClientAction(this, msg);
  }

  // ─── автопилот (plan/14): логика — в autopilot.ts (AutopilotController) ───
  /** Ручное включение автопилота (кнопка «Отдать управление») — вызывает диспетчер. */
  startAutopilot(): void {
    this.pilot.startAutopilot();
  }

  /** Выключение автопилота: босс снова у руля; silent — без реплики «Босс вернулся» */
  stopAutopilot(silent: boolean): void {
    this.pilot.stopAutopilot(silent);
  }

  /** @internal для GameTicker: «театр» событий, обсуждение→решение, таймаут плана */
  maybeAutopilot(): void {
    this.pilot.maybeAutopilot();
  }

  /** PLAN-26: журнал промахов автопилота (клиентские отчёты + серверные сигналы). */
  logAutopilot(entry: Record<string, unknown>): void {
    writeAutopilotLog(entry);
  }

  /** PLAN-25: сигнал от клиента — хореография политики отыграна, откат по дедлайну не нужен. */
  autopilotStepsDone(): void {
    this.pilot.autopilotStepsDone();
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

  // ─── чат-оркестрация (SRV-22): тела методов — в chatflow.ts ───
  /** @internal для GameTicker: фазы обсуждения по прогрессу проекта */
  maybeTriggerPhases(): void {
    this.chatflow.maybeTriggerPhases();
  }

  generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void> {
    return this.chatflow.generatePhase(phase, extra, openingFor);
  }

  /**
   * PLAN-30: тексты десяти критиков после релиза — один батч-запрос к LLM.
   * В reviewMessages уже лежат фолбэки (по оценке), поэтому провал LLM ничего не ломает.
   */
  async generatePress(force = false): Promise<void> {
    // PLAN-30: цель — ПОСЛЕДНЯЯ ЗАПИСЬ архива, а не activeGame: релиз обнуляет activeGame (dev.ts),
    // поэтому раньше генерация после выпуска уходила в «нет активной игры». Запись живёт всегда.
    const rec = this.game.history[this.game.history.length - 1];
    if (!rec || (rec.judgeScores?.length ?? 0) !== CRITICS.length) {
      console.warn('[gds] пресса: пропуск —', rec ? `оценок ${rec.judgeScores?.length ?? 0}` : 'нет записей');
      return;
    }
    if (!force) {
      // самолечение: трогаем только записи со служебными фолбэками и не старше 20 игровых дней
      const texts = rec.reviewMessages ?? [];
      const isFallback =
        texts.length > 0 &&
        texts.every(
          (t) => MESSAGES.some((m) => m.message === t) || RU_FALLBACKS.has(t),
        );
      if (!isFallback) return; // возраст не ограничиваем: при быстром темпе 20 «дней» — это минута
    }
    const facts = [
      `Игра: «${rec.name}»`,
      `Описание: ${rec.plot || 'без описания'}`,
      `Формула: ${genreById(rec.genreId)?.ru ?? rec.genreId} × ${typeById(rec.typeId)?.nameRu ?? typeById(rec.typeId)?.name ?? rec.typeId}`,
      `Консоль: ${consoleDataFor(this.game, rec.consoleId)?.name ?? rec.consoleId}`,
      `Оценка прессы: ${rec.score ?? 0}/100`,
      rec.contrib && Object.keys(rec.contrib).length > 0
        ? `Вклад команды (топ-3): ${Object.entries(rec.contrib)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([n, v]) => `${n} (${Math.round(v)})`)
            .join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    const texts = await this.runPress(facts, criticsLine(rec.judgeScores ?? []));
    if (texts === null) return;
    rec.reviewMessages = texts;
    console.log(force ? '[gds] пресса: 10 отзывов готовы' : '[gds] пресса: запись вылечена — 10 отзывов готовы');
    this.emit();
    this.saveNow();
  }

  /** PLAN-30: две попытки — GigaChat иногда отвечает пустым/битым; причина отказа — в лог. */
  private async runPress(facts: string, critics: string): Promise<string[] | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const out = await this.llm(buildPressMessages(facts, critics), 1400);
        const texts = parsePressAnswer(out.text, attempt);
        if (texts !== null) return texts;
      } catch (e) {
        console.warn(`[gds] пресса: попытка ${attempt} — ошибка LLM:`, String(e).slice(0, 120));
      }
    }
    console.warn('[gds] пресса: за две попытки валидных 10 отзывов нет — остаются фолбэки');
    return null;
  }

  /** SRV-22: реплика игрока — в очередь FIFO, если команда ещё отвечает (вызывает диспетчер). */
  queuePlayerMessage(text: string): void {
    this.chatflow.queuePlayerMessage(text);
  }

  /** @internal для GameTicker: докрутить следующую реплику, если команда ещё пишет */
  pumpChatThread(): void {
    this.chatflow.pumpThread();
  }

  /** «Пол» очереди: раньше этой недели новое сообщение не выскочит вперёд (письма, 10.09.2026). */
  chatFloor(): number {
    return this.chatflow.chatFloor();
  }

  /** Системная запись: встаёт за недоставленными сообщениями очереди (см. chatflow.ts). */
  pushSystem(text: string): void {
    this.chatflow.pushSystem(text);
  }

  /** 16: реплики обсуждения автопилота (из решения чата) — в очередь чата. */
  publishDiscussion(lines: { author: string; text: string }[]): void {
    this.chatflow.publishDiscussion(lines);
  }

  // ─── M5: письма фанатов (SRV-22): логика — в mail.ts ───
  /** @internal для GameTicker: LLM-тексты и публикация писем (см. mail.ts). */
  maybeMailLetters(): void {
    this.mailer.maybeMailLetters();
  }

  // ─── PLAN-39/40: мини-игры и награды аккаунта ───
  /** @internal для GameTicker: добрать gameId мини-игры из мешка аккаунта. */
  maybeFillMinigame(): void {
    const ev = this.game.pendingEvent;
    if (ev?.type !== 'minigame' || ev.gameId) return;
    ev.gameId = this.nextMinigameId?.() ?? MINIGAME_ROTATION[0];
    this.emit();
  }

  /** PLAN-39/40: релиз — счётчики аккаунта; первая победа (100/100) открывает авторежим. */
  noteRelease(score: number): void {
    this.accountReleases += 1;
    if (this.victory) return;
    if (score >= 100) {
      this.victory = true;
      const title = '🏆 ПОБЕДА 100/100!';
      const text = 'Все десять критиков поставили 10/10. Авторежим «Отдать управление» открыт навсегда — в любой партии.';
      if (!this.game.pendingEvent) this.game.pendingEvent = { type: 'info', title, text };
      else this.game.lastPopup = { title, text };
      log(this.game, '🏆 Победа: 100/100 — авторежим открыт навсегда');
    }
  }

  // ─── сейвы ───
  /** SRV-08: принудительный сейв (SIGINT/SIGTERM/краш) — вызывается из server.ts */
  saveNow(): void {
    this.autosave(true);
  }

  /** @internal для GameTicker: обычный автосейв; force — в обход дебаунса по дням */
  autosave(force = false): void {
    this.saves.autosave(this.game, this.chat, force);
    this.flushCombos();
  }

  /** PLAN-22: сразу отдать новые комбо в аккаунт (не ждём автосейв — уровень в меню должен быть свежим). */
  flushCombos(): void {
    const combos = this.game.openedCombos ?? [];
    if (this.onCombosChanged && combos.length > this.syncedCombos) {
      this.syncedCombos = combos.length;
      this.onCombosChanged(combos);
    }
  }

  /** остановка тикера (тесты, graceful shutdown) */
  dispose(): void {
    this.ticker.stop();
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
