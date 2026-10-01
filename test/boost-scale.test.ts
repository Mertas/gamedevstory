// 28.09: буст масштабируется с силой сотрудника — удачный буст даёт ~10–15% суммы характеристик
// автора идеи (запрос босса; раньше был флэт 25..50 очков и не масштабировался вовсе).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import type { Rng } from '../src/core/rng';
import { resolveBoost } from '../src/core/systems/dev';
import type { ActiveGame, GameState } from '../src/core/types';

function stubRng(pick: (a: number, b: number) => number, success = true): Rng {
  return { int: pick, chance: () => success, state: 0 } as unknown as Rng;
}

function withBoost(): GameState {
  const g = newGame(1);
  const s = g.staff[0]!;
  s.stats.program = 300;
  s.stats.scenario = 100;
  s.stats.graphics = 50;
  s.stats.sound = 50; // сумма 500
  g.research = 200;
  const ag = {
    consoleId: 'nes', genreId: 'table', typeId: 'pirate', mode: 'normal',
    comboGrade: 'C', direction: {},
    points: { fun: 0, creativity: 0, graphics: 0, sound: 0 },
    totalCost: 300, progress: 0.3, bugs: 0, weekStarted: 1, phase: 'dev',
    proposalStaffId: s.id,
    assignments: { proposal: [s.id], program: [s.id], graphics: [], sound: [], debug: [] },
    contribTotal: {},
    boostOffered: true, boostUsed: false, fame: 10, hype: 10,
    name: '', score: null, judgeScores: [], reviewMessages: [], releaseWeek: null,
    sales: [], totalUnits: 0, totalRevenue: 0, ended: false,
  } as unknown as ActiveGame;
  g.activeGame = ag;
  g.pendingEvent = { type: 'boost', staffId: s.id, cost: 20 };
  return g;
}

const pointsSum = (g: GameState) => {
  const p = g.activeGame!.points;
  return p.fun + p.creativity + p.graphics + p.sound;
};

describe('буст от силы сотрудника (28.09, v1.37.0)', () => {
  it('сумма 500 → прирост в границах 10–15% (50 и 75 на краях)', () => {
    const lo = withBoost();
    const beforeLo = pointsSum(lo);
    resolveBoost(lo, stubRng((a) => a), true, 20);
    expect(pointsSum(lo) - beforeLo).toBe(50);

    const hi = withBoost();
    const beforeHi = pointsSum(hi);
    resolveBoost(hi, stubRng((_a, b) => b), true, 20);
    expect(pointsSum(hi) - beforeHi).toBe(75);
  });

  it('слабый сотрудник даёт меньше: сумма 100 → прирост 10..15', () => {
    const g = withBoost();
    g.staff[0]!.stats = { program: 40, scenario: 20, graphics: 20, sound: 20 };
    const before = pointsSum(g);
    resolveBoost(g, stubRng((a) => a), true, 20);
    const gain = pointsSum(g) - before;
    expect(gain).toBeGreaterThanOrEqual(10);
    expect(gain).toBeLessThanOrEqual(15);
  });

  it('прирост идёт в один стат (лучший у автора идеи) и в границах процента', () => {
    const g = withBoost();
    const before = pointsSum(g);
    resolveBoost(g, stubRng((a, b) => Math.round((a + b) / 2)), true, 20);
    const gain = pointsSum(g) - before;
    expect(gain).toBeGreaterThanOrEqual(Math.round(500 * CONFIG.BOOST_GAIN_PCT[0]));
    expect(gain).toBeLessThanOrEqual(Math.round(500 * CONFIG.BOOST_GAIN_PCT[1]));
    const p = g.activeGame!.points;
    expect([p.fun, p.creativity, p.graphics, p.sound].filter((v) => v > 0).length).toBe(1);
  });

  it('провал: очков не прибавилось, добавились баги', () => {
    const g = withBoost();
    const before = pointsSum(g);
    resolveBoost(g, stubRng((a) => a, false), true, 20);
    expect(pointsSum(g)).toBe(before);
    expect(g.activeGame!.bugs).toBeGreaterThan(0);
  });
});
