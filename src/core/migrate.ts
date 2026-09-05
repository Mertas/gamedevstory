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
