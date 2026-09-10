import { describe, expect, it } from 'vitest';
import { Outbox } from '../src/ui/outbox';

const T = 1000; // тестовый TTL вместо боевых 15 с

describe('Outbox (SRV-06)', () => {
  it('push/ack: удаляет ровно подтверждённый seq', () => {
    const o = new Outbox(T);
    o.push(1, 'm1', 0);
    o.push(2, 'm2', 0);
    expect(o.size).toBe(2);
    o.ack(1);
    expect(o.size).toBe(1);
    o.ack(99); // чужой seq — молча
    expect(o.size).toBe(1);
  });

  it('drain: свежие — к повтору, устаревшие — потеряны; до ack элементы остаются', () => {
    const o = new Outbox(T);
    o.push(1, 'old', 0);
    o.push(2, 'fresh', 900);
    const { ready, dropped } = o.drain(1001); // 'old' старше TTL на 1 мс
    expect(ready.map((x) => x.data)).toEqual(['fresh']);
    expect(dropped).toBe(1);
    expect(o.size).toBe(1); // fresh остаётся в очереди до ack
    const again = o.drain(1001);
    expect(again.ready.map((x) => x.data)).toEqual(['fresh']);
    expect(again.dropped).toBe(0);
  });

  it('prune: убирает только устаревшие', () => {
    const o = new Outbox(T);
    o.push(1, 'a', 0);
    o.push(2, 'b', 1500);
    expect(o.prune(1600)).toBe(1);
    expect(o.size).toBe(1);
  });

  it('переполнение: вытесняет самые старые', () => {
    const o = new Outbox(T, 3);
    for (let i = 1; i <= 5; i++) o.push(i, `m${i}`, 0);
    expect(o.size).toBe(3);
    const { ready } = o.drain(0);
    expect(ready.map((x) => x.seq)).toEqual([3, 4, 5]);
  });

  it('clear: очередь пуста (перезапуск сервера)', () => {
    const o = new Outbox(T);
    o.push(1, 'm', 0);
    o.clear();
    expect(o.size).toBe(0);
  });
});
