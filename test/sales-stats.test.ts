// PLAN-29: окно продаж — чистая логика (место/рекорд/что показывать) и фактический учёт в ядре.
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { dailySales } from '../src/core/systems/market';
import { fmtUnits, isUnitsRecord, pickSalesView, unitsRank } from '../src/shared/sales-stats';
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
      { week: 100, units: 100, revenue: 500 },
      { week: 101, units: 60, revenue: 300 },
      { week: 102, units: 20, revenue: 100 },
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
