// PLAN-53: иерархия сотрудников — дерево, эффективные статы, кап в игре, места, офис.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { STAFF } from '../src/core/data/db';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import type { Rng } from '../src/core/rng';
import { hireFromSearch } from '../src/core/systems/staff';
import {
  assignBoss, buySeat, cappedStats, detachChildren, effectiveStats, nextSeatPrice, syncOfficeLevel,
} from '../src/core/systems/hierarchy';
import type { Staff } from '../src/core/types';

type StatKey = 'program' | 'scenario' | 'graphics' | 'sound';

function staff(id: string, stats: Partial<Record<StatKey, number>>, bossId: string | null = null, hero = false): Staff {
  return {
    id, name: id, gender: 'M', salary: 10, hireFee: 0, maxPower: 10, power: 10,
    stats: { program: 0, scenario: 0, graphics: 0, sound: 0, ...stats },
    careers: { coder: 1, writer: 0, designer: 0, sound: 0, director: 0, producer: 0, hw: 0, hacker: 0 },
    activeCareer: 'coder', levelUps: 0, boosterUses: {}, avatar: '', homeWeeks: 0, lastRole: null,
    caps: { program: 100, scenario: 100, graphics: 100, sound: 100 },
    history: [], trainCount: {}, restDays: 0, bossId, hero,
  } as Staff;
}

function stubRng(): Rng {
  return {
    next: () => 0.5,
    int: (a: number) => a,
    chance: () => true,
    state: 0,
  } as unknown as Rng;
}

/** владелец + дерево a(160) → b(0) → c(0) */
function team() {
  const g = newGame(7);
  g.money = 100_000;
  g.staff = [
    staff('owner', {}, null, true),
    staff('a', { program: 160 }),
    staff('b', { program: 0 }),
    staff('c', { program: 0 }),
  ];
  g.staff[2]!.bossId = 'a';
  g.staff[3]!.bossId = 'b';
  return g;
}

describe('PLAN-53: эффективные статы дерева', () => {
  it('прямой подчинённый получает ×0.25 излишка, второй уровень — ещё ×0.5', () => {
    const g = team();
    const eff = effectiveStats(g);
    expect(eff.get('a')!.program).toBe(160); // сам без бонусов
    expect(eff.get('b')!.program).toBeCloseTo(15, 6); // 60 × 0.25
    expect(eff.get('c')!.program).toBeCloseTo(7.5, 6); // 60 × 0.25 × 0.5
  });

  it('башни растут: получивший сверх 100 раздаёт свой излишек дальше', () => {
    const g = newGame(8);
    g.staff = [
      staff('owner', {}, null, true),
      staff('a', { program: 300 }),
      staff('b', { program: 60 }),
      staff('c', {}),
    ];
    g.staff[2]!.bossId = 'a';
    g.staff[3]!.bossId = 'b';
    const eff = effectiveStats(g);
    expect(eff.get('b')!.program).toBeCloseTo(110, 6); // 60 + 200×0.25
    // c: (200×0.25×0.5) от A + (10×0.25) от B — оба предка раздают
    expect(eff.get('c')!.program).toBeCloseTo(27.5, 6);
  });

  it('базовые статы не мутируют — эффективные считаются на лету', () => {
    const g = team();
    const eff = effectiveStats(g);
    expect(eff.get('b')!.program).toBeGreaterThan(0);
    expect(g.staff[2]!.stats.program).toBe(0);
  });

  it('в статы игры идут первые 100 каждого стата', () => {
    const capped = cappedStats({ program: 160, scenario: 40, graphics: 250, sound: 100 });
    expect(capped).toEqual({ program: 100, scenario: 40, graphics: 100, sound: 100 });
  });
});

describe('PLAN-53: дерево — запреты и увольнение', () => {
  it('нельзя подчинить ГГ', () => {
    const g = team();
    expect(assignBoss(g, 'owner', 'a').ok).toBe(false);
  });

  it('нельзя сделать кольцо подчинения', () => {
    const g = team(); // a → b → c
    expect(assignBoss(g, 'a', 'c').ok).toBe(false);
    expect(assignBoss(g, 'c', 'a').ok).toBe(true); // c можно к a
  });

  it('нельзя подчинить самому себе', () => {
    const g = team();
    expect(assignBoss(g, 'b', 'b').ok).toBe(false);
  });

  it('уволенный руководитель: его дети переходят к его руководителю', () => {
    const g = team(); // a ← b ← c
    detachChildren(g, 'b');
    expect(g.staff.find((s) => s.id === 'c')!.bossId).toBe('a');
  });
});

describe('PLAN-53: места и офис', () => {
  it('цена места растёт: 5-е 250K, 6-е 325K, 7-е 423K', () => {
    const g = newGame(3);
    g.money = 100_000;
    expect(g.seats).toBe(CONFIG.STAFF_SEATS_BASE);
    expect(nextSeatPrice(g)).toBe(250);
    const r1 = buySeat(g);
    expect(r1.ok).toBe(true);
    expect(g.seats).toBe(5);
    expect(nextSeatPrice(g)).toBe(325);
    buySeat(g);
    expect(nextSeatPrice(g)).toBe(423);
  });

  it('найм невозможен без свободного места, после покупки — возможен', () => {
    const g = newGame(5);
    g.money = 100_000;
    g.staff = [staff('owner', {}, null, true)];
    g.seats = 1;
    const cand = STAFF.find((d) => !g.hiredIds.includes(d.id))!; // партнёр из старта уже занят
    g.activeSearch = { method: 'word-of-mouth', ids: [cand.id], week: 1 };
    expect(hireFromSearch(g, cand.id, stubRng()).ok).toBe(false);
    buySeat(g);
    expect(hireFromSearch(g, cand.id, stubRng()).ok).toBe(true);
  });

  it('условия офиса: 5-й сотрудник → 2, 8-й → 3 (и не падают)', () => {
    const g = newGame(4);
    g.staff = [staff('owner', {}, null, true)];
    expect(g.officeLevel).toBe(1);
    for (let i = 0; i < 4; i += 1) g.staff.push(staff(`s${i}`, {}));
    syncOfficeLevel(g);
    expect(g.officeLevel).toBe(2); // 5 человек
    for (let i = 0; i < 3; i += 1) g.staff.push(staff(`x${i}`, {}));
    syncOfficeLevel(g);
    expect(g.officeLevel).toBe(3); // 8 человек
    g.staff.pop();
    syncOfficeLevel(g);
    expect(g.officeLevel).toBe(3); // вниз не откатывается
  });

  it('миграция v21 → v22: места по команде, все у владельца, офис по числу', () => {
    const g = newGame(1);
    g.saveVersion = 21;
    g.officeLevel = 1;
    g.staff = [staff('owner', {}, null, true)];
    for (let i = 0; i < 5; i += 1) g.staff.push(staff(`m${i}`, {}));
    migrateSave(g);
    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.seats).toBe(6);
    expect(g.staff.every((s) => s.bossId === null)).toBe(true);
    expect(g.officeLevel).toBe(2);
  });
});
