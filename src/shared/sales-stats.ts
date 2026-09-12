// PLAN-29: производные данные окна «Продажи» — чистая логика, без UI (тестируется отдельно).
import type { ActiveGame, GameRecord } from '../core/types';

export interface SalesDay {
  week: number;
  units: number;
  revenue: number;
  unitsF?: number; // PLAN-29: дробные копии дня (у мелких игр продажи < 1/день)
}

export interface SalesView {
  key: string; // name#releaseWeek — по нему запоминается «закрыто»
  name: string;
  live: boolean; // ещё продаётся
  day: number; // сколько дней продаж прошло (1-based)
  days: number; // всего дней в кривой (CONFIG.SALES_DAYS = 168)
  sales: SalesDay[]; // только прошедшие дни — по ним график
  units: number; // копии: факт (paidUnits), для старых сейвов — сумма по графику
  revenue: number; // деньги (K)
  rank: number; // место по копям среди игр студии (1 — лучшая)
  total: number; // сколько всего игр у студии
  record: boolean; // рекорд студии по копям
}

/** Копии по записи: факт, если считается (PLAN-29), иначе план — сравнения на одной основе. */
export function recordUnits(h: GameRecord): number {
  return h.paidUnits ?? h.units;
}

export function fmtUnits(u: number): string {
  if (u >= 1_000_000) return `${(u / 1_000_000).toFixed(2)}M`;
  if (u >= 1000) return `${(u / 1000).toFixed(2)}K`;
  if (u < 10 && !Number.isInteger(u)) return u.toFixed(1); // дробные копии мелких игр
  return `${Math.round(u)}`;
}

export function sumsUpTo(sales: SalesDay[], day: number): { units: number; revenue: number } {
  let units = 0;
  let revenue = 0;
  for (const s of sales) {
    if (s.week <= day) {
      units += s.unitsF ?? s.units;
      revenue += s.revenue;
    }
  }
  return { units, revenue };
}

/** Место по копям (1 — лучшее): сколько записей строго больше + 1. */
export function unitsRank(others: number[], units: number): number {
  return 1 + others.filter((u) => u > units).length;
}

/** Рекорд: строго больше всех прежних (пустая история — не рекорд: сравнивать не с чем). */
export function isUnitsRecord(others: number[], units: number): boolean {
  return others.length > 0 && others.every((u) => u < units);
}

function othersOf(history: GameRecord[], name: string, releaseWeek: number): number[] {
  return history
    .filter((h) => !(h.name === name && h.releaseWeek === releaseWeek))
    .map(recordUnits);
}

/** Что показывать в окошке: живой релиз — приоритет, иначе итог последней игры студии. */
export function pickSalesView(released: ActiveGame[], history: GameRecord[], week: number): SalesView | null {
  const live = released
    .filter((g) => g.releaseWeek !== null)
    .sort((a, b) => (b.releaseWeek ?? 0) - (a.releaseWeek ?? 0))[0];
  if (live && live.releaseWeek !== null) {
    const sums = sumsUpTo(live.sales, week);
    // копии: факт (paidUnits) → сумма по графику → доля плана (старые сейвы, где копии дня округлены)
    const share = live.totalRevenue > 0 ? Math.min(1, sums.revenue / live.totalRevenue) : 0;
    const raw =
      live.paidUnits && live.paidUnits > 0
        ? live.paidUnits
        : sums.units > 0
          ? sums.units
          : live.totalUnits * share;
    const units = Math.round(raw * 10) / 10; // дробные копии (мелкие игры продают < 1/день)
    const revenue = Math.round(live.paidRevenue ?? sums.revenue);
    const others = othersOf(history, live.name, live.releaseWeek);
    return {
      key: `${live.name}#${live.releaseWeek}`,
      name: live.name,
      live: true,
      day: Math.max(1, Math.min(week - live.releaseWeek + 1, live.sales.length)),
      days: live.sales.length,
      sales: live.sales.filter((s) => s.week <= week),
      units,
      revenue,
      rank: unitsRank(others, units),
      total: others.length + 1,
      record: isUnitsRecord(others, units),
    };
  }
  const last = [...history].sort((a, b) => b.releaseWeek - a.releaseWeek)[0];
  if (!last) return null;
  const units = recordUnits(last);
  const revenue = Math.round(last.paidRevenue ?? last.revenue);
  const others = othersOf(history, last.name, last.releaseWeek);
  return {
    key: `${last.name}#${last.releaseWeek}`,
    name: last.name,
    live: false,
    day: 1,
    days: 0,
    sales: [],
    units,
    revenue,
    rank: unitsRank(others, units),
    total: others.length + 1,
    record: isUnitsRecord(others, units),
  };
}
