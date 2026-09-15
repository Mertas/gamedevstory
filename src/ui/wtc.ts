// M5 (plan/31): Бах по нотам на экране «Код» — проигрыватель ХТК.
// Каждое «впитывание» частицы двигает музыку на следующее событие партитуры.
// Инструмент — вертикальное пиано Knight (сэмплы VCSL, CC0, лежат в public/wtc).
// Громкость и «выкл» — общие с sfx (тумблер в трее); «Эффекты: минимум» глушит Баха.
import {
  bgNotes,
  groupEvents,
  isOverflow,
  nextPieceIndex,
  pickSample,
  planDue,
  ringSeconds,
  WTC_BURST_CHORDS,
  WTC_GAP_MIN,
  type WtcEvent,
  type WtcNote,
  type WtcPiece,
  type WtcSample,
} from '../shared/wtc';
import { readMusicHidden } from '../shared/music';
import { sfx } from './sfx';

/** ротация: сначала c-moll (прелюдия → фуга), затем C-dur и D-dur, по кругу */
const PIECES: ReadonlyArray<{ file: string; key: 'Cm' | 'C' | 'D' }> = [
  { file: '847-prelude.json', key: 'Cm' },
  { file: '847-fugue.json', key: 'Cm' },
  { file: '846.json', key: 'C' },
  { file: '850.json', key: 'D' },
];

const BASE = '/wtc/';

class WtcPlayer {
  private pieces = new Map<string, WtcPiece>();
  private samples: WtcSample[] = [];
  private buffers = new Map<string, AudioBuffer>();
  private current = 0;
  private events: WtcEvent[] = [];
  private evIdx = 0;
  private lastAt = 0;
  private active = new Set<AudioBufferSourceNode>();
  private loading: Promise<void> | null = null;
  private enabled = true;
  private out: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  /** счётчики для живых проверок */
  readonly stats = { events: 0, notes: 0, dropped: 0, finished: 0, errors: 0, chords: 0 };
  /** жив ли экран разработки (после закрытия Баха не «играем в пустоту») */
  private sessionActive = false;
  /** фоновый ход «не выключать»: таймер и отметка времени */
  private bgTimer = 0;
  private lastBgAt = 0;

  /** начать подгрузку нот и сэмплов (зовётся при открытии экрана «Код») */
  prepare(): void {
    this.sessionActive = true;
    if (!this.loading) this.loading = this.load();
  }

  /** впитывание частицы → следующее событие партитуры */
  onAbsorb(): void {
    if (!this.enabled) return;
    // «выключать музыку в неактивной вкладке» (настройка): в фоне ноты не двигаем
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && readMusicHidden() === 'on') return;
    this.advance();
  }

  /** одно музыкальное событие вперёд (общее для впитываний и фонового хода) */
  private advance(): void {
    this.prepare();
    const ctx = sfx.audioCtx();
    if (!ctx || !this.buffers.size) return; // контекста/сэмплов ещё нет — молча ждём
    const due = planDue(this.lastAt, ctx.currentTime, WTC_GAP_MIN);
    if (isOverflow(due, ctx.currentTime)) {
      this.stats.dropped++; // очередь переполнена — нота пропускается
      return;
    }
    const ev = this.nextEvent();
    if (!ev) return;
    this.play(ev, due);
    this.lastAt = due;
    this.stats.events++;
    this.stats.notes += ev.notes.length;
  }

  /** каденция вместо мелодии для пачек очков (стартовые очки, успешное улучшение) */
  chordBurst(): void {
    if (!this.enabled) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && readMusicHidden() === 'on') return;
    this.prepare();
    const ctx = sfx.audioCtx();
    if (!ctx || !this.buffers.size) return; // сэмплов ещё нет — молча ждём
    const chords = WTC_BURST_CHORDS[PIECES[this.current]?.key ?? 'Cm'];
    if (!chords) return;
    const start = ctx.currentTime + 0.03;
    chords.forEach((chord, k) => {
      const notes = chord.map((m): WtcNote => [0, m, 3]); // ~полтакта каждая (по темпу пьесы)
      this.play({ t: 0, notes }, start + k * 0.45);
    });
    this.stats.chords++;
  }

  /** смена видимости вкладки: «выключать» — тишина; «не выключать» — музыка идёт и в фоне */
  visibilityChanged(): void {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') {
      if (readMusicHidden() === 'on' || !this.enabled) {
        this.silence();
        this.stopBg();
      } else if (this.sessionActive) {
        this.startBg();
      }
    } else {
      this.stopBg();
    }
  }

  private startBg(): void {
    if (this.bgTimer) return;
    this.lastBgAt = performance.now();
    this.bgTimer = window.setInterval(() => this.bgTick(), 900);
  }

  private stopBg(): void {
    if (this.bgTimer) {
      window.clearInterval(this.bgTimer);
      this.bgTimer = 0;
    }
  }

  private bgTick(): void {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      this.stopBg();
      return;
    }
    if (readMusicHidden() === 'on' || !this.enabled || !this.sessionActive) {
      this.stopBg();
      return;
    }
    const now = performance.now();
    const n = bgNotes(now - this.lastBgAt);
    this.lastBgAt = now;
    for (let i = 0; i < n; i++) this.advance();
  }

  /** глушение (fx = «минимум») и обратно */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.silence();
  }

  /** вкладка ушла в фон — глушим запланированное (настройка «выключать музыку в неактивной вкладке») */
  suspend(): void {
    this.silence();
  }

  /** остановить всё запланированное (закрытие окна разработки) */
  release(): void {
    this.sessionActive = false;
    this.stopBg();
    this.silence();
    this.evIdx = 0;
    this.lastAt = 0;
  }

  debugState(): { loaded: number; samples: number; piece: number; evIdx: number; events: number; enabled: boolean; chords: number } {
    return {
      loaded: this.pieces.size,
      samples: this.buffers.size,
      piece: this.current,
      evIdx: this.evIdx,
      events: this.events.length,
      enabled: this.enabled,
      chords: this.stats.chords,
    };
  }

  // ─── внутреннее ───

  private async load(): Promise<void> {
    try {
      const [pieceDocs, manifest] = await Promise.all([
        Promise.all(
          PIECES.map(async (p) => {
            const r = await fetch(BASE + p.file);
            if (!r.ok) throw new Error(String(r.status));
            return [p.file, (await r.json()) as WtcPiece] as const;
          }),
        ),
        fetch(BASE + 'knight/manifest.json').then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json() as Promise<{ samples: WtcSample[] }>;
        }),
      ]);
      for (const [file, doc] of pieceDocs) this.pieces.set(file, doc);
      this.samples = manifest.samples;
      this.setPiece(0);
      await this.decodeAll();
    } catch {
      this.stats.errors++;
    }
  }

  private async decodeAll(): Promise<void> {
    const ctx = sfx.audioCtx();
    if (!ctx) return;
    for (const s of this.samples) {
      if (this.buffers.has(s.file)) continue;
      try {
        const r = await fetch(BASE + 'knight/' + s.file);
        if (!r.ok) throw new Error(String(r.status));
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(s.file, buf);
      } catch {
        this.stats.errors++;
      }
    }
  }

  private setPiece(i: number): void {
    this.current = i;
    const doc = this.pieces.get(PIECES[i]?.file ?? '');
    this.events = doc ? groupEvents(doc.notes) : [];
    this.evIdx = 0;
  }

  private nextEvent(): WtcEvent | null {
    if (!this.events.length) return null;
    if (this.evIdx >= this.events.length) {
      this.stats.finished++;
      this.setPiece(nextPieceIndex(this.current, PIECES.length));
    }
    return this.events[this.evIdx++] ?? null;
  }

  private ensureOut(ctx: AudioContext): GainNode | null {
    if (this.out && this.reverbIn) return this.out;
    const bus = sfx.musicBus();
    if (!bus) return null;
    const out = ctx.createGain();
    out.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    comp.knee.value = 14;
    out.connect(comp);
    comp.connect(bus);
    // процедурный реверб («комната») — без файлов
    const conv = ctx.createConvolver();
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * 1.2);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    const send = ctx.createGain();
    send.gain.value = 1;
    send.connect(conv);
    conv.connect(wet);
    wet.connect(comp);
    this.out = out;
    this.reverbIn = send;
    return out;
  }

  private play(ev: WtcEvent, due: number): void {
    const ctx = sfx.audioCtx();
    if (!ctx) return;
    const out = this.ensureOut(ctx);
    if (!out) return;
    const doc = this.pieces.get(PIECES[this.current]?.file ?? '');
    const mm = doc?.mm ?? 110;
    const tpq = doc?.ticksPerQuarter ?? 4;
    for (const n of ev.notes) {
      const pick = pickSample(this.samples, n[1]);
      if (!pick) continue;
      const buf = this.buffers.get(pick.sample.file);
      if (!buf) continue;
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.playbackRate.value = pick.rate;
      const g = ctx.createGain();
      const ring = ringSeconds(n[2], mm, tpq);
      const end = due + Math.max(0.22, ring);
      g.gain.setValueAtTime(0.55, due);
      g.gain.setValueAtTime(0.55, Math.max(due, end - 0.16));
      g.gain.linearRampToValueAtTime(0.0001, end + 0.03);
      node.connect(g);
      g.connect(out);
      if (this.reverbIn) g.connect(this.reverbIn);
      node.onended = () => this.active.delete(node);
      this.active.add(node);
      node.start(due);
      node.stop(end + 0.08);
    }
  }

  private silence(): void {
    for (const node of this.active) {
      try {
        node.stop();
      } catch {
        /* уже остановлен */
      }
    }
    this.active.clear();
  }
}

export const wtc = new WtcPlayer();

// настройка «выключать музыку в неактивной вкладке»: уходя в фон — глушим всё («выключать»)
// или продолжаем спокойным ходом («не выключать»)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => wtc.visibilityChanged());
}

// удобный доступ для живых проверок в браузере
if (typeof window !== 'undefined') {
  (window as unknown as { __gdsWtc?: WtcPlayer }).__gdsWtc = wtc;
}
