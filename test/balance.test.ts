// Баланс-прогон: 24 месяца (728 дней) по скриптованной политике.
// Ожидания из 08_Экономика_и_баланс.md: «разумный» игрок растёт, не банкротится.
// Тик = 1 игровой день (1 апреля 1985 → день 1); год = 365 дней.
import { describe, expect, it } from 'vitest';
import { advanceWeeks, newGame, tick } from '../src/core/engine';
import { createPlayer, type PolicyStats } from '../src/core/sim/policy';
import { CONFIG } from '../src/core/config';

export function runSimulation(days: number, seed: number): { state: ReturnType<typeof newGame>; stats: PolicyStats } {
  const state = newGame(seed);
  const player = createPlayer();
  const stats: PolicyStats = { hires: 0, releases: 0, boostAccepts: 0, licenses: 0 };
  for (let i = 0; i < days; i++) {
    if (state.bankrupt) break;
    player.turn(state, stats);
    tick(state);
  }
  return { state, stats };
}

const TWO_YEARS = 2 * CONFIG.YEAR_LENGTH; // 730 дней

describe('баланс: «разумный» игрок, 24 месяца', () => {
  const seeds = [1, 2, 3, 4, 5];

  it('не банкротится на всех сидах', () => {
    for (const seed of seeds) {
      const { state } = runSimulation(TWO_YEARS, seed);
      expect(state.bankrupt, `seed ${seed}`).toBe(false);
    }
  });

  it('выпускает ≥3 игр и нанимает персонал', () => {
    for (const seed of seeds) {
      const { state, stats } = runSimulation(TWO_YEARS, seed);
      expect(stats.releases, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(state.staff.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('деньги растут (активы > старта)', () => {
    for (const seed of seeds) {
      const { state } = runSimulation(TWO_YEARS, seed);
      expect(state.money, `seed ${seed}`).toBeGreaterThan(CONFIG.START_MONEY);
    }
  });

  it('средние продажи первой игры > 5K копий (5 в тыс.)', () => {
    const totals: number[] = [];
    for (const seed of seeds) {
      const { state } = runSimulation(TWO_YEARS, seed);
      const first = state.history[0];
      if (first) totals.push(first.units);
    }
    const avg = totals.reduce((a, b) => a + b, 0) / Math.max(1, totals.length);
    expect(avg).toBeGreaterThan(5);
  });
});

describe('баланс: бездействие — деньги тают', () => {
  it('без релизов деньги только убывают (после зарплат)', () => {
    const state = newGame(7);
    advanceWeeks(state, 3 * CONFIG.YEAR_LENGTH); // 3 года — зарплаты 2-го года уже прошли
    expect(state.money).toBeLessThan(CONFIG.START_MONEY);
    expect(state.history.length).toBe(0);
    expect(state.bankrupt).toBe(false); // банкротство наступает позже (M6-сценарий)
  });
});

describe('детерминизм', () => {
  it('одинаковый сид → одинаковый результат', () => {
    const a = runSimulation(365, 42);
    const b = runSimulation(365, 42);
    expect(a.state.money).toBe(b.state.money);
    expect(a.state.log.length).toBe(b.state.log.length);
    expect(a.stats.releases).toBe(b.stats.releases);
  });
});
