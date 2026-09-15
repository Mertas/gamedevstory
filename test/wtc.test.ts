// M5: ХТК на экране «Код» — чистое ядро проигрывателя (события, сэмплы, планирование).
import { describe, expect, it } from 'vitest';
import {
  bgNotes,
  burstOnWave,
  groupEvents,
  isOverflow,
  pickSample,
  planDue,
  randomPieceIndex,
  ringSeconds,
  WTC_AHEAD_MAX,
  WTC_BURST_CHORDS,
  WTC_GAP_MIN,
  WTC_LONG_CHORD,
  type BurstStage,
  type WtcKey,
  type WtcNote,
} from '../src/shared/wtc';

const n = (t: number, midi: number, dur: number): WtcNote => [t, midi, dur];

describe('M5: ХТК — честное многоголосие (события)', () => {
  it('одновременные ноты склеиваются в один удар', () => {
    const ev = groupEvents([n(0, 60, 4), n(0, 64, 4), n(0, 67, 4), n(1, 65, 2)]);
    expect(ev).toHaveLength(2);
    const [first, second] = ev;
    expect(first?.notes).toHaveLength(3);
    expect(second?.notes).toHaveLength(1);
    expect(first?.t).toBe(0);
    expect(second?.t).toBe(1);
  });
  it('последовательные ноты — отдельные события, порядок сохраняется', () => {
    const ev = groupEvents([n(0, 60, 1), n(1, 62, 1), n(2, 64, 1)]);
    expect(ev.map((e) => e.t)).toEqual([0, 1, 2]);
  });
  it('пустой список — пустые события', () => {
    expect(groupEvents([])).toEqual([]);
  });
});

describe('M5: ХТК — выбор сэмпла', () => {
  const samples = [
    { midi: 36, file: '36.ogg' },
    { midi: 48, file: '48.ogg' },
    { midi: 60, file: '60.ogg' },
  ];
  it('точное совпадение — свой сэмпл, скорость 1', () => {
    const p = pickSample(samples, 48);
    expect(p?.sample.file).toBe('48.ogg');
    expect(p?.rate).toBe(1);
  });
  it('между сэмплами — ближайший, скорость по полутонам', () => {
    const p = pickSample(samples, 50);
    expect(p?.sample.file).toBe('48.ogg');
    expect(p?.rate).toBeCloseTo(Math.pow(2, 2 / 12), 6);
  });
  it('без сэмплов — null', () => {
    expect(pickSample([], 60)).toBeNull();
  });
});

describe('M5: ХТК — длительности и планирование', () => {
  it('длительность ноты идёт от темпа пьесы (847: MM108, 16-я ≈ 0.139 с)', () => {
    expect(ringSeconds(1, 108, 4)).toBeCloseTo(60 / (108 * 4), 5);
    expect(ringSeconds(4, 108, 4)).toBeCloseTo(60 / 108, 5);
  });
  it('рамки длительности: не короче 0.1 с и не длиннее 5 с', () => {
    expect(ringSeconds(0.01, 108, 4)).toBe(0.1);
    expect(ringSeconds(1000, 108, 4)).toBe(5);
  });
  it('план: не раньше now и не ближе GAP к предыдущему', () => {
    expect(planDue(10, 10)).toBeCloseTo(10 + WTC_GAP_MIN, 6);
    expect(planDue(0, 5)).toBeCloseTo(5.02, 6);
  });
  it('переполнение очереди: слишком далёкое будущее — нота пропускается', () => {
    expect(isOverflow(1.0, 0)).toBe(false);
    expect(isOverflow(WTC_AHEAD_MAX + 0.5, 0)).toBe(true);
  });
  it('M5.4: следующее произведение — случайное, без повтора текущего', () => {
    expect(randomPieceIndex(0, 4, () => 0)).toBe(1); // i=0 → сдвиг на 1
    expect(randomPieceIndex(0, 4, () => 0.999)).toBe(3); // i=2 → 3
    expect(randomPieceIndex(2, 4, () => 0.67)).toBe(3); // i=2 ≥ 2 → 3
    expect(randomPieceIndex(2, 4, () => 0.1)).toBe(0); // i=0 < 2 → 0
    for (let cur = 0; cur < 4; cur++) {
      for (let k = 0; k < 30; k++) {
        const got = randomPieceIndex(cur, 4, () => (k + 0.5) / 30);
        expect(got).toBeGreaterThanOrEqual(0);
        expect(got).toBeLessThanOrEqual(3);
        expect(got).not.toBe(cur);
      }
    }
    expect(randomPieceIndex(0, 1)).toBe(0);
  });
});

describe('M5.2: пачки очков — фон и каденции вместо мелодии', () => {
  it('фоновая скорость: ~2 ноты/с, но не реже 1 и не больше потолка', () => {
    expect(bgNotes(0)).toBe(1);
    expect(bgNotes(1000)).toBe(2);
    expect(bgNotes(2000)).toBe(4);
    expect(bgNotes(60000)).toBe(4); // после долгого фона — не залп
  });
  it('каденции: три аккорда по три ноты, тесное расположение в первой октаве', () => {
    for (const key of ['Cm', 'C', 'D'] as WtcKey[]) {
      const chords = WTC_BURST_CHORDS[key];
      expect(chords).toHaveLength(3);
      for (const c of chords) {
        expect(c).toHaveLength(3);
        expect(c[0]!).toBeLessThan(c[1]!);
        expect(c[1]!).toBeLessThan(c[2]!);
        for (const m of c) {
          expect(m).toBeGreaterThanOrEqual(48);
          expect(m).toBeLessThanOrEqual(72);
        }
      }
    }
  });
  it('каденция заканчивается тоникой, доминанта — с вводным тоном', () => {
    expect(WTC_BURST_CHORDS.Cm[1]).toEqual([55, 59, 62]); // G-dur: си-натуральная
    expect(WTC_BURST_CHORDS.Cm[2]).toEqual([60, 63, 67]); // c-moll
    expect(WTC_BURST_CHORDS.C[2]).toEqual([60, 64, 67]); // C-dur
    expect(WTC_BURST_CHORDS.D[2]).toEqual([62, 66, 69]); // D-dur
  });
});

describe('M5.3: пачки — стартовая, первая рабочая неделя, улучшение', () => {
  it('стартовая пачка: молчит и играет длинный аккорд, ждём первую неделю', () => {
    expect(burstOnWave('idle', 0, 20, true)).toEqual({ burst: true, kind: 'long', stage: 'chunk' });
  });
  it('первая рабочая неделя: молчит, без второй пачки-аккорда', () => {
    expect(burstOnWave('chunk', 8, 12, true)).toEqual({ burst: true, kind: 'none', stage: 'done' });
    expect(burstOnWave('done', 8, 12, true)).toEqual({ burst: false, kind: 'none', stage: 'done' });
  });
  it('крошечные волны — не пачки (молчим)', () => {
    expect(burstOnWave('idle', 0, 2, true)).toEqual({ burst: false, kind: 'none', stage: 'idle' });
    expect(burstOnWave('chunk', 8, 2, true)).toEqual({ burst: false, kind: 'none', stage: 'done' });
  });
  it('улучшение в середине проекта — короткая каденция, ожидание недели не взводит', () => {
    expect(burstOnWave('done', 0, 30, false)).toEqual({ burst: true, kind: 'cadence', stage: 'done' });
  });
  it('окно открыли в середине разработки — мелодия, а не аккорд', () => {
    expect(burstOnWave('idle', 8, 5, false)).toEqual({ burst: false, kind: 'none', stage: 'done' });
  });
  it('повторный проект: старт снова даёт длинный аккорд', () => {
    let s: BurstStage = 'done';
    let r = burstOnWave(s, 8, 6, false); // середина старого проекта — мелодия
    expect(r).toEqual({ burst: false, kind: 'none', stage: 'done' });
    s = r.stage;
    r = burstOnWave(s, 0, 22, true); // стартовая пачка нового — длинный аккорд
    expect(r).toEqual({ burst: true, kind: 'long', stage: 'chunk' });
    s = r.stage;
    r = burstOnWave(s, 8, 10, true); // первая рабочая неделя — молчит
    expect(r).toEqual({ burst: true, kind: 'none', stage: 'done' });
  });
  it('длинный аккорд старта: 8–10 нот, тоника в трёх октавах, по возрастанию', () => {
    for (const key of ['Cm', 'C', 'D'] as WtcKey[]) {
      const ch = WTC_LONG_CHORD[key];
      expect(ch.length).toBeGreaterThanOrEqual(8);
      expect(ch.length).toBeLessThanOrEqual(10);
      for (let i = 1; i < ch.length; i++) expect(ch[i]!).toBeGreaterThan(ch[i - 1]!);
      expect(ch[0]!).toBeGreaterThanOrEqual(36);
      expect(ch[ch.length - 1]!).toBeLessThanOrEqual(76);
    }
    expect(WTC_LONG_CHORD.Cm[0]).toBe(36); // C2
    expect(WTC_LONG_CHORD.D[0]).toBe(38); // D2
  });
});
