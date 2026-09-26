// LLM-08: порядок аккаунтов GigaChat — текущий первым, резерв следом.
import { describe, expect, it } from 'vitest';
import { gigaOrder } from '../src/server/giga';

describe('LLM-08: обход аккаунтов GigaChat (резерв при отказе основного)', () => {
  it('текущий идёт первым, остальные следом', () => {
    expect(gigaOrder(0, 2)).toEqual([0, 1]);
    expect(gigaOrder(1, 2)).toEqual([1, 0]);
    expect(gigaOrder(0, 1)).toEqual([0]);
  });
  it('битый current не ломает порядок', () => {
    expect(gigaOrder(5, 2)).toEqual([0, 1]);
    expect(gigaOrder(-1, 2)).toEqual([0, 1]);
  });
});
