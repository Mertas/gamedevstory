// SRV-22 (шаг 5, Ф3): письма фанатов — вынесены из game.ts.
// (1) LLM дописывает текст письма; (2) готовое письмо публикуется в ЧАТ целиком, и команда
// реагирует серией реплик (фаза 'fanmail'); (3) если чат был занят — реакция откладывается.
import { buildLetterPrompt } from './chatgen';
import type { FanLetter, GameState } from '../core/types';
import type { ChatState } from '../shared/chat';
import type { LlmFn } from './giga';
import type { ChatThread } from './game';

/** Всё, что сервису писем нужно от сессии (GameServer подходит структурно). */
export interface MailHost {
  game: GameState;
  chat: ChatState;
  llm: LlmFn;
  chatThread: ChatThread | null;
  pendingPlayers: string[];
  pendingPhases: { phase: string; extra?: Record<string, unknown>; openingFor?: string }[];
  letterBusy: boolean;
  letterNextAt: number;
  fanReplyQueued: boolean;
  mailShownId: number;
  emit(): void;
  autosave(force?: boolean): void;
  generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void>;
  chatFloor(): number;
}

export class MailService {
  constructor(private readonly h: MailHost) {}

  maybeMailLetters(): void {
    // (1) LLM-текст: одно письмо за раз, не чаще раза в игровой день и не во время реплики чата
    if (!this.h.letterBusy && this.h.game.week >= this.h.letterNextAt && !this.h.chatThread?.busy) {
      const pending = this.h.game.mail.find((m) => !m.llm);
      if (pending) {
        this.h.letterBusy = true;
        this.h.letterNextAt = this.h.game.week + 1;
        void this.writeLetterText(pending);
      }
    }
    // (2) письмо готово (текст LLM или заготовка) — в чат, но не в середину живого диалога:
    // публикуем, когда чат свободен, и встаём в конец очереди — хронология недель не рвётся (10.09.2026)
    if (!this.h.chatThread && this.h.pendingPlayers.length === 0) {
      for (const l of this.h.game.mail) {
        if (l.id <= this.h.mailShownId || !l.llm) continue;
        this.h.mailShownId = l.id;
        const emoji = l.sentiment === 'love' ? '💌' : l.sentiment === 'hate' ? '💔' : '✉️';
        this.h.chat.queue.push({
          week: this.h.chatFloor(), author: `${l.fanName} (фанат)`, avatar: '', text: `${emoji} ${l.text}`, trigger: 'week',
        });
        this.h.emit();
        if (this.h.pendingPhases.length > 0) {
          this.h.fanReplyQueued = true; // впереди события — реакция после текущей серии
        } else {
          void this.h.generatePhase('fanmail', { text: l.text, fanName: l.fanName, gameName: l.gameName, sentiment: l.sentiment });
        }
        return; // одно письмо за тик
      }
    }
    // (3) отложенная реакция на последнее показанное письмо
    if (this.h.fanReplyQueued && !this.h.chatThread && this.h.pendingPhases.length === 0 && this.h.pendingPlayers.length === 0) {
      this.h.fanReplyQueued = false;
      const l = this.h.game.mail.find((x) => x.id === this.h.mailShownId);
      if (l) {
        void this.h.generatePhase('fanmail', { text: l.text, fanName: l.fanName, gameName: l.gameName, sentiment: l.sentiment });
      }
    }
  }

  private async writeLetterText(letter: FanLetter): Promise<void> {
    try {
      const messages = buildLetterPrompt(letter);
      const { text } = await this.h.llm(messages, 250);
      const t = text.trim().replace(/^["«]|["»]$/g, '').slice(0, 700);
      if (t.length >= 20) letter.text = t; // иначе оставляем заготовку движка
    } catch (e) {
      console.error('[gds] LLM-текст письма не получен — остаётся заготовка:', String(e).slice(0, 200));
    }
    letter.llm = true;
    this.h.letterBusy = false;
    this.h.autosave(true); // LLM-текст письма не должен теряться при дебаунсе
    this.h.emit();
  }
}
