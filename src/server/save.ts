// SaveManager: чтение/запись save.json (формат 2: { game, chat }; формат 1 легаси — сам GameState).
// Дебаунс по игровым дням + атомарная запись (tmp+rename); битый сейв уходит в .corrupt-бэкап.
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { isValidGameState, migrateSave, normalizeLegacyContrib } from '../core/migrate';
import type { GameState } from '../core/types';
import type { ChatState } from '../shared/chat';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const SAVE_PATH = `${ROOT}data/save.json`;
// аудит 05.09: сейв писался каждый тик неатомарно; теперь — дебаунс по игровым дням
// + tmp+rename (обрыв процесса не бьёт JSON), битый сейв уходит в .corrupt-бэкап
const SAVE_DEBOUNCE_DAYS = 10;

/** Результат чтения/импорта: живой стейт + чат из сейва (null — чата не было/невалиден). */
export interface LoadedSave {
  game: GameState;
  chat: ChatState | null;
}

export class SaveManager {
  private lastSaveDay = 0;

  constructor(private readonly path: string) {}

  /** Читает сейв; null — файла нет/битый (перед началом новой игры делается .corrupt-бэкап). */
  read(): LoadedSave | null {
    try {
      const raw = fs.readFileSync(this.path, 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      // формат 2 (SRV-21): { game, chat }; формат 1 (легаси): сам GameState
      const wrapped = !!parsed && typeof parsed === 'object' && 'game' in (parsed as Record<string, unknown>);
      const candidate = wrapped ? (parsed as { game: unknown }).game : parsed;
      if (isValidGameState(candidate)) {
        migrateSave(candidate); // версия формата + repair-нормализации (adFansGained, висящая пауза)
        normalizeLegacyContrib(candidate);
        this.lastSaveDay = candidate.week;
        const chat = wrapped ? (parsed as { chat?: unknown }).chat : undefined;
        return { game: candidate, chat: chat && Array.isArray((chat as ChatState).msgs) ? (chat as ChatState) : null };
      }
      console.error('[gds] сейв не похож на GameState — начинаем новую игру');
      this.backup('не похож на GameState');
    } catch (e) {
      // битый JSON не должен молча стирать партию: сохраняем улику и сообщаем;
      // отсутствие файла — обычный первый запуск, это НЕ повреждение
      if (fs.existsSync(this.path)) this.backup(String(e).slice(0, 300));
    }
    return null;
  }

  /** Автосейв с дебаунсом по игровым дням; force — писать всегда (SRV-08). */
  autosave(game: GameState, chat: ChatState, force = false): void {
    if (!force && game.week - this.lastSaveDay < SAVE_DEBOUNCE_DAYS) return;
    try {
      const tmp = `${this.path}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ game, chat })); // SRV-21: чат переживает рестарт
      fs.renameSync(tmp, this.path); // атомарно: tmp появляется целиком, rename заменяет
      this.lastSaveDay = game.week;
    } catch (e) {
      console.error('[gds] автосейв не удался:', String(e).slice(0, 300));
    }
  }

  exportPayload(game: GameState, chat: ChatState): string {
    return JSON.stringify({ game, chat });
  }

  /** Импорт: схемная проверка ДО подмены живой партии (SRV-02); бэкап pre-import внутри. */
  importPayload(raw: string): LoadedSave | null {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const wrapped = !!parsed && typeof parsed === 'object' && 'game' in (parsed as Record<string, unknown>);
      const candidateRaw = wrapped ? (parsed as { game: unknown }).game : parsed;
      if (!isValidGameState(candidateRaw)) {
        console.error('[gds] импорт отклонён: файл не похож на сейв GameState');
        return null;
      }
      // кандидат готовим и мигрируем на копии — живая партия не мутируется до успеха
      const candidate = migrateSave(JSON.parse(JSON.stringify(candidateRaw)) as GameState);
      normalizeLegacyContrib(candidate);
      // аудит 05.09: импорт затирает текущую партию — бэкап перед перезаписью
      try {
        if (fs.existsSync(this.path)) fs.copyFileSync(this.path, `${this.path}.pre-import-${Date.now()}`);
      } catch { /* бэкап не критичен */ }
      const chat = wrapped ? (parsed as { chat?: unknown }).chat : undefined;
      return { game: candidate, chat: chat && Array.isArray((chat as ChatState).msgs) ? (chat as ChatState) : null };
    } catch (e) {
      console.error('[gds] импорт сейва не удался:', String(e).slice(0, 300));
      return null;
    }
  }

  /** Копия повреждённого сейва — «улика» рядом с файлом. */
  private backup(why: string): void {
    try {
      fs.copyFileSync(this.path, `${this.path}.corrupt-${Date.now()}`);
      console.error('[gds] сейв повреждён — бэкап в data/save.json.corrupt-*; начата новая игра:', why);
    } catch {
      console.error('[gds] сейв повреждён и бэкап не удался:', why);
    }
  }
}
