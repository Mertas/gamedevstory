// M8: архив — чистая логика: фильтры, сортировка и восстановленная кривая продаж.
// Кривая не хранится в записи игры: форма — веса дней релиза (те же, что в salesPlan),
// масштаб — копии записи. Так работает и для старых сейвов (кривая была бы утеряна).
import { dayWeights, pricePerCopy } from '../core/formulas';
import type { GameRecord } from '../core/types';
import type { SalesDay } from './sales-stats';

export type ArchiveSortKey = 'date' | 'title' | 'score' | 'units' | 'revenue';

export interface ArchiveSortState {
  key: ArchiveSortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_SORT: ArchiveSortState = { key: 'date', dir: 'desc' };

/** Клик по заголовку: та же колонка — переворачиваем порядок, новая — с дефолтного направления. */
export function nextSort(cur: ArchiveSortState, key: ArchiveSortKey): ArchiveSortState {
  if (cur.key === key) return { key, dir: cur.dir === 'desc' ? 'asc' : 'desc' };
  return { key, dir: key === 'title' ? 'asc' : 'desc' };
}

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

export function sortHistory(rows: GameRecord[], sort: ArchiveSortState): GameRecord[] {
  // для чисел удобно (b − a)·s; localeCompare уже «по возрастанию» — знак обратный
  const s = sort.dir === 'desc' ? 1 : -1;
  const sStr = -s;
  const copy = [...rows];
  switch (sort.key) {
    case 'title':
      copy.sort((a, b) => a.name.localeCompare(b.name, 'ru') * sStr);
      break;
    case 'score':
      copy.sort((a, b) => (b.score - a.score) * s || (b.releaseWeek - a.releaseWeek));
      break;
    case 'units':
      copy.sort((a, b) => ((b.paidUnits ?? b.units) - (a.paidUnits ?? a.units)) * s || (b.releaseWeek - a.releaseWeek));
      break;
    case 'revenue':
      copy.sort((a, b) => ((b.paidRevenue ?? b.revenue) - (a.paidRevenue ?? a.revenue)) * s || (b.releaseWeek - a.releaseWeek));
      break;
    default:
      copy.sort((a, b) => (b.releaseWeek - a.releaseWeek) * s);
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
