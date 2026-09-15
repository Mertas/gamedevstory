// M5 (plan/31): Бах по нотам на экране «Код» — чистое ядро проигрывателя ХТК.
// Событие = момент партитуры (одновременные ноты бьют вместе — «честные голоса»).
// Нотные данные — общественное достояние (И.С. Бах, ХТК-I); сэмплы — VCSL (CC0).
// Здесь только чистая логика (без WebAudio) — её и тестируем.

/** нота партитуры: [тик, midi, длительность в тиках, голос?] (тик = 1/16) */
export type WtcNote = [number, number, number] | [number, number, number, number];

/** тональность пьесы */
export type WtcKey = 'Cm' | 'C' | 'D';

/**
 * Каденции «по баховским канонам» для пачек очков (стартовые очки, улучшения):
 * три аккорда в текущей тональности — iv–V–i (минор) / IV–V–I (мажор),
 * тесное расположение около первой октавы, с вводным тоном в доминанте.
 */
export const WTC_BURST_CHORDS: Record<WtcKey, ReadonlyArray<ReadonlyArray<number>>> = {
  Cm: [
    [53, 56, 60], // f-moll (iv)
    [55, 59, 62], // G-dur (V, вводный си)
    [60, 63, 67], // c-moll (i)
  ],
  C: [
    [53, 57, 60], // F (IV)
    [55, 59, 62], // G (V)
    [60, 64, 67], // C (I)
  ],
  D: [
    [55, 59, 62], // G (IV)
    [57, 61, 64], // A (V)
    [62, 66, 69], // D (I)
  ],
};

export interface WtcPiece {
  title: string;
  bwv: string;
  mm: number;
  ticksPerQuarter: number;
  notes: WtcNote[];
}

/** событие: все ноты одного момента (аккорд/совпадение голосов) */
export interface WtcEvent {
  t: number;
  notes: WtcNote[];
}

export interface WtcSample {
  midi: number;
  file: string;
}

/** минимальный музыкальный зазор между событиями (потолок скорости на 4×/8×) */
export const WTC_GAP_MIN = 0.045;
/** насколько вперёд можно планировать звук; дальше — очередь переполнена, нота пропускается */
export const WTC_AHEAD_MAX = 2.2;

/** склейка нот в события: подряд идущие ноты с равным временем — один удар */
export function groupEvents(notes: WtcNote[]): WtcEvent[] {
  const out: WtcEvent[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && last.t === n[0]) last.notes.push(n);
    else out.push({ t: n[0], notes: [n] });
  }
  return out;
}

/** ближайший сэмпл к ноте + коэффициент воспроизведения (2^(Δ/12)) */
export function pickSample(samples: WtcSample[], midi: number): { sample: WtcSample; rate: number } | null {
  let best: WtcSample | null = null;
  let bestD = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.midi - midi);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) return null;
  return { sample: best, rate: Math.pow(2, (midi - best.midi) / 12) };
}

/** сколько секунд держать ноту: по темпу самой пьесы (MM), с разумными рамками */
export function ringSeconds(durTicks: number, mm: number, ticksPerQuarter: number): number {
  const sec = (durTicks * 60) / (Math.max(20, mm) * Math.max(1, ticksPerQuarter));
  return Math.min(5, Math.max(0.1, sec));
}

/** когда играть событие: не раньше now и не ближе gap к предыдущему */
export function planDue(lastAt: number, now: number, gap: number = WTC_GAP_MIN): number {
  return Math.max(now + 0.02, lastAt + gap);
}

/** очередь переполнена? (планировать дальше aheadMax вперёд нельзя — нота пропускается) */
export function isOverflow(due: number, now: number, aheadMax: number = WTC_AHEAD_MAX): boolean {
  return due - now > aheadMax;
}

/** следующее произведение ротации (по кругу) */
export function nextPieceIndex(index: number, total: number): number {
  return total > 0 ? (index + 1) % total : 0;
}

/** сколько нот догнать за elapsedMs фонового хода («не выключать» в скрытой вкладке) */
export function bgNotes(elapsedMs: number, rate = 2, max = 4): number {
  return Math.max(1, Math.min(max, Math.round((Math.max(0, elapsedMs) / 1000) * rate)));
}

/** M5.3: стадия «пачек» в проекте — idle: ещё не видели пачек; chunk: стартовая пачка получена,
 *  ждём первую рабочую неделю; done: обычный режим (мелодия). */
export type BurstStage = 'idle' | 'chunk' | 'done';

/**
 * М5.3: решение по волне очков. Пачка (стартовые очки «предложения», первая рабочая неделя,
 * успешное улучшение) играется каденцией вместо мелодии.
 * dc — число записей вклада за такт, jump — скачок суммы очков, nearStart — первые недели проекта.
 */
export function burstOnWave(
  stage: BurstStage,
  dc: number,
  jump: number,
  nearStart: boolean,
  min = 3,
): { burst: boolean; stage: BurstStage } {
  if (dc > 0) return { burst: stage === 'chunk' && jump >= min, stage: 'done' };
  if (jump < min) return { burst: false, stage };
  return { burst: true, stage: nearStart ? 'chunk' : stage };
}
