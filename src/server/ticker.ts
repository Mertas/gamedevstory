// SRV-22 (шаг 3, Ф3): тикер игровых дней — вынесен из game.ts.
// PLAN-45: серверный пульс убран (лишний полный снапшот каждые 1.5с на паузе) — потерянный
// попап клиент возвращает сам, локальным таймером (см. store.ts); тикерные эмиты схлопываются.
import { CONFIG } from '../core/config';
import { ensureDifficulty, isDifficultyId } from '../core/difficulty';
import { tick } from '../core/engine';
import { deliverChat, type ChatState } from '../shared/chat';
import type { GameState } from '../core/types';
import { MAX_SPEED } from './actions';

/** Всё, что тикеру нужно от сессии (GameServer подходит структурно). */
export interface TickerHost {
  game: GameState;
  chat: ChatState;
  speed: number;
  emitTick(): void; // PLAN-45: кадр тика (с окном схлопывания)
  maybeAutopilot(): void;
  maybeGamedexTimeout(): void; // аудит-51 03-P2-3: выставку можно «переждать»
  maybeTriggerPhases(): void;
  maybeFillMinigame(): void;
  maybeMailLetters(): void;
  pumpChatThread(): void;
  autosave(force?: boolean): void;
}

export class GameTicker {
  private timer: NodeJS.Timeout | null = null;
  constructor(private readonly host: TickerHost) {}

  /** (пере)запустить цикл — после смены скорости и при старте сессии */
  start(): void {
    this.stop();
    // SRV-01: кламп на случай любого источника (валидация set_speed — первая линия)
    const clamped = Number.isFinite(this.host.speed) ? Math.min(Math.max(this.host.speed, 0), MAX_SPEED) : 1;
    this.timer = setInterval(() => this.step(), Math.round(CONFIG.TICK_MS / Math.max(0.5, clamped)));
  }

  /** остановка (graceful shutdown, тесты) */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private step(): void {
    try {
      const { game, chat } = this.host;
      // аудит-51 СВОД-P1-1: конфиг ЭТОЙ партии — до любых чтений CONFIG в шаге (сессии чередуются)
      ensureDifficulty(isDifficultyId(game.difficulty) ? game.difficulty : 'normal');
      // аудит-51 03-P2-3: незатронутый попап Gamedex «уезжает» сам (таймер реального времени — день года не идёт)
      this.host.maybeGamedexTimeout();
      // PLAN-25: попап события и хореография автопилота обязаны жить И на паузе — пауза
      // останавливает игровое ВРЕМЯ, а не логику сессии. Иначе игрок, поставивший игру на паузу,
      // навсегда застревал на неразрешённом попапе (автопилот не мог дойти до его резолва).
      if (game.pendingEvent) {
        // PLAN-45: пульса нет — клиент сам возвращает «потерянный» попап локальным таймером.
        // аудит 06.09: театр автопилота обязан работать И при висящем событии —
        // иначе мышь не летит к «Выпустить игру», и событие никто не резолвит
        this.host.maybeFillMinigame();
        this.host.maybeAutopilot();
        return; // время не идёт: тика дня нет, но попап и мышь живут
      }
      if (this.host.speed <= 0 || game.bankrupt) return;
      tick(game);
      deliverChat(game, chat);
      this.host.maybeTriggerPhases();
      this.host.maybeFillMinigame();
      this.host.pumpChatThread();
      this.host.maybeMailLetters();
      this.host.maybeAutopilot();
      this.host.autosave();
      this.host.emitTick(); // PLAN-45: кадр тика (схлопывание на высоких скоростях)
    } catch (e) {
      // SRV-07: исключение в тике не должно ронять процесс — лог + принудительный сейв
      console.error('[gds] ошибка тика (сервер продолжает работу):', String(e).slice(0, 300));
      this.host.autosave(true);
    }
  }
}
