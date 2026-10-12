// аудит-51 01-P2-3 / 05-P3-5: антипремия «Худшая игра года» за релиз с 50+ багами.
import { describe, expect, it } from 'vitest';
import { awardsCeremony } from '../src/core/systems/market';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import type { GameRecord } from '../src/core/types';

function record(week: number, score: number, bugs: number): GameRecord {
  return {
    name: `Игра ${week}/${bugs}`, genreId: 'puzzle', typeId: 'reversi', consoleId: 'pc-game',
    score, units: 10, revenue: 100, releaseWeek: week, year: 2,
    attrs: { fun: 10, creativity: 10, graphics: 10, sound: 10 }, bugs, awards: [],
  };
}

describe('аудит-51 01-P2-3: антипремия «Худшая игра»', () => {
  it('релиз с 50+ багами получает «Худшую игру» и штраф, даже минуя зал славы', () => {
    const g = newGame(7);
    g.year = 2;
    const relWeek = CONFIG.YEAR_LENGTH + 10; // в окне (AWARDS_DAY прошлого года, AWARDS_DAY этого]
    g.history = [record(relWeek, 20, 55)];
    const moneyBefore = g.money;
    awardsCeremony(g, createRng(1));
    expect(g.awards.worst).toBe(1);
    expect(g.history[0]!.awards).toContain('Худшая игра 2');
    expect(g.money).toBe(moneyBefore - CONFIG.PRIZE_WORST);
  });

  it('грязный релиз ниже порога — антипремии нет', () => {
    const g = newGame(7);
    g.year = 2;
    g.history = [record(CONFIG.YEAR_LENGTH + 10, 20, 49)];
    awardsCeremony(g, createRng(1));
    expect(g.awards.worst).toBe(0);
  });

  it('обычная игра года без багов — антипремии нет', () => {
    const g = newGame(7);
    g.year = 2;
    g.history = [record(CONFIG.YEAR_LENGTH + 10, 45, 3)];
    awardsCeremony(g, createRng(1));
    expect(g.awards.worst).toBe(0);
  });
});
