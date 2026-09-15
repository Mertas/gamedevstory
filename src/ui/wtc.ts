// M5 (plan/31): Бах по нотам на экране «Код» — проигрыватель ХТК.
// Каждое «впитывание» частицы двигает музыку на следующее событие партитуры.
// Инструмент — вертикальное пиано Knight (сэмплы VCSL, CC0, лежат в public/wtc).
// Громкость и «выкл» — общие с sfx (тумблер в трее); «Эффекты: минимум» глушит Баха.
import {
  bgNotes,
  groupEvents,
  isOverflow,
  pickSample,
  planDue,
  randomPieceIndex,
  ringSeconds,
  WTC_BURST_CHORDS,
  WTC_GAP_MIN,
  WTC_LONG_CHORD,
  type WtcEvent,
  type WtcNote,
  type WtcPiece,
  type WtcSample,
} from '../shared/wtc';
import { readMusicHidden } from '../shared/music';
import { heartbeatAlive } from './heartbeat';
import { sfx } from './sfx';

/** ротация: сначала c-moll (прелюдия → фуга), затем C-dur и D-dur, по кругу */
const PIECES: ReadonlyArray<{ file: string; key: 'Cm' | 'C' | 'D' }> = [
  { file: '847-prelude.json', key: 'Cm' },
  { file: '847-fugue.json', key: 'Cm' },
  { file: '846.json', key: 'C' },
  { file: '850.json', key: 'D' },
];

const BASE = '/wtc/';

/** M5.6: пауза между пьесами (секунда тишины перед аккордом новой) */
const INTERLUDE_PAUSE = 1.0;

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
  /** пачка пришла раньше сэмплов — сыграем, как только они догрузятся */
  private pendingBurst: 'long' | 'cadence' | null = null;
  /** M5.6: мелодия ждёт до этого времени (пауза между пьесами + аккорд новой) */
  private resumeAt = 0;

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
    if (!ctx || !this.buffers.size || ctx.state !== 'running') return; // нет звука/сэмплов — молча ждём
    // M5.6: пауза и аккорд между пьесами — мелодия ждёт своего часа (впитывания молчат)
    if (this.resumeAt && ctx.currentTime < this.resumeAt) return;
    this.resumeAt = 0;
    const due = planDue(this.lastAt, ctx.currentTime, WTC_GAP_MIN);
    if (isOverflow(due, ctx.currentTime)) {
      this.stats.dropped++; // очередь переполнена — нота пропускается
      return;
    }
    const ev = this.nextEvent(); // на финале пьесы — смена и интерлюдия (вернёт null: этот вдох тишина)
    if (!ev) return;
    this.play(ev, due);
    this.lastAt = due;
    this.stats.events++;
    this.stats.notes += ev.notes.length;
  }

  /** длинный аккорд-«заставка» на старте проекта: 8–10 нот в гармонии пьесы, что зазвучит следом */
  longChord(): void {
    if (!this.enabled || !this.sessionActive) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && readMusicHidden() === 'on') return;
    this.prepare();
    const ctx = sfx.audioCtx();
    if (!ctx || !this.buffers.size || ctx.state !== 'running') {
      this.pendingBurst = 'long'; // сэмплы/звук ещё не готовы — сыграем сразу после
      return;
    }
    this.setPiece(randomPieceIndex(this.current, PIECES.length)); // M5.4: старт — со случайной пьесы
    this.playLong(ctx.currentTime + 0.04);
  }

  /** длинный аккорд текущей пьесы (due — когда играть); вернёт время конца звона */
  private playLong(due: number): number {
    const notes = WTC_LONG_CHORD[PIECES[this.current]?.key ?? 'Cm'];
    if (!notes) return due;
    const doc = this.pieces.get(PIECES[this.current]?.file ?? '');
    const ring = Math.max(0.22, ringSeconds(24, doc?.mm ?? 110, doc?.ticksPerQuarter ?? 4));
    const chord = notes.map((m): WtcNote => [0, m, 24]); // ~3.5–4.5 с — «длииинный»
    this.play({ t: 0, notes: chord }, due, 0.8); // громче мелодии — «заставка»
    this.stats.chords++;
    return due + ring;
  }

  /** M5.6: конец пьесы — секунда тишины, затем длинный аккорд новой, дальше мелодия как обычно */
  private interlude(): void {
    const ctx = sfx.audioCtx();
    if (!ctx || !this.buffers.size || ctx.state !== 'running') return;
    const end = this.playLong(ctx.currentTime + INTERLUDE_PAUSE);
    this.resumeAt = end + 0.25; // мелодия новой пьесы ждёт и паузу, и аккорд
  }

  /** каденция вместо мелодии для пачек-улучшений (успешный буст) */
  chordBurst(): void {
    if (!this.enabled || !this.sessionActive) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && readMusicHidden() === 'on') return;
    this.prepare();
    const ctx = sfx.audioCtx();
    if (!ctx || !this.buffers.size || ctx.state !== 'running') {
      this.pendingBurst = 'cadence'; // сэмплы/звук ещё не готовы — сыграем сразу после
      return;
    }
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
    if (heartbeatAlive()) return; // M5.5: жив «пульс» — ноты идут из движка, фон не дублирует
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
    this.pendingBurst = null;
    this.resumeAt = 0;
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
      this.setPiece(Math.floor(Math.random() * PIECES.length)); // M5.4: случайная пьеса на входе
      await this.decodeAll();
    } catch {
      this.stats.errors++;
    }
    // пачка, пришедшая во время загрузки сэмплов, — играем сразу, как догрузились
    const pending = this.pendingBurst;
    this.pendingBurst = null;
    if (pending === 'long') this.longChord();
    else if (pending === 'cadence') this.chordBurst();
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
      this.setPiece(randomPieceIndex(this.current, PIECES.length)); // M5.4: дальше — в случайном порядке
      this.interlude(); // M5.6: пауза и аккорд новой пьесы
      return null; // этот вдох — тишина; мелодия начнётся после аккорда
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

  private play(ev: WtcEvent, due: number, gainScale = 1): void {
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
      const peak = 0.55 * gainScale;
      g.gain.setValueAtTime(peak, due);
      g.gain.setValueAtTime(peak, Math.max(due, end - 0.16));
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
