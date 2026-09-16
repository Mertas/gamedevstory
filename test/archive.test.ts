// M8: архив — фильтры/сортировка/восстановленная кривая продаж (shared/archive.ts).
import { describe, expect, it } from 'vitest';
import { ARCHIVE_PAGE, EMPTY_FILTER, filterHistory, rebuildSalesCurve, sortHistory } from '../src/shared/archive';
import type { GameRecord } from '../src/core/types';
import { CONFIG } from '../src/core/config';

function rec(over: Partial<GameRecord>): GameRecord {
  return {
    name: 'Игра', genreId: 'rpg', typeId: 'fantasy', consoleId: 'pc-game', score: 80,
    units: 1000, revenue: 20000, releaseWeek: 100, year: 1, attrs: { fun: 1, creativity: 1, graphics: 1, sound: 1 },
    bugs: 1, bugsTotal: 2, awards: [], ...over,
  };
}

describe('M8: архив — фильтры и сортировка', () => {
  const rows = [
    rec({ name: 'Альфа', releaseWeek: 300, score: 70, units: 500, awards: ['Гран-при 3'] }),
    rec({ name: 'Бета', releaseWeek: 100, score: 95, units: 3000 }),
    rec({ name: 'Гамма', releaseWeek: 200, score: 85, units: 1000, genreId: 'action', consoleId: 'ies' }),
  ];

  it('поиск по названию (регистр не важен)', () => {
    expect(filterHistory(rows, { ...EMPTY_FILTER, q: 'аль' }).map((h) => h.name)).toEqual(['Альфа']);
  });

  it('фильтры по жанру/платформе/наградам', () => {
    expect(filterHistory(rows, { ...EMPTY_FILTER, genreId: 'action' }).map((h) => h.name)).toEqual(['Гамма']);
    expect(filterHistory(rows, { ...EMPTY_FILTER, consoleId: 'ies' }).map((h) => h.name)).toEqual(['Гамма']);
    expect(filterHistory(rows, { ...EMPTY_FILTER, awardsOnly: true }).map((h) => h.name)).toEqual(['Альфа']);
  });

  it('сортировки: дата/оценка/копии/название', () => {
    expect(sortHistory(rows, 'date-desc').map((h) => h.name)).toEqual(['Альфа', 'Гамма', 'Бета']);
    expect(sortHistory(rows, 'date-asc').map((h) => h.name)).toEqual(['Бета', 'Гамма', 'Альфа']);
    expect(sortHistory(rows, 'score')[0]!.name).toBe('Бета');
    expect(sortHistory(rows, 'units')[0]!.name).toBe('Бета');
    expect(sortHistory(rows, 'title')[0]!.name).toBe('Альфа');
  });
});

describe('M8: восстановленная кривая продаж', () => {
  it('168 дней, пик в начале (хвост кривой догоняет до нуля, как в живых продажах)', () => {
    const curve = rebuildSalesCurve(rec({ units: 1000, releaseWeek: 50 }), 1);
    expect(curve.length).toBe(CONFIG.SALES_DAYS);
    expect(curve.every((d) => d.unitsF !== undefined && d.unitsF >= 0)).toBe(true);
    expect(curve.slice(0, 7).every((d) => (d.unitsF ?? 0) > 0)).toBe(true); // первая неделя продаётся
    const firstWeek = curve.slice(0, 7).reduce((a, d) => a + (d.unitsF ?? 0), 0);
    const lastWeek = curve.slice(-7).reduce((a, d) => a + (d.unitsF ?? 0), 0);
    expect(firstWeek).toBeGreaterThan(lastWeek);
    expect(clickSum(curve)).toBeGreaterThan(0);
  });

  it('масштаб следует за копиями записи (вдвое больше копий — вдвое больше сумма)', () => {
    const a = rebuildSalesCurve(rec({ units: 1000, releaseWeek: 50 }), 1);
    const b = rebuildSalesCurve(rec({ units: 2000, releaseWeek: 50 }), 1);
    expect(clickSum(b) / clickSum(a)).toBeCloseTo(2, 1);
  });

  it('цена копии учитывает множитель консоли', () => {
    const cheap = rebuildSalesCurve(rec({ units: 1000, releaseWeek: 50 }), 2);
    const dear = rebuildSalesCurve(rec({ units: 1000, releaseWeek: 50 }), 6);
    const rev = (c: ReturnType<typeof rebuildSalesCurve>) => c.reduce((a, d) => a + d.revenue, 0);
    expect(rev(dear)).toBeGreaterThan(rev(cheap));
  });

  it('страница архива — 50', () => {
    expect(ARCHIVE_PAGE).toBe(50);
  });
});

function clickSum(curve: ReturnType<typeof rebuildSalesCurve>): number {
  return curve.reduce((a, d) => a + (d.unitsF ?? 0), 0);
}
