// M5: ХТК на экране «Код» — чистое ядро проигрывателя (события, сэмплы, планирование).
import { describe, expect, it } from 'vitest';
import {
  groupEvents,
  isOverflow,
  nextPieceIndex,
  pickSample,
  planDue,
  ringSeconds,
  WTC_AHEAD_MAX,
  WTC_GAP_MIN,
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
