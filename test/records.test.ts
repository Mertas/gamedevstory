import { describe, expect, it } from 'vitest';
import { beatsRecord, studioRecords } from '../src/shared/records';
import type { GameRecord } from '../src/core/types';

const rec = (name: string, week: number, attrs: Partial<Record<'fun' | 'creativity' | 'graphics' | 'sound', number>>, extra: Partial<GameRecord> = {}): GameRecord =>
  ({
    name,
    releaseWeek: week,
    attrs: { fun: 0, creativity: 0, graphics: 0, sound: 0, ...attrs },
    contrib: {},
    ...extra,
  }) as unknown as GameRecord;

describe('PLAN-30: книга рекордов студии', () => {
  const history = [
    rec('A', 10, { fun: 100, creativity: 90, graphics: 80, sound: 70 }, { bugsTotal: 30, contrib: { Вася: 500 } }),
    rec('B', 20, { fun: 150, creativity: 60, graphics: 120, sound: 40 }, { bugsTotal: 12, contrib: { Петя: 900, Вася: 100 } }),
    rec('C', 30, { fun: 140, creativity: 130, graphics: 90, sound: 60 }, { bugsTotal: 25, contrib: { Аня: 700 } }),
  ];

  it('лучшие значения по направлениям', () => {
    const r = studioRecords(history);
    expect(r.dirs.fun).toEqual({ value: 150, game: 'B' });
    expect(r.dirs.creativity).toEqual({ value: 130, game: 'C' });
    expect(r.dirs.graphics).toEqual({ value: 120, game: 'B' });
    expect(r.dirs.sound).toEqual({ value: 70, game: 'A' });
  });

  it('рекорд по сумме направлений', () => {
    const r = studioRecords(history);
    // A: 340, B: 370, C: 420
    expect(r.sum).toEqual({ value: 420, game: 'C' });
  });

  it('рекорд по багам за разработку — меньше лучше', () => {
    const r = studioRecords(history);
    expect(r.bugs).toEqual({ value: 12, game: 'B' });
  });

  it('лучший вклад сотрудника за всё время', () => {
    const r = studioRecords(history);
    expect(r.contrib).toEqual({ value: 900, who: 'Петя', game: 'B' });
  });

  it('skipKey исключает текущую запись — сравнение идёт с другими', () => {
    const r = studioRecords(history, 'C#30');
    expect(r.dirs.creativity).toEqual({ value: 90, game: 'A' });
    expect(r.sum).toEqual({ value: 370, game: 'B' });
    expect(r.bugs).toEqual({ value: 12, game: 'B' });
    expect(r.contrib).toEqual({ value: 900, who: 'Петя', game: 'B' });
  });

  it('beatsRecord: пустая книга — уже рекорд; иначе строгое сравнение', () => {
    expect(beatsRecord(10, null)).toBe(true);
    expect(beatsRecord(10, { value: 9, game: 'X' })).toBe(true);
    expect(beatsRecord(9, { value: 9, game: 'X' })).toBe(false);
    expect(beatsRecord(5, { value: 7, game: 'X' }, 'low')).toBe(true);
  });
});
