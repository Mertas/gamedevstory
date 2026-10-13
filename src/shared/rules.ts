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

/** P1-9 аудита-51: слова-признаки тренировки в записях unlockedTrainings.
 *  Новый формат — канонический id ('stroll'); старые сейвы хранят имя из БД («散歩 walk»),
 *  поэтому матчим и по английским словам имени. Значения — из таблицы trainings (name_en-часть name). */
const TRAINING_MATCH: Record<string, string[]> = {
  stroll: ['stroll', 'walk'],
  reading: ['reading'],
  movie: ['movie', 'movies'],
  anime: ['anime'],
  game: ['game', 'games'],
  jogging: ['jogging'],
  pinball: ['pinball', 'pachinko'],
  meditate: ['meditate', 'meditation'],
  concert: ['concert', 'live music'],
  netsurf: ['netsurf', 'surfing'],
  museum: ['museum'],
  college: ['college', 'university'],
  lab: ['lab'],
  shorttrip: ['shorttrip', 'domestic trip'],
  longtrip: ['longtrip', 'overseas trip'],
};

/** Пройден ли тренинг: канонический id или запись-имя из старого сейва («散歩 walk»). */
export function hasTraining(unlocked: string[] | undefined | null, training: string | null | undefined): boolean {
  if (!training) return true;
  const words = TRAINING_MATCH[training] ?? [training.toLowerCase()];
  return (unlocked ?? []).some((x) => {
    const lx = String(x).toLowerCase();
    if (lx === training.toLowerCase()) return true;
    return words.some((w) => lx.includes(w));
  });
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
  if (training && !hasTraining(game.unlockedTrainings, training)) return false;
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
 * Оценка игры в 100-балльной шкале (PLAN-30: 10 критиков, каждый 3–10 → 3..100). Исторически
 * шкала была /40 (4 критика по 10); старые сейвы приводит миграция v6. Порог зала славы —
 * CONFIG.HALL_OF_FAME = 80/100. Аудит-51 01-P3-5: комментарий приведён к действующей шкале.
 */
export function score100(score: number): number {
  // PLAN-30: шкала уже /100 (10 критиков по 3–10); старые сейвы приводит миграция v6
  return Math.round(score);
}

/**
 * M7: правила пулов переехали в `shared/hire.ts` — метод найма = свой слой кандидатов
 * (staffMatchesPool больше не нужен: слой задаётся списком id, а не строкой unlock).
 */

/** PLAN-30: вердикт прессы по итоговой оценке (шкала /100, десять критиков). */
export function pressVerdict(score: number): string {
  if (score >= 90) return 'Уровень Гран-при! Такую игру запомнят надолго.';
  if (score >= 80) return 'Зал славы! Пресса в восторге.';
  if (score >= 60) return 'Крепкая игра: критики довольны, но без фанфар.';
  if (score >= 45) return 'Смешанные отзывы — есть над чем поработать.';
  return 'Пресса разгромила игру. Бывает и так.';
}
