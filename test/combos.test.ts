// PLAN-54: скрытые комбо команды — условия, эффекты, открытие, миграция.
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import {
  addComboBrand, applyCombos, matchingCombos, TEAM_COMBOS,
} from '../src/core/systems/combos';
import type { ActiveGame, Role, Staff } from '../src/core/types';

type StatKey = 'program' | 'scenario' | 'graphics' | 'sound';
type Career = Staff['activeCareer'];

function staff(
  id: string, career: Career, opts: { stats?: Partial<Record<StatKey, number>>; hireWeek?: number } = {},
): Staff {
  return {
    id, name: id, gender: 'M', salary: 10, hireFee: 0, maxPower: 10, power: 10,
    stats: { program: 0, scenario: 0, graphics: 0, sound: 0, ...opts.stats },
    careers: { coder: 1, writer: 0, designer: 0, sound: 0, director: 0, producer: 0, hw: 0, hacker: 0 },
    activeCareer: career, levelUps: 0, boosterUses: {}, avatar: '', homeWeeks: 0, lastRole: null,
    caps: { program: 200, scenario: 200, graphics: 200, sound: 200 },
    history: opts.hireWeek ? [{ week: opts.hireWeek, kind: 'hire', text: 'нанят' }] : [],
    trainCount: {}, restDays: 0, bossId: null,
  } as Staff;
}

function fakeGame(
  partial: { assignments?: Partial<Record<Role, string[]>>; contribTotal?: Record<string, number> } = {},
): ActiveGame {
  return {
    genreId: 'rpg',
    typeId: 'action',
    assignments: { proposal: [], program: [], graphics: [], sound: [], debug: [], ...partial.assignments },
    contribTotal: partial.contribTotal ?? {},
  } as unknown as ActiveGame;
}

describe('PLAN-54: условия комбо', () => {
  it('«Все программисты»: три кодера — комбо есть; микс — нет', () => {
    const g = newGame(1);
    g.staff = [staff('a', 'coder'), staff('b', 'coder'), staff('c', 'coder')];
    const game = fakeGame({ contribTotal: { a: 1, b: 1, c: 1 } });
    expect(matchingCombos(g, game).map((c) => c.id)).toContain('coders');

    g.staff[2] = staff('c', 'writer');
    expect(matchingCombos(g, game).map((c) => c.id)).not.toContain('coders');
  });

  it('«Полный состав»: все четыре роли проекта заняты', () => {
    const g = newGame(2);
    g.staff = [staff('a', 'coder'), staff('b', 'writer'), staff('c', 'designer')];
    const game = fakeGame({
      assignments: { proposal: ['b'], program: ['a'], graphics: ['c'], sound: ['a'] },
      contribTotal: { a: 1, b: 1, c: 1 },
    });
    expect(matchingCombos(g, game).map((c) => c.id)).toContain('full');
  });

  it('«Звёздный состав»: у каждого есть эффективный стат 100+', () => {
    const g = newGame(3);
    g.staff = [
      staff('a', 'coder', { stats: { program: 100 } }),
      staff('b', 'writer', { stats: { scenario: 120 } }),
      staff('c', 'designer', { stats: { graphics: 101 } }),
    ];
    const game = fakeGame({ contribTotal: { a: 1, b: 1, c: 1 } });
    expect(matchingCombos(g, game).map((c) => c.id)).toContain('stars');
    g.staff[2] = staff('c', 'designer', { stats: { graphics: 99 } });
    expect(matchingCombos(g, game).map((c) => c.id)).not.toContain('stars');
  });

  it('«Ветераны»: все наняты 10+ лет назад', () => {
    const g = newGame(4);
    g.week = 1 + 10 * 365;
    g.staff = [
      staff('a', 'coder', { hireWeek: 1 }),
      staff('b', 'writer', { hireWeek: 1 }),
      staff('c', 'designer', { hireWeek: 1 }),
    ];
    const game = fakeGame({ contribTotal: { a: 1, b: 1, c: 1 } });
    expect(matchingCombos(g, game).map((c) => c.id)).toContain('veterans');
    g.staff[2] = staff('c', 'designer', { hireWeek: 1 + 10 * 365 - 10 }); // 9 лет и 355 дней
    expect(matchingCombos(g, game).map((c) => c.id)).not.toContain('veterans');
  });
});

describe('PLAN-54: эффекты и открытие', () => {
  it('«Все программисты» дают деньги, комбо открывается один раз', () => {
    const g = newGame(5);
    g.week = 500;
    g.staff = [staff('a', 'coder'), staff('b', 'coder'), staff('c', 'coder')];
    const game = fakeGame({ contribTotal: { a: 1, b: 1, c: 1 } });

    const first = applyCombos(g, game);
    expect(first.money).toBe(180); // 60 × 3
    expect(first.opened.map((c) => c.id)).toContain('coders');
    expect(g.combos!.coders).toBe(500);

    const second = applyCombos(g, game);
    expect(second.money).toBe(180); // эффект срабатывает каждый релиз
    expect(second.opened).toHaveLength(0); // открытие — однократно
  });

  it('«Полный состав» даёт +3 к оценке', () => {
    const g = newGame(6);
    g.staff = [staff('a', 'coder'), staff('b', 'writer'), staff('c', 'designer')];
    const game = fakeGame({
      assignments: { proposal: ['b'], program: ['a'], graphics: ['c'], sound: ['a'] },
      contribTotal: { a: 1, b: 1, c: 1 },
    });
    const r = applyCombos(g, game);
    expect(r.score).toBeGreaterThanOrEqual(3);
    expect(g.combos!.full).toBe(g.week);
  });

  it('бренд комбо добавляется франшизе этого жанра|типа', () => {
    const g = newGame(7);
    g.staff = [staff('a', 'designer'), staff('b', 'designer'), staff('c', 'designer')];
    const game = fakeGame({ contribTotal: { a: 1, b: 1, c: 1 } });
    g.franchises = {
      'rpg|action': {
        name: 'Серия', genreId: 'rpg', typeId: 'action', brand: 50, bornWeek: 1,
        lastReleaseWeek: 1, releases: [], merch: null,
      } as never,
    };
    const r = applyCombos(g, game);
    expect(r.brand).toBeGreaterThanOrEqual(1);
    addComboBrand(g, game, r.brand);
    expect(g.franchises['rpg|action']!.brand).toBeCloseTo(50 + r.brand, 6);
  });

  it('все стартовые комбо имеют уникальные id и непустые условия', () => {
    const ids = TEAM_COMBOS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const c of TEAM_COMBOS) {
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.condition.length).toBeGreaterThan(5);
      expect(c.effect.length).toBeGreaterThan(3);
    }
  });
});

describe('PLAN-54: миграция', () => {
  it('v22 → v23: витрина комбо создаётся пустой', () => {
    const g = newGame(8);
    g.saveVersion = 22;
    g.combos = undefined;
    migrateSave(g);
    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.combos).toEqual({});
  });
});
