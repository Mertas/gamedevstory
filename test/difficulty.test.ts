// M6: уровни сложности — числа из difficulty/difficulty-presets.json применяются к живому CONFIG.
// Контракт с лабораторией (difficulty/README-agent.md §5): CONFIG — один изменяемый объект,
// applyDifficulty не пересоздаёт его, уровни в ядре не применяются автоматически.
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { applyDifficulty, currentDifficulty, difficultyConfig, isDifficultyId, type DifficultyId } from '../src/core/difficulty';
import { newGame, tick } from '../src/core/engine';

interface PresetLevel {
  id: string;
  label: string;
  note: string;
  overrides: Record<string, number>;
  fullConfig: Record<string, number>;
}
interface PresetDoc {
  levels: PresetLevel[];
}

const presets = JSON.parse(readFileSync(new URL('../difficulty/difficulty-presets.json', import.meta.url), 'utf8')) as PresetDoc;
const num = (k: string): number => (CONFIG as unknown as Record<string, number>)[k] ?? NaN;

describe('M6: уровни сложности — база + перекрытия', () => {
  afterAll(() => {
    applyDifficulty('normal');
  });

  it('каждый уровень даёт ровно числа из difficulty-presets.json (fullConfig)', () => {
    for (const lvl of presets.levels) {
      applyDifficulty(lvl.id as DifficultyId);
      for (const [k, v] of Object.entries(lvl.fullConfig)) {
        expect(num(k), `${lvl.id}.${k}`).toBeCloseTo(v, 5);
      }
    }
  });

  it('приёмка §8: ключи отличаются ровно по JSON', () => {
    const pick = (id: DifficultyId, k: string): number => {
      applyDifficulty(id);
      return num(k);
    };
    expect([pick('easy', 'START_MONEY'), pick('normal', 'START_MONEY'), pick('hard', 'START_MONEY')]).toEqual([800, 500, 400]);
    expect([pick('easy', 'DEV_COST_SCALE'), pick('normal', 'DEV_COST_SCALE'), pick('hard', 'DEV_COST_SCALE')]).toEqual([1.9, 2.44, 3.2]);
    expect([pick('easy', 'PAYDAY_DAY'), pick('normal', 'PAYDAY_DAY'), pick('hard', 'PAYDAY_DAY')]).toEqual([372, 372, 372]);
    expect(pick('easy', 'CONTRACT_WEEKLY_RATE')).toBeCloseTo(0.01, 5);
    expect(pick('normal', 'CONTRACT_WEEKLY_RATE')).toBeCloseTo(0.007143, 5);
    expect(pick('hard', 'CONTRACT_WEEKLY_RATE')).toBeCloseTo(0.005, 5);
    expect(pick('easy', 'BLACKOUT_CHANCE')).toBeCloseTo(0.0015, 5);
    expect(pick('normal', 'BLACKOUT_CHANCE')).toBeCloseTo(0.00398, 5);
    expect(pick('hard', 'BLACKOUT_CHANCE')).toBeCloseTo(0.006, 5);
  });

  it('сброс к базе: после сложного «нормальный» возвращает базовые числа, объект тот же', () => {
    const ref = CONFIG; // лаборатория держит ссылку на живой объект — она не должна меняться
    applyDifficulty('normal');
    const baseMoney = num('START_MONEY');
    applyDifficulty('hard');
    expect(num('START_MONEY')).toBe(400);
    expect(CONFIG).toBe(ref);
    applyDifficulty('normal');
    expect(num('START_MONEY')).toBe(baseMoney);
    expect(currentDifficulty()).toBe('normal');
    expect(CONFIG).toBe(ref);
  });

  it('чистый difficultyConfig не трогает живой CONFIG', () => {
    applyDifficulty('normal');
    const cfg = difficultyConfig('hard');
    expect((cfg as unknown as Record<string, number>).START_MONEY).toBe(400);
    expect(num('START_MONEY')).toBe(500);
  });

  it('isDifficultyId отсекает мусор (старые сейвы → normal)', () => {
    expect(isDifficultyId('hard')).toBe(true);
    expect(isDifficultyId('nightmare')).toBe(false);
    expect(isDifficultyId(undefined)).toBe(false);
    expect(isDifficultyId(3)).toBe(false);
  });

  it('детерминизм: один сид + один уровень = один результат (дважды)', () => {
    const run = (): string => {
      applyDifficulty('hard');
      const state = newGame(7);
      for (let i = 0; i < 200; i++) {
        if (state.bankrupt) break;
        tick(state);
      }
      return JSON.stringify({ money: Math.round(state.money), week: state.week, staff: state.staff.length, fans: Math.round(state.fans) });
    };
    expect(run()).toBe(run());
  });

  it('новые партии на разных уровнях действительно разные (стартовый капитал)', () => {
    applyDifficulty('easy');
    const easy = newGame(11);
    applyDifficulty('hard');
    const hard = newGame(11);
    expect(easy.money).toBe(800);
    expect(hard.money).toBe(400);
    applyDifficulty('normal');
  });

  it('PAYDAY_DAY 372 шире года — приходит по модулю (7 апреля): со 2-го года зарплаты уходят', () => {
    applyDifficulty('normal');
    expect(CONFIG.FIRST_YEAR_FREE).toBe(true); // в первый год зарплат нет — доходим до второй даты
    const g = newGame(7);
    expect(g.money).toBe(CONFIG.START_MONEY);
    for (let i = 0; i < 373; i++) tick(g); // день года 372 → второй раз «7 апреля» (год 2)
    expect(g.money).toBeLessThan(CONFIG.START_MONEY);
  });
});
