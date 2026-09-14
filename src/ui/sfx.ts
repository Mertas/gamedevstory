// M4: синтезатор звука игры — WebAudio, без файлов.
// Пищалки Win95 (клики, окна) + капли экрана разработки. Ленивый AudioContext:
// создаётся и возобновляется по первому жесту пользователя (политика автоплея браузеров).
import { parseSoundLevel, volumeOf, type SoundLevel } from '../shared/sound';

const KEY = 'gds-sound';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private level: SoundLevel;
  private lastDropAt = 0;
  /** счётчики для живых проверок (не влияют на звук) */
  readonly stats = { clicks: 0, opens: 0, closes: 0, drops: 0 };

  constructor() {
    let raw: unknown = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      /* приватный режим — играем на дефолте */
    }
    this.level = parseSoundLevel(raw);
  }

  get soundLevel(): SoundLevel {
    return this.level;
  }

  setLevel(level: SoundLevel): void {
    this.level = level;
    try {
      localStorage.setItem(KEY, level);
    } catch {
      /* noop */
    }
    this.applyGain();
  }

  /** диагностика для живых проверок */
  debugState(): { level: SoundLevel; ctx: string; gain: number } {
    return {
      level: this.level,
      ctx: this.ctx ? this.ctx.state : 'нет',
      gain: this.master ? this.master.gain.value : -1,
    };
  }

  /** AudioContext игры (ленивый, по первому жесту) — для проигрывателя ХТК */
  audioCtx(): AudioContext | null {
    return this.ensure();
  }

  /** музыкальная шина: идёт через общий мастер — «выкл» и уровень действуют на обоих */
  musicBus(): GainNode | null {
    if (!this.on) return null;
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 1;
      this.musicGain.connect(this.master);
    }
    return this.musicGain;
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyGain();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = volumeOf(this.level);
  }

  private get on(): boolean {
    return this.level !== 'off';
  }

  /** тон с огибающей; dur — секунды */
  private tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; gain?: number; slideTo?: number; delay?: number } = {},
  ): void {
    if (!this.on) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(Math.max(30, freq), t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, opts.slideTo), t0 + dur);
    const peak = opts.gain ?? 0.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** шумовой щелчок (всплеск капли) */
  private noise(dur: number, gain: number, hz: number): void {
    if (!this.on) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hz;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
  }

  // ─── голоса ───

  /** короткий тик интерфейса (кнопки, иконки, флажки) */
  click(): void {
    this.stats.clicks++;
    this.tone(920, 0.03, { gain: 0.28 });
  }

  /** мягкий тик меню (чуть выше и тише) */
  menuTick(): void {
    this.stats.clicks++;
    this.tone(1250, 0.018, { gain: 0.16, type: 'triangle' });
  }

  /** окно открылось: восходящая пара (дух Win95) */
  openWindow(): void {
    this.stats.opens++;
    this.tone(660, 0.06, { gain: 0.3 });
    this.tone(990, 0.07, { gain: 0.24, delay: 0.055 });
  }

  /** окно закрылось: нисходящая пара */
  closeWindow(): void {
    this.stats.closes++;
    this.tone(880, 0.05, { gain: 0.26 });
    this.tone(520, 0.07, { gain: 0.22, delay: 0.05 });
  }

  /** капля экрана разработки: тише прочего, высота с разбросом, не чаще 0.28 с */
  drop(): void {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const t = performance.now();
    if (t - this.lastDropAt < 280) return;
    this.lastDropAt = t;
    this.stats.drops++;
    const f = 340 + Math.random() * 130;
    this.tone(f, 0.055, { gain: 0.16, type: 'sine', slideTo: f * 0.55 });
    this.noise(0.03, 0.05, 1600 + Math.random() * 700);
  }
}

export const sfx = new Sfx();

// удобный доступ для живых проверок в браузере
if (typeof window !== 'undefined') {
  (window as unknown as { __gdsSfx?: Sfx }).__gdsSfx = sfx;
}
