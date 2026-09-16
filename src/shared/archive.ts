// M8: архив — чистая логика: фильтры, сортировка и восстановленная кривая продаж.
// Кривая не хранится в записи игры: форма — веса дней релиза (те же, что в salesPlan),
// масштаб — копии записи. Так работает и для старых сейвов (кривая была бы утеряна).
import { dayWeights, pricePerCopy } from '../core/formulas';
import type { GameRecord } from '../core/types';
import type { SalesDay } from './sales-stats';

export type ArchiveSort = 'date-desc' | 'date-asc' | 'score' | 'units' | 'revenue' | 'title';

export interface ArchiveFilter {
  q: string; // поиск по названию
  genreId: string; // '' = все
  typeId: string;
  consoleId: string;
  awardsOnly: boolean; // только игры с наградами церемоний
}

export const EMPTY_FILTER: ArchiveFilter = { q: '', genreId: '', typeId: '', consoleId: '', awardsOnly: false };

/** Сколько игр показываем за раз (кнопка «Показать ещё»). */
export const ARCHIVE_PAGE = 50;

export function filterHistory(history: GameRecord[], f: ArchiveFilter): GameRecord[] {
  const q = f.q.trim().toLowerCase();
  return history.filter((h) => {
    if (q && !h.name.toLowerCase().includes(q)) return false;
    if (f.genreId && h.genreId !== f.genreId) return false;
    if (f.typeId && h.typeId !== f.typeId) return false;
    if (f.consoleId && h.consoleId !== f.consoleId) return false;
    if (f.awardsOnly && !(h.awards?.length > 0)) return false;
    return true;
  });
}

export function sortHistory(rows: GameRecord[], sort: ArchiveSort): GameRecord[] {
  const copy = [...rows];
  switch (sort) {
    case 'date-asc':
      copy.sort((a, b) => a.releaseWeek - b.releaseWeek);
      break;
    case 'score':
      copy.sort((a, b) => b.score - a.score || b.releaseWeek - a.releaseWeek);
      break;
    case 'units':
      copy.sort((a, b) => (b.paidUnits ?? b.units) - (a.paidUnits ?? a.units) || b.releaseWeek - a.releaseWeek);
      break;
    case 'revenue':
      copy.sort((a, b) => (b.paidRevenue ?? b.revenue) - (a.paidRevenue ?? a.revenue) || b.releaseWeek - a.releaseWeek);
      break;
    case 'title':
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      break;
    default:
      copy.sort((a, b) => b.releaseWeek - a.releaseWeek);
  }
  return copy;
}

/** Кривая продаж игры из архива: 168 дней, форма — веса дня релиза, шкала — копии записи. */
export function rebuildSalesCurve(h: GameRecord, consoleMult: number): SalesDay[] {
  const weights = dayWeights(h.releaseWeek);
  const price = pricePerCopy(consoleMult);
  return weights.map((v, i) => {
    const units = h.units * v;
    return {
      week: h.releaseWeek + i,
      units: Math.round(units),
      revenue: Math.round(units * price),
      unitsF: Math.round(units * 100) / 100,
    };
  });
}
