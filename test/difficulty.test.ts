// M6: уровни сложности — числа из difficulty/difficulty-presets.json применяются к живому CONFIG.
// Контракт с лабораторией (difficulty/README-agent.md §5): CONFIG — один изменяемый объект,
// applyDifficulty не пересоздаёт его, уровни в ядре не применяются автоматически.
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { applyDifficulty, currentDifficulty, difficultyConfig, ensureDifficulty, isDifficultyId, type DifficultyId } from '../src/core/difficulty';
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
// ожидаемое значение уровня — прямо из JSON (единственный источник чисел, обновляет лаборатория)
const presetVal = (id: string, k: string): number => presets.levels.find((l) => l.id === id)!.fullConfig[k]!;

describe('аудит-51 СВОД-P1-1: ensureDifficulty — точечное переключение уровня (мультисессии)', () => {
  afterAll(() => applyDifficulty('normal'));

  it('применяет уровень только при смене, повторный вызов безвреден', () => {
    applyDifficulty('normal');
    ensureDifficulty('easy');
    expect(currentDifficulty()).toBe('easy');
    expect(num('START_MONEY')).toBe(presetVal('easy', 'START_MONEY'));
    ensureDifficulty('easy'); // тот же уровень — скип
    expect(num('START_MONEY')).toBe(presetVal('easy', 'START_MONEY'));
    ensureDifficulty('hard');
    expect(currentDifficulty()).toBe('hard');
    expect(num('DEV_COST_SCALE')).toBeCloseTo(presetVal('hard', 'DEV_COST_SCALE'), 5);
    ensureDifficulty('easy');
    expect(num('START_MONEY')).toBe(presetVal('easy', 'START_MONEY'));
  });
});

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
    for (const k of ['START_MONEY', 'DEV_COST_SCALE', 'PAYDAY_DAY']) {
      expect([pick('easy', k), pick('normal', k), pick('hard', k)], k)
        .toEqual([presetVal('easy', k), presetVal('normal', k), presetVal('hard', k)]);
    }
    for (const k of ['CONTRACT_WEEKLY_RATE', 'BLACKOUT_CHANCE']) {
      expect(pick('easy', k), `easy.${k}`).toBeCloseTo(presetVal('easy', k), 5);
      expect(pick('normal', k), `normal.${k}`).toBeCloseTo(presetVal('normal', k), 5);
      expect(pick('hard', k), `hard.${k}`).toBeCloseTo(presetVal('hard', k), 5);
    }
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
    const before = num('START_MONEY');
    const cfg = difficultyConfig('hard');
    expect((cfg as unknown as Record<string, number>).START_MONEY).toBe(presetVal('hard', 'START_MONEY'));
    expect(num('START_MONEY')).toBe(before); // живой объект не тронут
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

  it('PAYDAY_DAY приходит по модулю года: со 2-го года зарплаты уходят', () => {
    applyDifficulty('normal');
    expect(CONFIG.FIRST_YEAR_FREE).toBe(true); // в первый год зарплат нет — доходим до второй даты
    const g = newGame(7);
    expect(g.money).toBe(CONFIG.START_MONEY);
    const doy = ((CONFIG.PAYDAY_DAY - 1) % CONFIG.YEAR_LENGTH) + 1; // фактический день года выплат
    for (let i = 0; i < CONFIG.YEAR_LENGTH + doy + 1; i++) tick(g); // год 1 бесплатный + день выплат года 2
    expect(g.log.some((l) => l.text.includes('Выплачены зарплаты'))).toBe(true);
    expect(g.money).toBeLessThan(CONFIG.START_MONEY);
  });
});
