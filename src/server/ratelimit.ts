// Деплой (plan/19): простая защита от перебора — скользящее окно попыток на ключ.
export class RateLimit {
  private readonly hits = new Map<string, number[]>();

  private calls = 0;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Попытка разрешена? Каждая разрешённая попытка идёт в счётчик окна. */
  allow(key: string, now = Date.now()): boolean {
    if (++this.calls % 200 === 0) this.sweep(now); // редкая чистка, чтобы карта не росла
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }

  /** Удачный вход — окно попыток сбрасываем. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Выкинуть истёкшие окна. */
  sweep(now = Date.now()): void {
    for (const [key, list] of this.hits) {
      const keep = list.filter((t) => now - t < this.windowMs);
      if (keep.length === 0) this.hits.delete(key);
      else this.hits.set(key, keep);
    }
  }
}
