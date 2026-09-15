// M5: ХТК на экране «Код» — чистое ядро проигрывателя (события, сэмплы, планирование).
import { describe, expect, it } from 'vitest';
import {
  bgNotes,
  burstOnWave,
  groupEvents,
  isOverflow,
  nextPieceIndex,
  pickSample,
  planDue,
  ringSeconds,
  WTC_AHEAD_MAX,
  WTC_BURST_CHORDS,
  WTC_GAP_MIN,
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
  it('ротация произведений идёт по кругу', () => {
    expect(nextPieceIndex(0, 4)).toBe(1);
    expect(nextPieceIndex(3, 4)).toBe(0);
    expect(nextPieceIndex(0, 0)).toBe(0);
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
  it('стартовая пачка играет каденцию и взводит ожидание первой недели', () => {
    expect(burstOnWave('idle', 0, 20, true)).toEqual({ burst: true, stage: 'chunk' });
  });
  it('первая рабочая неделя тоже пачка — каденция; дальше обычный режим', () => {
    expect(burstOnWave('chunk', 8, 12, true)).toEqual({ burst: true, stage: 'done' });
    expect(burstOnWave('done', 8, 12, true)).toEqual({ burst: false, stage: 'done' });
  });
  it('крошечные волны — не пачки (молчим)', () => {
    expect(burstOnWave('idle', 0, 2, true)).toEqual({ burst: false, stage: 'idle' });
    expect(burstOnWave('chunk', 8, 2, true)).toEqual({ burst: false, stage: 'done' });
  });
  it('улучшение в середине проекта — пачка, но ожидание недели не взводит', () => {
    expect(burstOnWave('done', 0, 30, false)).toEqual({ burst: true, stage: 'done' });
  });
  it('окно открыли в середине разработки — мелодия, а не каденция', () => {
    expect(burstOnWave('idle', 8, 5, false)).toEqual({ burst: false, stage: 'done' });
  });
  it('повторный проект: старт снова взводит ожидание первой недели', () => {
    let s: BurstStage = 'done';
    let r = burstOnWave(s, 8, 6, false); // середина старого проекта — мелодия
    expect(r).toEqual({ burst: false, stage: 'done' });
    s = r.stage;
    r = burstOnWave(s, 0, 22, true); // стартовая пачка нового — каденция
    expect(r).toEqual({ burst: true, stage: 'chunk' });
    s = r.stage;
    r = burstOnWave(s, 8, 10, true); // первая рабочая неделя — каденция
    expect(r).toEqual({ burst: true, stage: 'done' });
  });
});
