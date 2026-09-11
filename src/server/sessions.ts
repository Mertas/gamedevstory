// PLAN-18: по игровой сессии на пользователя + сохранения в SQLite (data/users.db).
import { newGame } from '../core/engine';
import type { GameState } from '../core/types';
import { resetChat, type ChatState } from '../shared/chat';
import { GameServer } from './game';
import { parseSavePayload, type LoadedSave, type PersistAdapter } from './save';
import type { UserService } from './users';
import type { SessionHooks } from './api';

/** Полезная нагрузка сейва в БД: автосейв с тем же дебаунсом (10 игровых дней), что у файлового. */
export class DbSaveStore implements PersistAdapter {
  private lastDay = 0;

  constructor(
    private readonly users: UserService,
    private readonly userId: number,
    private readonly saveId: number,
  ) {}

  read(): LoadedSave | null {
    const row = this.users.getSave(this.userId, this.saveId);
    if (!row) return null;
    const loaded = parseSavePayload(row.payload);
    if (loaded) this.lastDay = loaded.game.week;
    return loaded;
  }

  autosave(game: GameState, chat: ChatState, force = false): void {
    if (!force && game.week - this.lastDay < 10) return;
    try {
      const ok = this.users.updateSave(
        this.userId, this.saveId, JSON.stringify({ game, chat }),
        game.week, game.year, Math.round(game.money),
      );
      if (ok) this.lastDay = game.week;
    } catch (e) {
      console.error('[gds] автосейв в БД не удался:', String(e).slice(0, 300));
    }
  }

  exportPayload(game: GameState, chat: ChatState): string {
    return JSON.stringify({ game, chat });
  }

  importPayload(raw: string): LoadedSave | null {
    return parseSavePayload(raw);
  }
}

interface LiveSession {
  saveId: number;
  server: GameServer;
}

/** Реестр игровых сессий: у каждого пользователя — своя партия и свой тикер. */
export class SessionRegistry implements SessionHooks {
  private readonly live = new Map<number, LiveSession>();

  constructor(private readonly users: UserService) {}

  /** Создать новую партию (студия + стартовая пара), сохранить в БД и сделать текущей. */
  create(userId: number, opts: { studioName: string; staffIds: string[] }): number {
    const game = newGame(Math.floor(Math.random() * 99991) + 1, {
      studioName: opts.studioName,
      staffIds: opts.staffIds,
    });
    const chat = resetChat();
    const saveId = this.users.createSave(
      userId, game.studioName, JSON.stringify({ game, chat }),
      game.week, game.year, Math.round(game.money),
    );
    this.load(userId, saveId);
    return saveId;
  }

  /** Сделать сохранение текущим: поднять (или переключить) игровую сессию пользователя. */
  load(userId: number, saveId: number): void {
    const cur = this.live.get(userId);
    if (cur?.saveId === saveId) return;
    if (cur) this.dispose(userId);
    this.live.set(userId, { saveId, server: new GameServer({ persist: new DbSaveStore(this.users, userId, saveId) }) });
  }

  /** Активная игровая сессия пользователя (null — партия не загружена). */
  server(userId: number): GameServer | null {
    return this.live.get(userId)?.server ?? null;
  }

  activeSaveId(userId: number): number | null {
    return this.live.get(userId)?.saveId ?? null;
  }

  drop(userId: number, saveId: number): void {
    const cur = this.live.get(userId);
    if (cur && cur.saveId === saveId) this.dispose(userId);
  }

  /** Остановка всех сессий (graceful shutdown) — каждая дописывает свой сейв. */
  disposeAll(): void {
    for (const userId of [...this.live.keys()]) this.dispose(userId);
  }

  private dispose(userId: number): void {
    const cur = this.live.get(userId);
    if (!cur) return;
    try { cur.server.saveNow(); } catch { /* noop */ }
    try { cur.server.dispose(); } catch { /* noop */ }
    this.live.delete(userId);
  }
}
