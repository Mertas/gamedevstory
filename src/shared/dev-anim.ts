// M1 (plan/31_Анимация_разработки.md): чистая логика анимации окна «Код».
// Живёт в shared: движок UI и тесты используют одни правила (режимы, веса, размаз, шкала).
import type { DevContrib, Stats } from '../core/types';

export type AnimAttr = keyof Stats;

/** Фиксированный порядок направлений (стабильные цвета и раскладка волны). */
export const ANIM_ATTRS: readonly AnimAttr[] = ['fun', 'creativity', 'graphics', 'sound'];

/** Бюджет: максимум частиц на направление за один игровой день. */
export const PARTICLES_PER_ATTR_TICK = 12;

/** Стартовый ориентир шкалы, пока у студии нет рекорда по направлению. */
export const START_SCALE = 2000;

/** Режим волны по разрыву (очков за такт): точный / плотный / поток. */
export function animMode(gap: number): 'exact' | 'dense' | 'stream' {
  if (gap <= PARTICLES_PER_ATTR_TICK) return 'exact';
  if (gap <= 200) return 'dense';
  return 'stream';
}

export interface PlannedParticle {
  attr: AnimAttr;
  /** от кого летит (для поиска источника на экране) */
  staffId: string;
  /** вес в очках: 1 = «1 символ = 1 очко» (точный режим) */
  weight: number;
  /** задержка старта внутри такта, сек — размаз (стратифицированный джиттер) */
  delay: number;
}

/**
 * Планирование волны вклада за такт.
 * gaps[attr] — сколько очков ещё не долетело (цель − показано − в воздухе).
 * Бюджет ≤ PARTICLES_PER_ATTR_TICK частиц на атрибут; суммарный вес ровно равен разрыву:
 * вес K = ceil(gap / 12), частиц n = ceil(gap / K), последняя добирает остаток.
 * Раскладка по сотрудникам — largest remainder от их вклада за день.
 * Задержки — размаз по такту: своя случайная точка в своей доле тика (без комков и пустот).
 */
export function planWave(
  contrib: DevContrib[],
  gaps: Stats,
  tickSec: number,
  rng: () => number = Math.random,
): PlannedParticle[] {
  type One = { attr: AnimAttr; staffId: string; weight: number };
  const perAttr: One[][] = [];
  for (const attr of ANIM_ATTRS) {
    const gap = Math.floor(gaps[attr] ?? 0);
    if (gap <= 0) continue;
    // доноры: прямые роли атрибута; если роли нет (очки из направления) — все, кто внёс вклад
    let donors = contrib.filter((c) => c.attr === attr);
    if (!donors.length) donors = contrib.filter((c) => c.amount > 0);
    const sum = donors.reduce((a, d) => a + d.amount, 0);
    if (sum <= 0) continue;
    const k = Math.max(1, Math.ceil(gap / PARTICLES_PER_ATTR_TICK));
    const n = Math.ceil(gap / k);
    // largest remainder: сколько ЧАСТИЦ даём каждому донору
    const alloc = donors.map((d) => {
      const exact = (n * d.amount) / sum;
      const fl = Math.floor(exact);
      return { id: d.staffId, n: fl, rem: exact - fl };
    });
    let assigned = alloc.reduce((a, b) => a + b.n, 0);
    alloc.sort((a, b) => b.rem - a.rem);
    for (let i = 0; assigned < n; i++, assigned++) alloc[i % alloc.length]!.n += 1;
    const list: One[] = [];
    for (const b of alloc) for (let i = 0; i < b.n; i++) list.push({ attr, staffId: b.id, weight: k });
    // последняя частица добирает остаток: сумма весов ровно gap
    const total = n * k;
    if (total > gap) list[list.length - 1]!.weight -= total - gap;
    perAttr.push(list);
  }
  // сквозной порядок волны: по кругу между направлениями (потоки идут параллельно)
  const wave: One[] = [];
  const maxLen = Math.max(0, ...perAttr.map((l) => l.length));
  for (let i = 0; i < maxLen; i++) for (const list of perAttr) if (i < list.length) wave.push(list[i]!);
  if (!wave.length) return [];
  // лидер: самая тяжёлая частица стартует первой (глаз ведёт за ней)
  let li = 0;
  for (let i = 1; i < wave.length; i++) if (wave[i]!.weight > wave[li]!.weight) li = i;
  [wave[0], wave[li]] = [wave[li]!, wave[0]!];
  // размаз: стратифицированный джиттер — своя случайная точка в своей доле тика
  const totalN = wave.length;
  return wave.map((p, i) => ({ ...p, delay: ((i + rng() * 0.9) / totalN) * tickSec }));
}

/**
 * Верх шкалы полоски направления (решение босса: динамический по рекорду студии).
 * Пока рекорд не догнали — шкала это рекорд; после — рекорд + запас ~15%
 * (шкала плавно переставляется движком, момент превышения отмечается празднованием).
 * Без рекорда (первая игра студии) — стартовый ориентир START_SCALE.
 */
export function barScaleTop(record: number | null | undefined, shown: number): number {
  const rec = record && record > 0 ? record : START_SCALE;
  if (shown <= rec) return rec;
  return shown + Math.max(rec * 0.15, 150);
}

/** Порог «рекорда» для полоски: рекорд студии или стартовый ориентир. */
export function recordThreshold(record: number | null | undefined): number {
  return record && record > 0 ? record : START_SCALE;
}
