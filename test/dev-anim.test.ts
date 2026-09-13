// M1 (plan/31): анимация разработки — чистая логика (режимы, веса, размаз по такту, шкала).
import { describe, expect, it } from 'vitest';
import {
  ANIM_ATTRS,
  PARTICLES_PER_ATTR_TICK,
  START_SCALE,
  animMode,
  barScaleTop,
  planWave,
  recordThreshold,
  resolveFx,
} from '../src/shared/dev-anim';
import type { DevContrib, Stats } from '../src/core/types';

const gaps = (o: Partial<Stats>): Stats => ({ fun: 0, creativity: 0, graphics: 0, sound: 0, ...o });
const c = (attr: DevContrib['attr'], amount: number, staffId = 's1'): DevContrib => ({ staffId, attr, amount });
const fixedRng = (v: number) => () => v;

describe('анимация разработки: режимы', () => {
  it('точный — до 12 очков за такт включительно', () => {
    expect(animMode(1)).toBe('exact');
    expect(animMode(12)).toBe('exact');
  });
  it('плотный — 13…200', () => {
    expect(animMode(13)).toBe('dense');
    expect(animMode(200)).toBe('dense');
  });
  it('поток — больше 200', () => {
    expect(animMode(201)).toBe('stream');
    expect(animMode(3000)).toBe('stream');
  });
});

describe('анимация разработки: веса и бюджет волны', () => {
  it('точный режим: 1 символ = 1 очко (веса все 1)', () => {
    const wave = planWave([c('fun', 5)], gaps({ fun: 5 }), 1, fixedRng(0.5));
    expect(wave).toHaveLength(5);
    expect(wave.every((p) => p.weight === 1)).toBe(true);
    expect(wave.every((p) => p.attr === 'fun')).toBe(true);
  });

  it('суммарный вес всегда точно равен разрыву (свип значений)', () => {
    for (const g of [1, 2, 12, 13, 45, 99, 100, 200, 201, 1234, 2000, 7000, 12345]) {
      const wave = planWave([c('graphics', 10)], gaps({ graphics: g }), 1, fixedRng(0.3));
      const total = wave.reduce((a, p) => a + p.weight, 0);
      expect(total, `gap=${g}`).toBe(g);
    }
  });

  it('на направление — не больше 12 частиц за такт', () => {
    const wave = planWave([c('fun', 1)], gaps({ fun: 5000 }), 1, fixedRng(0.4));
    expect(wave.length).toBeLessThanOrEqual(PARTICLES_PER_ATTR_TICK);
    // и все живые веса положительны
    expect(wave.every((p) => p.weight >= 1)).toBe(true);
  });

  it('раскладка по сотрудникам: largest remainder от вклада', () => {
    const contrib = [c('fun', 3, 'a'), c('fun', 2, 'b'), c('fun', 1, 'c')];
    const wave = planWave(contrib, gaps({ fun: 6 }), 1, fixedRng(0));
    const by = new Map<string, number>();
    for (const p of wave) by.set(p.staffId, (by.get(p.staffId) ?? 0) + 1);
    expect([by.get('a'), by.get('b'), by.get('c')]).toEqual([3, 2, 1]);
  });

  it('фолбэк: без прямых доноров атрибута частицы летят от тех, кто внёс вклад', () => {
    const wave = planWave([c('fun', 4, 'z')], gaps({ sound: 3 }), 1, fixedRng(0));
    expect(wave).toHaveLength(3);
    expect(wave.every((p) => p.staffId === 'z' && p.attr === 'sound')).toBe(true);
  });

  it('пусто: нет вклада или нет разрыва — волны нет', () => {
    expect(planWave([], gaps({ fun: 10 }), 1)).toEqual([]);
    expect(planWave([c('fun', 4)], gaps({}), 1)).toEqual([]);
  });

  it('несколько направлений: волна идёт по кругу между ними', () => {
    const wave = planWave([c('fun', 1, 'a'), c('sound', 1, 'b')], gaps({ fun: 3, sound: 3 }), 1, fixedRng(0));
    const attrs = wave.map((p) => p.attr);
    // чередование fun/sound, а не два блока подряд
    expect(attrs[0]).not.toBe(attrs[1]);
    expect(attrs[2]).not.toBe(attrs[3]);
  });
});

describe('анимация разработки: размаз по такту', () => {
  it('все задержки внутри такта и строго возрастают (стратификация)', () => {
    const wave = planWave([c('fun', 1)], gaps({ fun: 200 }), 1, fixedRng(0.5));
    const delays = wave.map((p) => p.delay);
    expect(delays[0]!).toBeGreaterThanOrEqual(0);
    expect(delays[delays.length - 1]!).toBeLessThan(1);
    for (let i = 1; i < delays.length; i++) expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    // каждый в своей доле: delay_i ∈ [i/n, (i+0.9)/n)
    const n = delays.length;
    delays.forEach((d, i) => {
      expect(d).toBeGreaterThanOrEqual((i / n) * 0.999);
      expect(d).toBeLessThan(((i + 0.9) / n) * 1.001);
    });
  });

  it('задержки масштабируются тактом (8× → такт 0.125 с)', () => {
    const wave = planWave([c('fun', 1)], gaps({ fun: 4 }), 0.125, fixedRng(0));
    for (const p of wave) expect(p.delay).toBeLessThan(0.125);
  });

  it('лидер — самая тяжёлая частица — стартует первой', () => {
    const wave = planWave([c('fun', 1), c('graphics', 1)], gaps({ fun: 1000, graphics: 2 }), 1, fixedRng(0));
    expect(wave[0]!.weight).toBe(Math.max(...wave.map((p) => p.weight)));
    expect(wave[0]!.delay).toBe(0);
  });
});

describe('анимация разработки: динамическая шкала полосок', () => {
  it('без рекорда — стартовый ориентир', () => {
    expect(barScaleTop(null, 500)).toBe(START_SCALE);
    expect(barScaleTop(0, 100)).toBe(START_SCALE);
  });
  it('пока не догнали — шкала равна рекорду', () => {
    expect(barScaleTop(7181, 5000)).toBe(7181);
  });
  it('после превышения — рекорд + запас ~15%', () => {
    expect(barScaleTop(7181, 8000)).toBe(8000 + Math.max(7181 * 0.15, 150));
  });
  it('порог празднования — рекорд или стартовый ориентир', () => {
    expect(recordThreshold(null)).toBe(START_SCALE);
    expect(recordThreshold(7181)).toBe(7181);
  });
  it('все направления присутствуют в фиксированном порядке', () => {
    expect(ANIM_ATTRS).toEqual(['fun', 'creativity', 'graphics', 'sound']);
  });
});

describe('M3.8: уровень эффектов (resolveFx)', () => {
  it('явный выбор игрока важнее системной настройки', () => {
    expect(resolveFx('full', true)).toBe('full');
    expect(resolveFx('mid', true)).toBe('mid');
    expect(resolveFx('min', false)).toBe('min');
  });
  it('без выбора — «полно»', () => {
    expect(resolveFx(undefined, false)).toBe('full');
    expect(resolveFx(null, false)).toBe('full');
  });
  it('без выбора при prefers-reduced-motion — «минимум»', () => {
    expect(resolveFx(undefined, true)).toBe('min');
    expect(resolveFx(null, true)).toBe('min');
  });
  it('мусор в сейве не ломает: трактуем как «не выбран»', () => {
    expect(resolveFx('cinema', false)).toBe('full');
    expect(resolveFx(42, false)).toBe('full');
    expect(resolveFx({}, true)).toBe('min');
  });
});
