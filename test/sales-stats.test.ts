// PLAN-29: окно продаж — чистая логика (место/рекорд/что показывать) и фактический учёт в ядре.
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { dailySales } from '../src/core/systems/market';
import { fmtCopies, fmtUnits, isUnitsRecord, pickSalesView, pickSalesViews, smoothView, unitsRank } from '../src/shared/sales-stats';
import { pressVerdict } from '../src/shared/rules';
import type { ActiveGame, GameRecord } from '../src/core/types';

const rec = (name: string, units: number, releaseWeek = 1): GameRecord =>
  ({ name, releaseWeek, units, revenue: units * 10 } as unknown as GameRecord);

describe('PLAN-29 окно продаж: место и рекорд', () => {
  it('место по копям: считаем тех, кто строго впереди', () => {
    expect(unitsRank([500, 1500, 800], 1000)).toBe(2);
    expect(unitsRank([500, 800], 1000)).toBe(1);
    expect(unitsRank([], 5)).toBe(1);
  });

  it('рекорд — только если есть с чем сравнивать и мы впереди всех', () => {
    expect(isUnitsRecord([], 100)).toBe(false);
    expect(isUnitsRecord([500, 800], 1000)).toBe(true);
    expect(isUnitsRecord([500, 1200], 1000)).toBe(false);
  });

  it('PLAN-30: копии — точно до 100 тыс., дальше 100к/101к', () => {
    expect(fmtCopies(34.027)).toMatch(/^34[\s\u00A0\u202F]027$/); // до единиц, с разделителем
    expect(fmtCopies(0.405)).toBe('405');
    expect(fmtCopies(100)).toBe('100к'); // ровно 100 000
    expect(fmtCopies(100.4)).toBe('100к');
    expect(fmtCopies(101.9)).toBe('101к');
    expect(fmtCopies(950.2)).toBe('950к');
  });

  it('формат копий: K и M', () => {
    expect(fmtUnits(950)).toBe('950');
    expect(fmtUnits(1.4)).toBe('1.4'); // дробные копии мелких игр
    expect(fmtUnits(12_340)).toBe('12.34K');
    expect(fmtUnits(2_500_000)).toBe('2.50M');
  });
});

describe('PLAN-29 окно продаж: что показываем', () => {
  const active = {
    name: 'Пиксель', genreId: 'g', typeId: 't', consoleId: 'pc-game', score: 30,
    releaseWeek: 100, sales: [
      { week: 100, units: 100, unitsF: 100, revenue: 500 },
      { week: 101, units: 60, unitsF: 60, revenue: 300 },
      { week: 102, units: 20, unitsF: 20, revenue: 100 },
    ],
    totalUnits: 180, totalRevenue: 900, ended: false,
    paidUnits: 180, paidRevenue: 920,
  } as unknown as ActiveGame;

  it('живой релиз: день, суммы, место (свою запись в архиве не считаем дважды)', () => {
    const history = [rec('Старая', 500, 50), rec('Пиксель', 180, 100)]; // своя же запись из архива
    const v = pickSalesView([active], history, 101)!;
    expect(v.live).toBe(true);
    expect(v.key).toBe('Пиксель#100');
    expect(v.day).toBe(2);
    expect(v.sales.map((s) => s.week)).toEqual([100, 101]); // будущие дни не показываем
    expect(v.units).toBe(180); // факт (paidUnits), не сумма графика
    expect(v.revenue).toBe(920);
    expect(v.rank).toBe(2); // «Старая» (500) впереди: наша 180 — вторая
    expect(v.total).toBe(2);
  });

  it('старый сейв (целые копии дня): оценка по доле выручки от плана', () => {
    const legacy = {
      ...active,
      paidUnits: 21, // сломанный счётчик старых планов
      sales: [
        { week: 100, units: 40, revenue: 500 },
        { week: 101, units: 25, revenue: 300 },
      ],
    } as unknown as ActiveGame;
    const v = pickSalesView([legacy], [rec('Старая', 500, 50)], 101)!;
    // 180 копий плана × (800/900 выручки) ≈ 160, а не сломанные 21
    expect(v.units).toBeGreaterThan(150);
    expect(v.units).toBeLessThan(170);
  });

  it('продажи кончились: итог последней игры + рекорд', () => {
    const history = [rec('Старая', 500, 50), rec('Новая', 900, 200)];
    const v = pickSalesView([], history, 260)!;
    expect(v.live).toBe(false);
    expect(v.name).toBe('Новая');
    expect(v.units).toBe(900);
    expect(v.rank).toBe(1);
    expect(v.record).toBe(true);
  });

  it('пустой архив — окно не показываем', () => {
    expect(pickSalesView([], [], 1)).toBeNull();
  });
});

describe('PLAN-29 фактический учёт продаж в ядре', () => {
  it('dailySales копит факт и записывает его в архив при снятии с продаж', () => {
    const g = newGame(1, { studioName: 'Тест', staffIds: ['dee-coder', 's-presso'] });
    const game = {
      name: 'Тестовая', genreId: 'g', typeId: 't', consoleId: 'pc-game',
      releaseWeek: g.week, sales: [{ week: g.week, units: 100, revenue: 500 }],
      totalUnits: 100, totalRevenue: 500, ended: false,
    } as unknown as ActiveGame;
    g.released.push(game);
    g.history.push({ name: 'Тестовая', releaseWeek: g.week, units: 100, revenue: 500 } as unknown as GameRecord);

    dailySales(g);
    expect(game.paidUnits).toBe(100);
    expect(game.paidRevenue).toBe(500);
    expect(g.money).toBeGreaterThan(newGame(1, { studioName: 'x', staffIds: [] }).money); // деньги реально пришли

    g.week += 1; // кривая кончилась — снятие с продаж
    dailySales(g);
    expect(game.ended).toBe(true);
    expect(g.released).toHaveLength(0);
    const rec = g.history.at(-1)!;
    expect(rec.paidUnits).toBe(100);
    expect(rec.paidRevenue).toBe(500);
  });
});

describe('PLAN-31: до двух панелей + сглаживание игрового дня', () => {
  const mkLive = (name: string, releaseWeek: number, days: number) =>
    ({
      name, genreId: 'g', typeId: 't', consoleId: 'pc-game', score: 30, releaseWeek,
      sales: Array.from({ length: days }, (_, i) => ({ week: releaseWeek + i, units: 10, unitsF: 10, revenue: 50 })),
      totalUnits: days * 10, totalRevenue: days * 50, ended: false,
      paidUnits: days * 10, paidRevenue: days * 50,
    } as unknown as ActiveGame);

  it('свежий релиз сверху; больше двух панелей не выводим', () => {
    const a = mkLive('Старая', 90, 20);
    const b = mkLive('Новая', 200, 5);
    const views = pickSalesViews([a, b], [rec('Старая', 200, 90)], 200);
    expect(views.map((v) => v.name)).toEqual(['Новая', 'Старая']);
    expect(views).toHaveLength(2);
    expect(pickSalesViews([a, b, mkLive('Третья', 150, 3)], [], 200)).toHaveLength(2);
  });

  it('живой релиз над итогом прошлой игры', () => {
    const live = mkLive('Свежая', 300, 7);
    const views = pickSalesViews([live], [rec('Прошлая', 900, 250), rec('Древняя', 100, 10)], 300);
    expect(views.map((v) => [v.name, v.live])).toEqual([['Свежая', true], ['Прошлая', false]]);
  });

  it('сглаживание: половина дня — половина прироста последнего дня', () => {
    const v = pickSalesViews([mkLive('Живая', 100, 3)], [], 102)[0]!;
    expect(v.units).toBe(30);
    const half = smoothView(v, 0.5);
    expect(half.units).toBe(25); // 20 + 10×0.5
    expect(half.revenue).toBe(125); // 100 + 50×0.5
    expect(smoothView(v, 0).units).toBe(20);
    expect(smoothView(v, 1)).toBe(v);
  });
});

describe('PLAN-30: вердикт прессы', () => {
  it('пороги соответствуют залу славы (80) и Гран-при (90)', () => {
    expect(pressVerdict(95)).toContain('Гран-при');
    expect(pressVerdict(90)).toContain('Гран-при');
    expect(pressVerdict(85)).toContain('Зал славы');
    expect(pressVerdict(80)).toContain('Зал славы');
    expect(pressVerdict(65)).toContain('Крепкая');
    expect(pressVerdict(50)).toContain('Смешанные');
    expect(pressVerdict(30)).toContain('разгромила');
  });
});
