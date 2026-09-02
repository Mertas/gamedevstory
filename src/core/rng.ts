// Детерминированный RNG (mulberry32) — состояние хранится в сейве.
export interface Rng {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // включительно
  chance(p: number): boolean;
  state: number; // uint32 — сериализуется
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = ((t ^ (t >>> 15)) * (t | 1)) >>> 0;
    t = (t ^ (t + (((t ^ (t >>> 7)) * (t | 61)) >>> 0))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p) {
      return next() < p;
    },
    get state() {
      return s >>> 0;
    },
    set state(v) {
      s = v >>> 0;
    },
  };
}

export function rngFromState(state: number, seedFallback: number): Rng {
  const r = createRng(state === 0 ? seedFallback : state);
  return r;
}
