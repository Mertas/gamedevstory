// Чат: типы и чистая логика (общие для сервера и клиента). Генерация — на сервере.
import type { GameState } from '../core/types';

export interface ChatMsg {
  week: number;
  author: string;
  avatar: string;
  text: string;
  system?: boolean;
  trigger: 'week' | 'progress';
  progress?: number; // для trigger='progress'
}

export interface ChatState {
  msgs: ChatMsg[];
  queue: ChatMsg[];
  phases: Record<string, boolean>;
}

export function resetChat(): ChatState {
  return { msgs: [], queue: [], phases: {} };
}

export function chatSystem(game: GameState, chat: ChatState, text: string): void {
  chat.msgs.push({ week: game.week, author: 'Система', avatar: '', text, system: true, trigger: 'week' });
  if (chat.msgs.length > 800) chat.msgs.splice(0, chat.msgs.length - 800);
}

export function avatarFor(game: GameState, staffName: string): string {
  return game.staff.find((s) => s.name === staffName)?.avatar ?? '';
}

// перенос сообщений, чей триггер наступил
export function deliverChat(game: GameState, chat: ChatState): void {
  const due: ChatMsg[] = [];
  const rest: ChatMsg[] = [];
  for (const m of chat.queue) {
    const ready = m.trigger === 'week'
      ? m.week <= game.week
      : !!game.activeGame && (m.progress ?? 0) <= game.activeGame.progress;
    if (ready) due.push(m);
    else rest.push(m);
  }
  chat.queue = rest;
  for (const m of due) chat.msgs.push({ ...m, week: game.week });
  if (chat.msgs.length > 800) chat.msgs.splice(0, chat.msgs.length - 800);
}

// «печатает…»: ближайшее сообщение очереди
export function typingName(game: GameState, chat: ChatState): string | null {
  for (const m of chat.queue) {
    if (m.system) continue; // системные записи не «печатают»
    if (m.trigger === 'week' && m.week - game.week <= 1) return m.author;
    if (m.trigger === 'progress' && game.activeGame && (m.progress ?? 1) - game.activeGame.progress <= 0.05) return m.author;
  }
  return null;
}
