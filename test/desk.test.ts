// PLAN-40/25.09: иконки рабочего стола — новые встают на ПЕРВУЮ СВОБОДНУЮ плитку
// (а не на «ячейку по индексу», которая может быть занята перетащенной иконкой).
import { describe, expect, it } from 'vitest';

import { firstFreeTiles, tileKey, tilePos } from '../src/ui/deskPlace';

describe('иконки стола: первая свободная плитка', () => {
  it('пропускает занятые сверху вниз и берёт следующую', () => {
    const rows = 5;
    const occupied = [tilePos(0, rows), tilePos(1, rows)];
    expect(firstFreeTiles(occupied, 1, rows)).toEqual([tilePos(2, rows)]);
  });

  it('несколько новых иконок получают разные плитки (не накладываются)', () => {
    const rows = 5;
    const free = firstFreeTiles([tilePos(0, rows)], 2, rows);
    expect(free).toEqual([tilePos(1, rows), tilePos(2, rows)]);
  });

  it('перетащенная иконка на «чужой» ячейке индекса не мешает: берём свободную', () => {
    const rows = 2; // сетка 2×n: индексы 0,1 — первый столбец; 2,3 — второй
    // игрок утащил иконку на ячейку 1; новая иконка должна встать на освободившуюся 0
    expect(firstFreeTiles([tilePos(1, rows)], 1, rows)).toEqual([tilePos(0, rows)]);
  });

  it('tileKey округляет позицию к ближайшей ячейке (как снап)', () => {
    expect(tileKey(4 + 2 * 84 + 7, 4 + 3 * 80 - 6)).toBe('2:3');
  });
});
