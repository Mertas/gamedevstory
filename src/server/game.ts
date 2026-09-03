// Игровая сессия на сервере: состояние + тикер + действия + чат-фазы (GigaChat) + автосейв.
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG, type HireMethodId } from '../core/config';
import { COMBO_GRADES, ADS, BOOSTER_PRICES, CONSOLES, CONSUMABLE_PRICES, CONTRACTS, GENRES, GENRE_ORDER, STAFF, TRAININGS, TYPES, consoleById, genreById, typeById } from '../core/data/db';
import type { CareerId } from '../core/data/schema';
import {
  buyLicenseAction, buyAdAction, buyBoosterAction, buyCareerManualAction, buyDeadBullAction,
  changeCareerAction, dismissSalesmanAction, fireAction, hireAction, hireByIdAction, levelUpAction, moveOfficeAction, newGame,
  releaseAction, resolveBoostAction, resolveDisasterAction, resolveEventAction, startOwnConsoleAction, startProjectAction,
  takeContractAction, tick, trainAction, useBoosterAction,
} from '../core/engine';
import type { GameState, StartProjectInput } from '../core/types';
import { avatarFor, chatSystem, deliverChat, resetChat, type ChatMsg, type ChatState } from '../shared/chat';
import type { MetaData } from '../shared/meta';
import { buildMessages, parseSingleMessage } from './chatgen';
import { generateStory, generateWithFallback } from './giga';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SAVE_PATH = `${ROOT}data/save.json`;

export interface SessionSnapshot {
  game: GameState;
  chat: ChatState;
  speed: number;
}

export type ClientAction =
  | { type: 'start_project'; input: StartProjectInput }
  | { type: 'release' }
  | { type: 'hire'; method: HireMethodId; staffId?: string; maxFee?: number }
  | { type: 'fire'; staffId: string }
  | { type: 'buy_license'; consoleId: string }
  | { type: 'resolve_boost'; accept: boolean; amount?: number }
  | { type: 'resolve_salesman' }
  | { type: 'resolve_disaster' }
  | { type: 'resolve_event' }
  | { type: 'generate_story'; genreId: string; typeId: string }
  | { type: 'set_speed'; v: number }
  | { type: 'new_game' }
  | { type: 'get_state' }
  // M3
  | { type: 'level_up'; staffId: string }
  | { type: 'train'; staffId: string; trainingId: number }
  | { type: 'change_career'; staffId: string; target: CareerId }
  | { type: 'buy_booster'; booster: string }
  | { type: 'use_booster'; staffId: string; booster: string }
  | { type: 'buy_dead_bull'; staffId: string }
  | { type: 'buy_career_manual'; staffId: string; target: CareerId }
  | { type: 'move_office' }
  // M4
  | { type: 'buy_ad'; adId: number }
  | { type: 'take_contract'; contractId: number; staffIds: string[] }
  | { type: 'start_own_console'; name: string; kind: 'console' | 'portable'; cpu: string; media: string };

interface ChatThread {
  phase: string;
  extra: Record<string, unknown>;
  left: number; // сколько ответов осталось сгенерировать
  nextAt: number; // не генерировать раньше этого дня
  busy: boolean; // LLM-вызов в процессе
  errors: number;
  openingDone?: boolean;
  openingFor?: string; // кто должен открыть серию (новичок представляется)
}

export class GameServer {
  private game: GameState;
  private chat: ChatState;
  private speed = 1;
  private timer: NodeJS.Timeout | null = null;
  private listeners = new Set<(s: SessionSnapshot) => void>();
  private phaseGen = new Set<string>();
  private chatThread: ChatThread | null = null; // фазы чата в процессе генерации
  private lastAction: { ok: boolean; error?: string } | null = null;

  constructor() {
    this.game = this.load();
    this.chat = resetChat();
    this.startTicker();
  }

  // ─── подписка ───
  subscribe(fn: (s: SessionSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): SessionSnapshot {
    return { game: this.game, chat: this.chat, speed: this.speed };
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

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  // ─── тикер ───
  private startTicker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.speed <= 0 || this.game.bankrupt || this.game.pendingEvent) return;
      tick(this.game);
      deliverChat(this.game, this.chat);
      this.maybeTriggerPhases();
      if (this.chatThread) void this.nextReply();
      this.autosave();
      this.emit();
    }, Math.round(CONFIG.TICK_MS / Math.max(0.5, this.speed)));
  }

  // ─── действия игрока ───
  /** забрать результат последнего действия (для action_result) */
  actionResult(): { ok: boolean; error?: string } | null {
    const r = this.lastAction;
    this.lastAction = null;
    return r;
  }

  private run(res: { ok: boolean; error?: string; popup?: { title: string; text: string } }): void {
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
  private async runStory(msg: { genreId: string; typeId: string }): Promise<void> {
    try {
      const g = genreById(msg.genreId);
      const t = typeById(msg.typeId);
      if (!g || !t) throw new Error('Жанр или тема не найдены');
      const s = await generateStory(g.ru ?? g.name, t.nameRu ?? t.name);
      this.storyCb?.({ ok: true, ...s });
    } catch (e) {
      this.storyCb?.({ ok: false, error: e instanceof Error ? e.message : 'Ошибка генерации' });
    }
  }

  handle(msg: ClientAction): void {
    this.lastAction = null;
    switch (msg.type) {
      case 'set_speed':
        this.speed = msg.v;
        this.startTicker();
        this.emit();
        return;
      case 'new_game': {
        this.game = newGame(Math.floor(Math.random() * 99991) + 1);
        this.chat = resetChat();
        this.autosave();
        this.emit();
        return;
      }
      case 'start_project': {
        const res = startProjectAction(this.game, msg.input);
        this.run(res);
        if (res.ok) {
          chatSystem(this.game, this.chat, '📦 Проект стартовал: разработка началась');
          void this.generatePhase('kickoff');
        }
        this.emit();
        return;
      }
      case 'release': {
        const res = releaseAction(this.game);
        this.run(res);
        if (res.ok) {
          const g = this.game.history[this.game.history.length - 1];
          chatSystem(this.game, this.chat, `🚀 Релиз! ${g ? `Рецензии: ${g.score}/40${g.score >= CONFIG.HALL_OF_FAME ? ' — ЗАЛ СЛАВЫ!' : ''}` : ''}`);
          void this.generatePhase('release', { score: g?.score ?? 0, units: g?.units ?? 0 });
        }
        this.emit();
        return;
      }
      case 'hire': {
        const opts = msg.maxFee !== undefined ? { maxFee: msg.maxFee } : undefined;
        const res = msg.staffId
          ? hireByIdAction(this.game, msg.method, msg.staffId, opts)
          : hireAction(this.game, msg.method, opts);
        this.run(res);
        // новичок представляется в чате
        if (res.ok && res.staffId) {
          const hired = this.game.staff.find((x) => x.id === res.staffId);
          if (hired) void this.generatePhase('hire', { hireName: hired.name }, hired.name);
        }
        this.emit();
        return;
      }
      case 'fire':
        this.run(fireAction(this.game, msg.staffId));
        this.emit();
        return;
      case 'buy_license': {
        const res = buyLicenseAction(this.game, msg.consoleId);
        this.run(res);
        if (res.ok) chatSystem(this.game, this.chat, '🔑 Куплена лицензия на консоль');
        this.emit();
        return;
      }
      case 'resolve_boost': {
        const ev = this.game.pendingEvent;
        const res = resolveBoostAction(this.game, msg.accept, msg.amount ?? (ev?.type === 'boost' ? ev.cost : undefined));
        this.run(res);
        // чат должен знать РЕАЛЬНЫЙ результат: смотрим outcome события-результата
        const outcome = this.game.pendingEvent?.type === 'boost_result' ? this.game.pendingEvent.outcome : undefined;
        if (ev?.type === 'boost' && msg.accept) {
          chatSystem(this.game, this.chat, '💪 Улучшение применено');
          if (outcome) void this.generatePhase('boost', { outcome });
        }
        this.emit();
        return;
      }
      case 'resolve_salesman':
        dismissSalesmanAction(this.game);
        this.emit();
        return;
      case 'resolve_disaster':
        resolveDisasterAction(this.game);
        this.emit();
        return;
      case 'resolve_event':
        resolveEventAction(this.game);
        this.emit();
        return;
      case 'generate_story':
        this.runStory(msg);
        return;
      case 'get_state':
        this.emit();
        return;
      // M3
      case 'level_up':
        this.run(levelUpAction(this.game, msg.staffId));
        this.emit();
        return;
      case 'train':
        this.run(trainAction(this.game, msg.staffId, msg.trainingId));
        this.emit();
        return;
      case 'change_career':
        this.run(changeCareerAction(this.game, msg.staffId, msg.target));
        this.emit();
        return;
      case 'buy_booster': {
        const res = buyBoosterAction(this.game, msg.booster);
        this.run(res);
        if (res.ok) chatSystem(this.game, this.chat, `🧪 Куплен бустер (${msg.booster}) — примените в окне «Код»`);
        this.emit();
        return;
      }
      case 'use_booster':
        this.run(useBoosterAction(this.game, msg.staffId, msg.booster));
        this.emit();
        return;
      case 'buy_dead_bull':
        this.run(buyDeadBullAction(this.game, msg.staffId));
        this.emit();
        return;
      case 'buy_career_manual':
        this.run(buyCareerManualAction(this.game, msg.staffId, msg.target));
        this.emit();
        return;
      case 'move_office':
        this.run(moveOfficeAction(this.game));
        this.emit();
        return;
      // M4
      case 'buy_ad':
        this.run(buyAdAction(this.game, msg.adId));
        this.emit();
        return;
      case 'take_contract':
        this.run(takeContractAction(this.game, msg.contractId, msg.staffIds));
        this.emit();
        return;
      case 'start_own_console':
        this.run(startOwnConsoleAction(this.game, msg.name, msg.kind, msg.cpu, msg.media));
        this.emit();
        return;
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

  private async generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void> {
    // событие фазы → живая серия: реплики по одной, с ответами друг другу
    const left = phase === 'boost' ? 2 : phase === 'hire' ? 3 : 5; // ответов после открывающей
    this.chatThread = { phase, extra: extra ?? {}, left, busy: false, nextAt: this.game.week, errors: 0, openingFor };
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
      } catch {
        t.errors++;
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
    } catch {
      t.errors++;
    } finally {
      t.busy = false;
      t.nextAt = this.game.week + 3; // следующая генерация — после доставки (week+2)
      this.maybeEndThread();
    }
  }

  private maybeEndThread(): void {
    const t = this.chatThread;
    if (t && (t.left <= 0 || t.errors >= 3)) this.chatThread = null;
  }

  private lastStaffText(): string | null {
    for (const m of [...this.chat.msgs].reverse()) {
      if (m.author !== 'Система') return m.text;
    }
    return null;
  }

  private async fetchOneReply(t: NonNullable<ChatThread>, replyTo: string | undefined): Promise<void> {
    const messages = buildMessages(t.phase, this.buildContext(t.phase, t.extra), replyTo, replyTo ? undefined : t.openingFor);
    const { text } = await generateWithFallback(messages, 600);
    const parsed = parseSingleMessage(text);
    const valid = parsed && this.game.staff.some((s) => s.name === parsed.author) && parsed.text.length >= 4 && parsed.text.length <= 500;
    if (!valid || !parsed) throw new Error('нет валидной реплики');
    const msg: ChatMsg = {
      week: this.game.week + (replyTo ? 2 : 1),
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
      staff: this.game.staff.map((s) => ({
        id: s.id,
        name: s.name,
        career: s.activeCareer,
        stats: s.stats,
        power: s.power,
      })),
      facts: extra ?? {},
    };
  }

  // ─── сейвы ───
  private load(): GameState {
    try {
      const raw = fs.readFileSync(SAVE_PATH, 'utf8');
      const data = JSON.parse(raw) as GameState;
      if (data && typeof data.week === 'number') {
        // защита от легаси-сейвов: продавец ушёл, а пауза осталась
        if (data.pendingEvent?.type === 'salesman' && !data.salesmanHere) data.pendingEvent = null;
        return data;
      }
    } catch { /* нет сейва */ }
    return newGame(Math.floor(Math.random() * 99991) + 1);
  }

  private autosave(): void {
    try {
      fs.writeFileSync(SAVE_PATH, JSON.stringify(this.game));
    } catch { /* не критично */ }
  }

  exportSave(): string {
    return JSON.stringify({ game: this.game, chat: this.chat });
  }

  importSave(raw: string): boolean {
    try {
      const data = JSON.parse(raw) as { game: GameState; chat: ChatState };
      if (!data?.game || typeof data.game.week !== 'number') return false;
      this.game = data.game;
      this.chat = data.chat ?? resetChat();
      this.autosave();
      this.emit();
      return true;
    } catch {
      return false;
    }
  }
}
