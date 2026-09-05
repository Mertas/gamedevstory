// Единый лог игровых событий (был скопирован в 5 систем — только здесь, LOG_CAP из CONFIG).
import { CONFIG } from './config';
import type { GameState } from './types';

export function log(state: GameState, text: string): void {
  state.log.push({ week: state.week, year: state.year, text });
  if (state.log.length > CONFIG.LOG_CAP) state.log.splice(0, state.log.length - CONFIG.LOG_CAP);
}
