// Версия формата сейва и миграции.
// ПРАВИЛО: новое поле GameState = поднять SAVE_VERSION + миграция здесь;
// load()/importSave() зовут migrateSave() — ручные нормализации в game.ts не плодить.
import type { GameState } from './types';

export const SAVE_VERSION = 4; // 4: Gamedex (gamedexHere/lastGamedex/gamedexFame); 3: письма (mail); 2: реклама; 1 = всё до 04.09.2026

export function migrateSave(state: GameState): GameState {
  const v = state.saveVersion ?? 1; // сейвы без saveVersion — v1

  if (v < 2) {
    state.adFansGained = state.adFansGained ?? {};
  }
  if (v < 3) {
    state.mail = state.mail ?? [];
    state.mailId = state.mailId ?? 0;
  }
  if (v < 4) {
    state.gamedexHere = state.gamedexHere ?? false;
    state.lastGamedex = state.lastGamedex ?? null;
    state.gamedexFame = state.gamedexFame ?? 0;
  }

  // repair-нормализации, не зависящие от версии (висящие инварианты легаси-сейвов):
  // продавец ушёл, а пауза-событие осталось — иначе игра встанет навсегда
  if (state.pendingEvent?.type === 'salesman' && !state.salesmanHere) state.pendingEvent = null;

  state.saveVersion = SAVE_VERSION;
  return state;
}

/** SRV-02: схемная проверка сейва перед подменой живой партии (только структура, без семантики). */
export function isValidGameState(x: unknown): x is GameState {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const s = x as Partial<GameState>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!num(s.week) || !num(s.year) || !num(s.money) || !num(s.fans) || !num(s.research)) return false;
  if (!Array.isArray(s.staff) || !Array.isArray(s.history)) return false;
  if (!s.staff.every((st) => !!st && typeof st.id === 'string' && typeof st.name === 'string')) return false;
  if (s.mail !== undefined && !Array.isArray(s.mail)) return false;
  if (s.consoles !== undefined && (typeof s.consoles !== 'object' || s.consoles === null || Array.isArray(s.consoles))) return false;
  if (s.log !== undefined && !Array.isArray(s.log)) return false;
  // сейв «из будущего» не грузим: миграций вперёд нет
  if (s.saveVersion !== undefined && (!num(s.saveVersion) || s.saveVersion > SAVE_VERSION)) return false;
  return true;
}
