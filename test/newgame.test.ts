// PLAN-18 (этап 1): новая игра — название студии и стартовая пара из начального пула.
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import type { GameState } from '../src/core/types';

describe('PLAN-18: стартовая студия (название и пара сотрудников)', () => {
  it('по умолчанию — «Game Dev Studio» и классическая пара Newb + John', () => {
    const g = newGame(1);
    expect(g.studioName).toBe('Game Dev Studio');
    expect(g.staff.map((s) => s.id)).toEqual(['newb-ownerton', 'john-gameson']);
    expect(g.hiredIds).toEqual(['newb-ownerton', 'john-gameson']);
  });

  it('игрок выбирает название и двух сотрудников из начального пула', () => {
    const g = newGame(7, { studioName: '  Пиксель-Плюс  ', staffIds: ['dee-coder', 's-presso'] });
    expect(g.studioName).toBe('Пиксель-Плюс'); // тримминг пробелов
    expect(g.staff.map((s) => s.id)).toEqual(['dee-coder', 's-presso']);
    expect(g.hiredIds).toEqual(['dee-coder', 's-presso']);
    expect(g.staff.every((s) => !!s.avatar)).toBe(true);
  });

  it('битый выбор не ломает партию: дубли/чужие id отсекаются, пустой — классическая пара', () => {
    const one = newGame(3, { staffIds: ['dee-coder', 'no-such-staff'] });
    expect(one.staff.map((s) => s.id)).toEqual(['dee-coder']);
    const dup = newGame(3, { staffIds: ['dee-coder', 'dee-coder', 's-presso'] });
    expect(dup.staff.map((s) => s.id)).toEqual(['dee-coder', 's-presso']);
    const none = newGame(3, { staffIds: ['a', 'b'] });
    expect(none.staff.map((s) => s.id)).toEqual(['newb-ownerton', 'john-gameson']);
  });

  it('миграция: старый сейв без studioName получает «Game Dev Studio»', () => {
    const g = newGame(1);
    delete (g as Partial<GameState>).studioName;
    g.saveVersion = 4;
    const m = migrateSave(g);
    expect(m.studioName).toBe('Game Dev Studio');
    expect(m.saveVersion).toBe(SAVE_VERSION);
  });

  it('аудит-51 P1-11: новая партия начинается с непоказанным онбордингом', () => {
    expect(newGame(1).introShown).toBe(false);
    expect(newGame(2, { studioName: 'Тест' }).introShown).toBe(false);
  });
});
