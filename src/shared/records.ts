// PLAN-30 (v1.8.0): книга рекордов студии — по направлениям, сумме, багам и вкладам.
// Живёт в shared: считает и итоговое окно прессы, и (потенциально) другие экраны.
import type { GameRecord } from '../core/types';

export interface RecordEntry {
  value: number;
  game: string;
}

export interface StudioRecords {
  dirs: { fun: RecordEntry | null; creativity: RecordEntry | null; graphics: RecordEntry | null; sound: RecordEntry | null };
  sum: RecordEntry | null;
  bugs: RecordEntry | null; // меньше — лучше (чистая разработка)
  contrib: { value: number; who: string; game: string } | null;
}

export const recordKey = (h: GameRecord): string => `${h.name}#${h.releaseWeek}`;

/**
 * Лучшие значения по архиву. skipKey — ключ записи, которую сравниваем с остальными
 * (её саму из подсчёта исключаем, чтобы «рекорд» не сравнивался сам с собой).
 */
export function studioRecords(history: GameRecord[], skipKey?: string): StudioRecords {
  const dirs: StudioRecords['dirs'] = { fun: null, creativity: null, graphics: null, sound: null };
  let sum: RecordEntry | null = null;
  let bugs: RecordEntry | null = null;
  let contrib: StudioRecords['contrib'] = null;
  for (const g of history) {
    if (skipKey != null && recordKey(g) === skipKey) continue;
    const a = g.attrs ?? ({} as GameRecord['attrs']);
    const pairs: Array<['fun' | 'creativity' | 'graphics' | 'sound', number]> = [
      ['fun', a.fun ?? 0],
      ['creativity', a.creativity ?? 0],
      ['graphics', a.graphics ?? 0],
      ['sound', a.sound ?? 0],
    ];
    for (const [k, v] of pairs) {
      if (dirs[k] === null || v > dirs[k]!.value) dirs[k] = { value: v, game: g.name };
    }
    const total = pairs.reduce((acc, [, v]) => acc + v, 0);
    if (sum === null || total > sum.value) sum = { value: total, game: g.name };
    if (typeof g.bugsTotal === 'number' && (bugs === null || g.bugsTotal < bugs.value)) {
      bugs = { value: g.bugsTotal, game: g.name };
    }
    if (g.contrib) {
      for (const [who, pts] of Object.entries(g.contrib)) {
        const v = Math.round(pts);
        if (contrib === null || v > contrib.value) contrib = { value: v, who, game: g.name };
      }
    }
  }
  return { dirs, sum, bugs, contrib };
}

/** Итог строки рекорда: побит ли рекорд студии (сравнение с лучшим у ДРУГИХ игр). */
export function beatsRecord(value: number, best: RecordEntry | null, better: 'high' | 'low' = 'high'): boolean {
  if (best === null) return true; // первый результат в студии — уже рекорд
  return better === 'high' ? value > best.value : value < best.value;
}
