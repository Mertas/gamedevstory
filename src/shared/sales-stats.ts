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
  scaleWeek1: number; // PLAN-30: полная первая неделя по плану — верх шкалы столбиков
  planRevenue: number; // PLAN-30: доход по всему плану — верх шкалы линии дохода
}

/** Копии по записи: факт, если считается (PLAN-29), иначе план — сравнения на одной основе. */
export function recordUnits(h: GameRecord): number {
  return h.paidUnits ?? h.units;
}

/**
 * PLAN-30: копии в формате босса — до 100 тыс. точное число (до единиц), дальше «100к», «101к»…
 * units в ядре — в тысячах, поэтому умножаем на 1000.
 */
export function fmtCopies(unitsK: number): string {
  const copies = Math.round(unitsK * 1000);
  if (copies < 100_000) return copies.toLocaleString('ru-RU');
  return `${Math.floor(copies / 1000)}к`;
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
function liveView(live: ActiveGame, history: GameRecord[], week: number): SalesView {
  if (live.releaseWeek !== null) {
    const sums = sumsUpTo(live.sales, week);
    // копии: факт (paidUnits) → сумма по графику → доля плана (старые сейвы, где копии дня округлены)
    const share = live.totalRevenue > 0 ? Math.min(1, sums.revenue / live.totalRevenue) : 0;
    // Дробные копии дня есть только у планов после PLAN-29. У старых копии дня целые (0.66 → 1, 0.19 → 0),
    // поэтому там честнее оценка по доле выручки от плана, а не счётчик.
    const raw =
      live.sales[0]?.unitsF !== undefined && live.paidUnits && live.paidUnits > 0
        ? live.paidUnits
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
      scaleWeek1: live.sales.slice(0, 7).reduce((a, x) => a + (x.unitsF ?? x.units), 0),
      planRevenue: live.totalRevenue,
    };
  }
  throw new Error('liveView: релиз без недели');
}

function finalView(last: GameRecord, history: GameRecord[]): SalesView {
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
    scaleWeek1: 0,
    planRevenue: 0,
  };
}

/** Сглаживание «внутри дня» (PLAN-31): доля последнего дня ramping от 0 к 1 — 5 шагов за игровой день. */
export function smoothView(v: SalesView, progress: number): SalesView {
  if (!v.live || v.sales.length === 0 || progress >= 1) return v;
  const last = v.sales[v.sales.length - 1]!;
  const lu = last.unitsF ?? last.units;
  const p = Math.max(0, Math.min(1, progress));
  return {
    ...v,
    units: v.units - lu + lu * p,
    revenue: v.revenue - last.revenue + last.revenue * p,
    sales: [...v.sales.slice(0, -1), { ...last, unitsF: lu * p, revenue: last.revenue * p }],
  };
}

/**
 * Панели окна продаж: свежие релизы сверху (по неделе релиза), добираем итогами архива.
 * PLAN-31: показываем не больше `limit` панелей (по умолчанию 2) — новая над предыдущей.
 */
export function pickSalesViews(released: ActiveGame[], history: GameRecord[], week: number, limit = 2): SalesView[] {
  const out: SalesView[] = released
    .filter((g) => g.releaseWeek !== null)
    .sort((a, b) => (b.releaseWeek ?? 0) - (a.releaseWeek ?? 0))
    .slice(0, limit)
    .map((g) => liveView(g, history, week));
  if (out.length < limit) {
    const shown = new Set(out.map((v) => v.key));
    const recs = [...history].sort((a, b) => b.releaseWeek - a.releaseWeek);
    for (const r of recs) {
      if (out.length >= limit) break;
      if (shown.has(`${r.name}#${r.releaseWeek}`)) continue;
      out.push(finalView(r, history));
    }
  }
  return out;
}

/** Совместимость: первая панель (живой релиз — приоритет, иначе итог последней игры). */
export function pickSalesView(released: ActiveGame[], history: GameRecord[], week: number): SalesView | null {
  return pickSalesViews(released, history, week)[0] ?? null;
}
