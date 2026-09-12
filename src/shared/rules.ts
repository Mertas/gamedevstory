// Общие правила сервера и клиента — единый источник (CORE-04).
// Серверный core импортирует отсюда; клиент не импортирует core-systems и берёт те же правила.
import type { CareerId } from '../core/data/schema';
import type { GameState } from '../core/types';

/** Комбо «жанр × тип»: таблица строк по typeId + порядок жанров (данные передаёт вызывающий). */
export function comboGradeFrom(table: Record<string, string>, genreOrder: string[], genreId: string, typeId: string): string {
  const row = table[typeId];
  if (!row) return 'C';
  const idx = genreOrder.indexOf(genreId);
  return idx >= 0 ? (row[idx] ?? 'C') : 'C';
}

/** Открыт ли жанр/тип: уровни сотрудников + пройденный тренинг. */
export function isUnlocked(
  game: GameState,
  job: string | null,
  level: number | null,
  training?: string | null,
  comboKey?: string,
): boolean {
  // PLAN-22: комбо, открытые игроком в аккаунте, доступны в любой партии — независимо от сейва
  if (comboKey && game.openedCombos?.includes(comboKey)) return true;
  if (job && level && !game.staff.some((s) => (s.careers[job as CareerId] ?? 0) >= level)) return false;
  if (training && !game.unlockedTrainings.some((x) => x.toLowerCase().includes(training.toLowerCase()))) return false;
  return true;
}

/** Консоль в продаже: уже вышла (null = ещё не вышла) и не снята. Без проверки лицензии. */
export function consoleReleased(game: GameState, consoleId: string): boolean {
  const cs = game.consoles[consoleId];
  if (!cs) return false;
  if (cs.availableAtWeek === null || cs.availableAtWeek > game.week) return false;
  if (cs.removedAtWeek !== null && cs.removedAtWeek <= game.week) return false;
  return true;
}

/** Можно ли разрабатывать под консоль: в продаже + лицензия куплена. */
export function consoleAvailable(game: GameState, consoleId: string): boolean {
  return !!game.consoles[consoleId]?.licensed && consoleReleased(game, consoleId);
}

/**
 * Оценка игры в 100-балльной шкале (4 критика по 10 = 40). Внутри движка счёт остаётся /40
 * (порог зала славы CONFIG.HALL_OF_FAME = 32, те же игры), но игроку показываем /100 — так
 * просил пользователь: «зал славы считался не от 40/40, а 100/100», порог = 80/100.
 */
export function score100(score: number): number {
  return Math.round((score / 40) * 100);
}

/**
 * PLAN-25: подходит ли сотрудник под пул метода найма. Правило ОДНО для движка и интерфейса —
 * раньше оно было скопировано в двух местах, и копии разошлись: движок добавлял «сразу доступных»
 * в методы с пулом «Word of Mouth», а интерфейс нет (автопилот пытался нанять того, кого в списке нет).
 */
export function staffMatchesPool(staffUnlock: string, pool: string[]): boolean {
  return pool.some((p) => staffUnlock.includes(p) || (p === 'Word of Mouth' && staffUnlock === 'Initially available'));
}
