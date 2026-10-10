// аудит-51 05-P2-6 / 01-P2-13: финал партии — «счёт по активам» (капитал) после завершения саги.
// Партия не заканчивается на 20-м году: сага идёт до ~27 лет от старта; после её завершения
// показываем итог и отпускаем игрока в свободную игру (решения юзера 10.10.2026).
// Без саги (SAGA_ENABLED=false) финал наступает по старым правилам — на 20-м году.
import { CONFIG } from '../config';
import { log } from '../log';
import type { ActionResult, GameState } from '../types';
import { sagaEnabled } from './saga';

/** 20 лет в днях (старт — 1 апреля 1985, год = 365 дней) — историческое «правило 20 лет» из plan/01. */
const TWENTY_YEARS = 20 * CONFIG.YEAR_LENGTH;

/** Тик: заметить завершение истории и выставить попап итога (когда сцена свободна — «одно событие за раз»). */
export function tickFinale(state: GameState): void {
  if (!state.finale) {
    const s = state.saga;
    const sagaDone = !!s && s.stage === 'done';
    const noSaga20y = !sagaEnabled() && state.week >= TWENTY_YEARS;
    if (sagaDone || noSaga20y) {
      // счёт фиксируем на момент завершения истории — «капитал на день закрытия тетради»
      state.finale = { shown: false, week: state.week, worth: Math.round(state.money) };
      log(state, '🎬 История студии завершена — время подвести итоги');
    }
  }
  if (state.finale && !state.finale.shown && !state.pendingEvent) {
    state.pendingEvent = { type: 'finale' };
  }
}

/** Кнопка «Играть дальше»: закрыть итог — партия продолжается в свободном режиме. */
export function resolveFinale(state: GameState): ActionResult {
  if (state.pendingEvent?.type !== 'finale' || !state.finale) {
    return { ok: false, error: 'Сейчас нет итога партии' };
  }
  state.pendingEvent = null;
  state.finale.shown = true;
  return { ok: true };
}
