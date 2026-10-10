// аудит-51 P1-12: журнал студии (core/log) — окно «Журнал» читает этот список.
// Записи датируются игровым днём, копятся и обрезаются по LOG_CAP (старейшие вытесняются).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import { log } from '../src/core/log';

describe('аудит-51 P1-12: журнал студии', () => {
  it('записи датируются игровым днём и годом (для окна «Журнал»)', () => {
    const g = newGame(1);
    const before = g.log.length;
    log(g, 'Проверка записи.');
    expect(g.log).toHaveLength(before + 1);
    const last = g.log[g.log.length - 1]!;
    expect(last.text).toBe('Проверка записи.');
    expect(last.week).toBe(g.week);
    expect(last.year).toBe(g.year);
  });

  it('журнал не растёт бесконечно — старейшие записи вытесняются (LOG_CAP)', () => {
    const g = newGame(1);
    for (let i = 0; i < CONFIG.LOG_CAP + 5; i++) log(g, `запись ${i}`);
    expect(g.log).toHaveLength(CONFIG.LOG_CAP);
    expect(g.log[0]!.text).toBe('запись 5'); // первые пять вытеснены
    expect(g.log[g.log.length - 1]!.text).toBe(`запись ${CONFIG.LOG_CAP + 4}`);
  });
});
