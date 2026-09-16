// Лимитер входа (src/server/ratelimit.ts): скользящее окно неудачных попыток.
import { describe, expect, it } from 'vitest';
import { RateLimit } from '../src/server/ratelimit';

describe('RateLimit: окно попыток на ключ', () => {
  it('после лимита попыток ключ блокируется, успешный вход сбрасывает окно', () => {
    const rl = new RateLimit(3, 10 * 60 * 1000);
    expect(rl.allow('login:1.2.3.4:normann')).toBe(true);
    expect(rl.allow('login:1.2.3.4:normann')).toBe(true);
    expect(rl.allow('login:1.2.3.4:normann')).toBe(true);
    expect(rl.allow('login:1.2.3.4:normann')).toBe(false); // 4-я — блок
    rl.reset('login:1.2.3.4:normann'); // верный пароль сбрасывает окно
    expect(rl.allow('login:1.2.3.4:normann')).toBe(true);
  });

  it('окно скользящее: старые попытки истекают', () => {
    const rl = new RateLimit(2, 1000);
    const t0 = 1_000_000;
    expect(rl.allow('k', t0)).toBe(true);
    expect(rl.allow('k', t0 + 500)).toBe(true);
    expect(rl.allow('k', t0 + 700)).toBe(false);
    expect(rl.allow('k', t0 + 1600)).toBe(true); // обе старые истекли
  });

  it('sweep выкидывает истёкшие окна', () => {
    const rl = new RateLimit(1, 1000);
    rl.allow('a', 0);
    rl.sweep(5000);
    expect(rl.allow('a', 5000)).toBe(true);
  });
});
