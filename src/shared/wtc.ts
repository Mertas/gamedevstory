// M5 (plan/31): Бах по нотам на экране «Код» — чистое ядро проигрывателя ХТК.
// Событие = момент партитуры (одновременные ноты бьют вместе — «честные голоса»).
// Нотные данные — общественное достояние (И.С. Бах, ХТК-I); сэмплы — VCSL (CC0).
// Здесь только чистая логика (без WebAudio) — её и тестируем.

/** нота партитуры: [тик, midi, длительность в тиках, голос?] (тик = 1/16) */
export type WtcNote = [number, number, number] | [number, number, number, number];

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
