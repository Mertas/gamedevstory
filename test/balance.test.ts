// Баланс-прогон: 24 месяца (728 дней) по скриптованной политике.
// Ожидания из 08_Экономика_и_баланс.md: «разумный» игрок растёт, не банкротится.
// Тик = 1 игровой день (1 апреля 1985 → день 1); год = 365 дней.
import { describe, expect, it } from 'vitest';
import { advanceWeeks, newGame, startProjectAction, tick } from '../src/core/engine';
import { autopilotProjectInput, createPlayer, type PolicyStats } from '../src/core/sim/policy';
import { CONFIG } from '../src/core/config';

export function runSimulation(days: number, seed: number): { state: ReturnType<typeof newGame>; stats: PolicyStats } {
  const state = newGame(seed);
  const player = createPlayer();
  const stats: PolicyStats = { hires: 0, fires: 0, releases: 0, boostAccepts: 0, licenses: 0 };
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

describe('AP-06: хозяйство «разумного» игрока (офис, лицензии, бустеры)', () => {
  const emptyStats = (): PolicyStats => ({ hires: 0, fires: 0, releases: 0, boostAccepts: 0, licenses: 0 });
  const boosterCount = (state: ReturnType<typeof newGame>): number =>
    Object.values(state.boosterPurchases).reduce((a, b) => a + b, 0);

  it('не нанимает сверх купленных мест (PLAN-53: кап офиса убран)', () => {
    const state = newGame(42);
    const player = createPlayer();
    const stats = emptyStats();
    for (let i = 0; i < 2000 && !state.bankrupt; i++) {
      player.turn(state, stats);
      tick(state);
    }
    expect(state.staff.length).toBeLessThanOrEqual(state.seats);
    expect(state.officeLevel).toBe(1); // policy места не покупает — офис не растёт сам
  });

  it('берёт лицензии шире Microx SX — по одной за ход, с резервом 800K', () => {
    const state = newGame(11);
    tick(state); // PC и Microx SX в продаже
    const player = createPlayer();
    const stats = emptyStats();
    state.money = 2500;
    player.turn(state, stats);
    expect(state.consoles['microx-sx']!.licensed).toBe(true); // самая дешёвая доступная — первой
    state.consoles['exodus']!.availableAtWeek = state.week; // «поступила в продажу»
    state.money = 3000; // ход тратит и на найм — денег должно хватать и на лицензию, и на резерв
    player.turn(state, stats);
    expect(state.consoles['exodus']!.licensed).toBe(true); // следующая по цене (400K)
    // дорогая лицензия при остатке меньше резерва (цена + 800) не берётся
    state.consoles['play-gear']!.availableAtWeek = state.week;
    expect(state.staff.length).toBe(state.seats); // PLAN-53: мест нет — ход не тратит на найм
    state.money = 1700; // 1700 − 1050 = 650 < 800 — резерв обязан остановить
    player.turn(state, stats);
    expect(state.consoles['play-gear']!.licensed).toBe(false);
    state.money = 2600; // контрольная: 2600 − 1050 = 1550 >= 800 — движок платить готов
    player.turn(state, stats);
    expect(state.consoles['play-gear']!.licensed).toBe(true);
  });

  it('у продавца покупает бустер за деньги и сразу применяет его в разработку', () => {
    const state = newGame(11);
    tick(state);
    const player = createPlayer();
    const stats = emptyStats();
    expect(startProjectAction(state, autopilotProjectInput(state)!).ok).toBe(true); // активная разработка
    state.money = 3000;
    state.salesmanHere = true;
    const before = boosterCount(state);
    const usesBefore = state.staff.reduce((a, s) => a + Object.values(s.boosterUses).reduce((x, y) => x + y, 0), 0);
    player.turn(state, stats);
    expect(boosterCount(state)).toBe(before + 1); // один бустер за ход
    const usesAfter = state.staff.reduce((a, s) => a + Object.values(s.boosterUses).reduce((x, y) => x + y, 0), 0);
    expect(usesAfter).toBe(usesBefore + 1); // и он сразу применён
    expect(state.money).toBeLessThan(3000);
    // без резерва (цена + 1000K) больше не покупает
    const mid = boosterCount(state);
    state.money = 300;
    player.turn(state, stats);
    expect(boosterCount(state)).toBe(mid);
  });
});
