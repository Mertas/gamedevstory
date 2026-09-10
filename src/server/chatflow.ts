// SRV-22 (шаг 4, Ф3): чат-оркестрация — вынесена из game.ts.
// Очереди фаз и реплик, серии диалогов, системные записи, фазы по прогрессу проекта.
// Состояние (chatThread/pendingPlayers/pendingPhases) остаётся в GameServer — класс
// работает с ним через ChatHost (структурная проверка при конструировании).
import { STAFF, consoleById, genreById, typeById } from '../core/data/db';
import { avatarFor, chatSystem, type ChatMsg, type ChatState } from '../shared/chat';
import { buildMessages, parseSingleMessage } from './chatgen';
import type { GameState } from '../core/types';
import type { LlmFn } from './giga';
import type { ChatThread } from './game';

/** Всё, что чат-машине нужно от сессии (GameServer подходит структурно). */
export interface ChatHost {
  game: GameState;
  chat: ChatState;
  llm: LlmFn;
  chatThread: ChatThread | null;
  pendingPlayers: string[];
  pendingPhases: { phase: string; extra?: Record<string, unknown>; openingFor?: string }[];
  emit(): void;
}

export class ChatOrchestrator {
  constructor(private readonly h: ChatHost) {}

  // ─── чат: фазы по прогрессу ───
  maybeTriggerPhases(): void {
    const g = this.h.game.activeGame;
    if (!g) return;
    if (!this.h.chat.phases.alpha && g.progress >= 0.4) {
      this.h.chat.phases.alpha = true;
      void this.generatePhase('alpha');
    }
    if (!this.h.chat.phases.beta && g.progress >= 0.8) {
      this.h.chat.phases.beta = true;
      void this.generatePhase('beta');
    }
    if (!this.h.chat.phases.debug && g.phase === 'debug') {
      this.h.chat.phases.debug = true;
      void this.generatePhase('debug');
    }
  }

  async generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void> {
    // чат занят (отвечает игроку / идёт другая фаза) — встаём в очередь
    if (this.h.chatThread) {
      // SRV-12: очередь сцен (FIFO, лимит 5) — события не схлопываются в одно
      if (this.h.pendingPhases.length < 5) this.h.pendingPhases.push({ phase, extra, openingFor });
      return;
    }
    // событие фазы → живая серия: реплики по одной, с ответами друг другу
    const left = phase === 'boost' ? 2 : phase === 'hire' ? 3 : phase === 'fanmail' ? 4 : phase === 'autopilot_discuss' ? 3 : phase === 'boss_back' ? 4 : 5; // ответов после открывающей
    this.h.chatThread = { phase, extra: extra ?? {}, left, busy: false, nextAt: this.h.game.week, errors: 0, openingFor };
    void this.nextReply();
  }

  /** SRV-22: реплика игрока — в очередь FIFO, если команда ещё отвечает (вызывает диспетчер). */
  queuePlayerMessage(text: string): void {
    if (this.h.chatThread) this.h.pendingPlayers.push(text); // SRV-11: FIFO — все вопросы будут отвечены
    else this.startPlayerThread(text);
  }

  /** Тик-пульс: докрутить следующую реплику, если команда ещё пишет. */
  pumpThread(): void {
    if (this.h.chatThread) void this.nextReply();
  }

  // игрок написал в чат: команда отвечает серией из 1..7 реплик (зависит от «объёма» вопроса)
  private startPlayerThread(text: string): void {
    const l = text.length;
    const hi = l < 50 ? 2 : l < 140 ? 4 : 7;
    const left = 1 + Math.floor(Math.random() * hi);
    this.h.chatThread = { phase: 'player', extra: { text }, left, busy: false, nextAt: this.h.game.week, errors: 0 };
    void this.nextReply();
  }

  // одна реплика диалога: кто-то отвечает на последнюю (или открывает серию)
  private async nextReply(): Promise<void> {
    const t = this.h.chatThread;
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
    if (this.h.game.week < t.nextAt) return;
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
      t.nextAt = this.h.game.week + 3; // следующая генерация — после доставки (week+2)
      this.maybeEndThread();
    }
  }

  private maybeEndThread(): void {
    const t = this.h.chatThread;
    if (!t) return;
    if (t.left > 0 && t.errors < 3) return;
    this.h.chatThread = null;
    // LLM-02: серия оборвалась из-за ошибок LLM — игрок должен это видеть
    if (t.errors >= 3) this.pushSystem('📡 Связь с командой пропала — они не смогли ответить. Напишите ещё раз.');
    const nextPlayer = this.h.pendingPlayers.shift();
    if (nextPlayer !== undefined) {
      // сначала ответим на вопросы игрока (FIFO), потом — отложенные события
      this.startPlayerThread(nextPlayer);
    } else {
      const p = this.h.pendingPhases.shift();
      if (p) void this.generatePhase(p.phase, p.extra, p.openingFor);
    }
  }

  // ─── Порядок чата (10.09.2026): события не рвут живые диалоги ───
  /** «Пол» очереди: раньше этой недели новое сообщение не должно выскочить вперёд. */
  chatFloor(): number {
    let w = this.h.game.week;
    for (const m of this.h.chat.queue) if (m.week > w) w = m.week;
    return w;
  }

  /** Системная запись: если в очереди есть недоставленные сообщения — встаёт за ними (очередь). */
  pushSystem(text: string): void {
    if (this.h.chat.queue.length === 0) {
      chatSystem(this.h.game, this.h.chat, text);
      return;
    }
    this.h.chat.queue.push({
      week: this.chatFloor(), author: 'Система', avatar: '', text, system: true, trigger: 'week',
    });
    this.h.emit();
  }

  private lastStaffText(): string | null {
    for (const m of [...this.h.chat.msgs].reverse()) {
      if (m.author !== 'Система') return m.text;
    }
    return null;
  }

  /** Зачины недавних реплик (для «не повторяй»): реплики этого треда + доставленные в чат. */
  private recentOpenings(t: ChatThread): string[] {
    const parts = (t.lines ?? []).slice(-4).map((h) => h.text.slice(0, 60));
    for (const m of [...this.h.chat.msgs].reverse()) {
      if (m.system || m.author === 'Система' || m.author.endsWith('(фанат)')) continue;
      parts.push(m.text.slice(0, 60));
      if (parts.length >= 6) break;
    }
    return parts.slice(0, 6);
  }

  /** Ротация говорящих: сначала не говорившие в диалоге, затем самые молчаливые по игре. */
  private silentFirstTeam(spoken: string[]): string[] {
    const counts = new Map<string, number>();
    for (const m of this.h.chat.msgs) {
      if (m.system || m.author === 'Система' || m.author.endsWith('(фанат)')) continue;
      counts.set(m.author, (counts.get(m.author) ?? 0) + 1);
    }
    return this.h.game.staff
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
    const first = await this.h.llm(buildMessages(t.phase, ctx, opts), 600);
    let parsed = parseSingleMessage(first.text);
    // ротация: модель выбрала уже говорившего, хотя есть молчащие → один повтор с жёстким списком
    if (parsed && replyTo && spoken.length > 0 && silent.length > 0 && spoken.includes(parsed.author)) {
      const again = await this.h.llm(buildMessages(t.phase, ctx, { ...opts, hardRotate: true }), 600);
      parsed = parseSingleMessage(again.text) ?? parsed;
    }
    const valid = parsed && this.h.game.staff.some((s) => s.name === parsed.author) && parsed.text.length >= 4 && parsed.text.length <= 500;
    if (!valid || !parsed) throw new Error('нет валидной реплики');
    // запомнили реплику и говорящего: следующие вызовы увидят историю и не повторят автора
    t.lines = [...lines, { author: parsed.author, text: parsed.text }];
    if (!spoken.includes(parsed.author)) t.spoken = [...spoken, parsed.author];
    const msg: ChatMsg = {
      week: Math.max(this.h.game.week + (replyTo ? 2 : 1), this.chatFloor()),
      author: parsed.author,
      avatar: avatarFor(this.h.game, parsed.author),
      text: parsed.text,
      trigger: 'week',
    };
    this.h.chat.queue.push(msg);
    this.h.emit();
  }

  private buildContext(phase: string, extra?: Record<string, unknown>): Record<string, unknown> {
    const g = this.h.game.activeGame;
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
      week: this.h.game.week,
      year: this.h.game.year,
      money: Math.round(this.h.game.money),
      fans: Math.round(this.h.game.fans),
      research: Math.round(this.h.game.research),
      project,
      // как игрок распределил очки направления в последнем проекте (и режим) — чтобы
      // сотрудники могли обсуждать выбор в чате
      lastProject: {
        genre: this.h.game.lastGenreId ? genreById(this.h.game.lastGenreId)?.name ?? this.h.game.lastGenreId : null,
        type: this.h.game.lastTypeId ? typeById(this.h.game.lastTypeId)?.name ?? this.h.game.lastTypeId : null,
        mode: this.h.game.lastMode,
        direction: this.h.game.lastDirection,
      },
      staff: this.h.game.staff.map((s) => ({
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
}
