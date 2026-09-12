// SRV-22 (шаг 3, Ф3): тикер игровых дней — вынесен из game.ts.
// Интервал зависит от скорости; при висящем событии — пульс state ~раз в 1.5с
// (клиент, потерявший попап, восстановит его; открытый попап не пересоздаётся).
import { CONFIG } from '../core/config';
import { tick } from '../core/engine';
import { deliverChat, type ChatState } from '../shared/chat';
import type { GameState } from '../core/types';
import { MAX_SPEED } from './actions';

/** Всё, что тикеру нужно от сессии (GameServer подходит структурно). */
export interface TickerHost {
  game: GameState;
  chat: ChatState;
  speed: number;
  emit(): void;
  maybeAutopilot(): void;
  maybeTriggerPhases(): void;
  maybeMailLetters(): void;
  pumpChatThread(): void;
  autosave(force?: boolean): void;
}

export class GameTicker {
  private timer: NodeJS.Timeout | null = null;
  private lastPulse = 0; // последний state-пульс при висящем событии (пауза)
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
      // PLAN-25: попап события и хореография автопилота обязаны жить И на паузе — пауза
      // останавливает игровое ВРЕМЯ, а не логику сессии. Иначе игрок, поставивший игру на паузу,
      // навсегда застревал на неразрешённом попапе (автопилот не мог дойти до его резолва).
      if (game.pendingEvent) {
        // пульс: пока событие ждёт решения, шлём state ~раз в 1.5с. Клиент, потерявший
        // попап (клик ушёл в оборванный WS), вернёт его; открытый попап не пересоздаётся
        // (клиент сверяет evKey).
        if (Date.now() - this.lastPulse >= 1500) {
          this.lastPulse = Date.now();
          this.host.emit();
        }
        // аудит 06.09: театр автопилота обязан работать И при висящем событии —
        // иначе мышь не летит к «Выпустить игру», и событие никто не резолвит
        this.host.maybeAutopilot();
        return; // время не идёт: тика дня нет, но попап и мышь живут
      }
      if (this.host.speed <= 0 || game.bankrupt) return;
      tick(game);
      deliverChat(game, chat);
      this.host.maybeTriggerPhases();
      this.host.pumpChatThread();
      this.host.maybeMailLetters();
      this.host.maybeAutopilot();
      this.host.autosave();
      this.host.emit();
    } catch (e) {
      // SRV-07: исключение в тике не должно ронять процесс — лог + принудительный сейв
      console.error('[gds] ошибка тика (сервер продолжает работу):', String(e).slice(0, 300));
      this.host.autosave(true);
    }
  }
}
