import { describe, expect, it } from 'vitest';
import { createSeqGuard } from '../src/server/wire';

describe('wire: защита от дублей (SRV-06)', () => {
  it('сообщения без sid/seq пропускаются как есть', () => {
    const g = createSeqGuard();
    expect(g.check(null, undefined)).toBe('no-seq');
    expect(g.check('a', undefined)).toBe('no-seq');
    expect(g.check(null, 5)).toBe('no-seq');
  });

  it('монотонный seq одной сессии — process (дырки допустимы)', () => {
    const g = createSeqGuard();
    expect(g.check('a', 1)).toBe('process');
    expect(g.check('a', 2)).toBe('process');
    expect(g.check('a', 5)).toBe('process');
  });

  it('повтор уже обработанного (seq <= последнего) — dup, счётчик не сдвигается', () => {
    const g = createSeqGuard();
    g.check('a', 3);
    expect(g.check('a', 3)).toBe('dup');
    expect(g.check('a', 2)).toBe('dup');
    expect(g.check('a', 4)).toBe('process');
  });

  it('новая сессия страницы (другой sid) начинает счёт заново', () => {
    const g = createSeqGuard();
    g.check('a', 10);
    expect(g.check('b', 1)).toBe('process');
    expect(g.check('b', 2)).toBe('process');
  });
});
