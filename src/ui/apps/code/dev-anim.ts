// M1 (plan/31_Анимация_разработки.md): canvas-движок анимации окна «Код».
// Один rAF на окно, пул частиц, стратифицированный размаз по такту, счётчики мимо React.
// Геометрия меряется один раз на такт; координаты — в системе контента (учёт скролла).
// Никаких setState на прилёт, никаких per-particle таймеров и animationend.
// Числа строго неубывающие: вниз показания опускает только setProject (партия/происшествие).
// v1.13.3 (plan/32): suspend() по visibilitychange (фоновая вкладка не копит очередь),
// сторож кадров (исключение не убивает цикл), стоп-лимиты очереди и эффектов, компакция без аллокаций.
// M2 (v1.14.0): «вода» — замах, squash по вектору, блик капли, штрихи-струи, двойная рябь,
// пружинные полоски, всплеск у источника; каркас M3 — тихий планировщик и очередь праздников.
// M3 (v1.15.0): дыхание/амбиент простоя (штриховка, кромки, автосейв-диод, микро-сценка),
// ярусы праздников T1–T4 с анти-балаганом (молния рекорда, супер-рекорд с дождём и тряской,
// вехи прогресса с флажками, фаза отладки), турбо-полировка; soak-тест — plan/32 §4.
import type { DevContrib, Stats } from '../../../core/types';
import {
  ANIM_ATTRS,
  barScaleTop,
  planWave,
  recordThreshold,
  type AnimAttr,  type FxLevel,
} from '../../../shared/dev-anim';
import { fmtInt } from '../../../shared/nums';
import { heartbeatAlive, onHeartbeat } from '../../heartbeat';

const COLORS: Record<AnimAttr, string> = {
  fun: '#000080',
  creativity: '#800080',
  graphics: '#008000',
  sound: '#808000',
};

/** M3: фаза отладки — искры темнее (тон экрана меняется). */
const DARK_COLORS: Record<AnimAttr, string> = {
  fun: '#000040',
  creativity: '#400040',
  graphics: '#004000',
  sound: '#404000',
};

/** Пул: одновременно живых частиц с запасом (бюджет волны ~48/такт, скорость ≤ 8×). */
const MAX_ALIVE = 320;
const TAIL = 3;
/** Стоп-лимит очереди (2 волны): предохранитель от непланового простоя кадров. */
const MAX_PENDING = 96;
/** Лимиты эффектов: без них на 8× живёт вдвое больше бюджета (plan/32 §1). */
const SPARK_CAP = 600;
const RIPPLE_CAP = 120;
const GHOST_CAP = 32;
/** M3-каркас: тихий планировщик — пороги простоя (сек) и каденция режимов. */
const IDLE_QUIET = 2.0;
const IDLE_ASLEEP = 4.5;
const QUIET_MS = 280;
const ASLEEP_MS = 900;
/** Пружина полоски (меморандум plan/33: stiffness ≈120, damping ≈20). */
const SPRING_K = 120;
const SPRING_C = 20;

interface Chip {
  kind: 'chip' | 'mine';
  attr: AnimAttr;
  weight: number;
  heavy: number; // 0..1 визуальный «вес» (логарифм от очков)
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  t0: number;
  life: number;
  /** M5.1: частица не зовёт onLand (музыка не двигается — стартовые очки/предложение) */
  silent?: boolean;
}

interface Pending {
  attr: AnimAttr;
  staffId: string;
  weight: number;
  heavy: number;
  launchAt: number;
  life: number;
  silent?: boolean;
}

interface Ripple {
  x: number;
  y: number;
  t: number;
  life: number;
  c: string;
  lw: number; // толщина кольца
  r0: number; // радиус на старте
  r1: number; // радиус к концу
  a0: number; // стартовая альфа
}

interface Cue {
  tier: 1 | 2 | 3 | 4;
  at: number;
  fn: () => void;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  c: string;
}

interface Ghost {
  x: number;
  y: number;
  t: number;
  life: number;
  text: string;
  gold: boolean;
  big?: boolean;
}

interface FlashRec {
  el: HTMLElement;
  until: number;
}

const zeros = (): Stats => ({ fun: 0, creativity: 0, graphics: 0, sound: 0 });
const zeroRec = (): Record<AnimAttr, number> => ({ fun: 0, creativity: 0, graphics: 0, sound: 0 });
const falses = (): Record<AnimAttr, boolean> => ({ fun: false, creativity: false, graphics: false, sound: false });
const nulls = (): Record<AnimAttr, HTMLElement | null> => ({ fun: null, creativity: null, graphics: null, sound: null });

/** Визуальный вес частицы: log10 от перевозимых очков (1 очко → 0, поток → до 1). */
const heavyOf = (w: number): number => (w > 1 ? Math.min(1, Math.log10(w + 1) / 2.2) : 0);

export class DevAnim {
  private readonly canvas: HTMLCanvasElement;
  private readonly root: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;

  private timerId = 0;
  private timerKind: 'none' | 'raf' | 'to' = 'none';
  /** M5.5: отписка от «пульса» аудио, когда он ведёт кадры в скрытой вкладке */
  private hbOff: (() => void) | null = null;
  private dead = false;
  private mode: 'active' | 'quiet' | 'asleep' = 'active';
  /** M3.8: уровень эффектов (мини/средне/полно) — тумблер «Эффекты экрана…» */
  private fx: FxLevel = 'full';
  /** M4: колбэк впитывания (звук капель вешает Dev.tsx); в «минимуме» не вызывается — частиц нет */
  onLand?: (attr: AnimAttr) => void;
  private lastWorkAt = 0;
  private last = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private font = 'Tahoma';

  // цель (истина из игры) / показано (догон) / зарезервировано (в воздухе + очередь)
  private target = zeros();
  private shown = zeros();
  private reserved = zeros();
  private rec = zeroRec();
  private top = zeros();
  private beaten = falses();

  private chips: Chip[] = [];
  private pool: Chip[] = [];
  private pending: Pending[] = [];
  private ripples: Ripple[] = [];
  private sparks: Spark[] = [];
  private ghosts: Ghost[] = [];

  private speed = 1;
  private tickSec = 1;

  // геометрия (кэш на такт)
  private srcPos = new Map<string, { x: number; y: number }>();
  private barEdge: Record<AnimAttr, { x: number; y: number }> = {
    fun: { x: 0, y: 0 }, creativity: { x: 0, y: 0 }, graphics: { x: 0, y: 0 }, sound: { x: 0, y: 0 },
  };
  private elsNum: Record<AnimAttr, HTMLElement | null> = nulls();
  private elsFill: Record<AnimAttr, HTMLElement | null> = nulls();
  private elsNotch: Record<AnimAttr, HTMLElement | null> = nulls();
  private elsWrap: Record<AnimAttr, HTMLElement | null> = nulls();

  private lastNum = { fun: -1, creativity: -1, graphics: -1, sound: -1 };
  private lastWrite = 0;
  private flashAt = zeroRec();
  private flashes: FlashRec[] = [];
  private lastGhostAt = zeroRec();
  private lastErrorAt = 0;
  // M2: пружинное показание полоски (отдельно от счётчика) и всплеск у источника
  private barVal = zeros();
  private barVel = zeros();
  private puffAt = new Map<string, number>();
  // M3-каркас: очередь праздников и подписки на ввод (пробуждение тихого режима)
  private cues: Cue[] = [];
  private cueLastAt = 0;
  private rootDisposers: Array<() => void> = [];
  // M3: ярусы T1–T4, турбо-полировка и амбиент простоя
  private lastT1At = 0;
  private lastMajorAt = 0;
  private lastMinorAt = 0;
  private majorTimes: number[] = [];
  private muteUntil = 0;
  private t2Done = false;
  private progress = 0;
  private phase = '';
  private dark = false;
  private startPulse = false;
  private bolts: Array<{ attr: AnimAttr; t: number; life: number }> = [];
  private rainUntil = 0;
  private rainNext = 0;
  private shakeStart = 0;
  private shakeUntil = 0;
  private shaking = false;
  private flagFracs: number[] = [];
  private milestoneDone = { m25: false, m50: false, m75: false, done: false };
  private progressRect: { x0: number; x1: number; y: number } | null = null;
  private barRect: Record<AnimAttr, { x0: number; x1: number; y: number } | null> = {
    fun: null, creativity: null, graphics: null, sound: null,
  };
  private lastSceneAt = -999;
  private scene: { t0: number; x: number; y0: number } | null = null;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.canvas = canvas;
    this.root = root;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d недоступен');
    this.ctx = ctx;
    this.last = performance.now() / 1000;
    this.lastWorkAt = this.last;
    this.measure();
    document.addEventListener('visibilitychange', this.onVisibility);
    // M3-каркас: любой ввод мгновенно будит тихий режим (латентность 0)
    for (const ev of ['pointerenter', 'pointerdown', 'focusin', 'keydown', 'scroll'] as const) {
      const h = () => this.wake();
      root.addEventListener(ev, h, { passive: true });
      this.rootDisposers.push(() => root.removeEventListener(ev, h));
    }
    this.scheduleNext();
    this.syncClock(); // движок мог родиться уже в скрытой вкладке
  }

  destroy(): void {
    this.dead = true;
    if (this.hbOff) {
      this.hbOff();
      this.hbOff = null;
    }
    this.cancelTimer();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const d of this.rootDisposers) d();
    this.rootDisposers = [];
    for (const f of this.flashes) f.el.classList.remove('w95-attr-flash');
    this.flashes = [];
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Смена проекта / происшествие (обвал очков): показания мгновенно выравниваются. */
  setProject(real: Stats, rec?: Partial<Record<AnimAttr, number>>): void {
    if (rec) for (const a of ANIM_ATTRS) this.rec[a] = rec[a] ?? 0;
    this.target = { ...real };
    this.shown = { ...real };
    this.reserved = zeros();
    this.pending = [];
    this.chips = [];
    this.ripples = [];
    this.sparks = [];
    this.ghosts = [];
    this.beaten = falses();
    for (const a of ANIM_ATTRS) this.elsNotch[a]?.classList.remove('beat');
    for (const a of ANIM_ATTRS) this.top[a] = barScaleTop(this.rec[a], this.shown[a]);
    this.barVal = { ...real };
    this.barVel = zeros();
    this.cues = [];
    this.t2Done = false;
    this.dark = false;
    this.phase = '';
    this.progress = 0;
    this.bolts = [];
    this.rainUntil = 0;
    this.flagFracs = [];
    this.milestoneDone = { m25: false, m50: false, m75: false, done: false };
    this.startPulse = true;
    this.lastNum = { fun: -1, creativity: -1, graphics: -1, sound: -1 };
    // мгновенный слепок в DOM (эффект до первой отрисовки — без мигания пустых полосок)
    this.drawStatic(performance.now() / 1000, 0.25);
    this.wake();
  }

  /** M3.8 (plan/31 §9.8): тумблер эффектов — применяется на лету, без перемонтирования окна. */
  setEffects(level: FxLevel): void {
    if (level === this.fx) return;
    this.fx = level;
    if (level !== 'full') {
      // гасим видимое сразу; «в воздухе» зачисляем — числа остаются честными
      for (const p of this.pending) {
        this.reserved[p.attr] -= p.weight;
        this.shown[p.attr] += p.weight;
      }
      this.pending.length = 0;
      for (const c of this.chips) this.pool.push(c);
      this.chips.length = 0;
      this.ripples.length = 0;
      this.sparks.length = 0;
      this.ghosts.length = 0;
      this.bolts.length = 0;
      this.rainUntil = 0;
      this.scene = null;
      if (this.shaking) {
        this.shaking = false;
        this.root.style.transform = '';
      }
    }
    this.wake();
  }

  /** Новый игровой день: цель из игры + вклад за день → план волны с размазом по такту. */
  setWave(
    target: Stats,
    contrib: DevContrib[],
    rec: Partial<Record<AnimAttr, number>>,
    speed: number,
    progress = 0,
    phase = '',
    silent = false,
  ): void {
    this.speed = Math.max(0.5, speed || 1);
    this.tickSec = 1 / this.speed;
    this.target = { ...target };
    for (const a of ANIM_ATTRS) this.rec[a] = rec[a] ?? 0;
    this.progress = progress;
    if (phase && phase !== this.phase) {
      this.onPhase(phase);
      this.phase = phase;
    }
    this.checkMilestones();
    // Инвариант (plan/32 §2): очередь не растёт безгранично. При переполнении — не копим,
    // а зачисляем мгновенно: числа остаются честными, память не течёт.
    if (this.pending.length >= MAX_PENDING) {
      for (const p of this.pending) {
        this.reserved[p.attr] -= p.weight;
        this.shown[p.attr] += p.weight;
      }
      this.pending = [];
    }
    this.measure();
    this.wake();

    const gaps = zeros();
    for (const a of ANIM_ATTRS) {
      gaps[a] = Math.max(0, Math.round(this.target[a]) - Math.round(this.shown[a]) - this.reserved[a]);
    }
    const wave = planWave(contrib, gaps, this.tickSec);
    const now = performance.now() / 1000;
    for (const p of wave) {
      this.reserved[p.attr] += p.weight;
      this.pending.push({
        attr: p.attr,
        staffId: p.staffId,
        weight: p.weight,
        heavy: heavyOf(p.weight),
        launchAt: now + p.delay,
        life: this.flightLife(),
        silent,
      });
    }
  }

  /** Мины багов: от первого сотрудника к счётчику «Баги» (1 мина = 1 баг). */
  spawnMines(n: number): void {
    this.wake();
    if (this.fx === 'min') return; // «минимум»: мины не летят (счётчик багов ведёт React)
    const root = this.root;
    const fromEl = root.querySelector<HTMLElement>('[data-staff-id]');
    const toEl = root.querySelector<HTMLElement>('[data-bugs]');
    if (!fromEl || !toEl) return;
    const rr = root.getBoundingClientRect();
    const sx = root.scrollLeft;
    const sy = root.scrollTop;
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const startX = fr.right - rr.left + sx + 4;
    const startY = fr.top - rr.top + sy + fr.height / 2;
    const targetX = tr.left - rr.left + sx + 2;
    const targetY = tr.top - rr.top + sy + tr.height / 2;
    const now = performance.now() / 1000;
    const step = Math.max(3, Math.min(13, 70 / Math.max(1, n)));
    for (let k = 0; k < n; k++) {
      if (this.chips.length >= MAX_ALIVE) break;
      const chip = this.pool.pop() ?? ({} as Chip);
      chip.kind = 'mine';
      chip.attr = 'fun';
      chip.weight = 0;
      chip.heavy = 0;
      chip.x0 = startX + k * step;
      chip.y0 = startY;
      chip.x1 = targetX;
      chip.y1 = targetY;
      chip.cx1 = chip.x0 + (targetX - chip.x0) * 0.3;
      chip.cy1 = startY - 30 - Math.random() * 20;
      chip.cx2 = targetX - 30;
      chip.cy2 = targetY - 16;
      chip.t0 = now + k * 0.1 + Math.random() * 0.04;
      chip.life = 0.85;
      this.chips.push(chip);
    }
  }

  // ─── внутреннее ───

  private flightLife(): number {
    const base = 0.78 + Math.random() * 0.14;
    const k = Math.min(1.25, Math.max(0.45, 1 / Math.pow(this.speed, 0.35)));
    return base * k;
  }

  /** Замер геометрии на такт: размер канваса, источники (сотрудники), цели (кромки баров). */
  private measure(): void {
    const root = this.root;
    const w = root.clientWidth;
    const h = Math.max(root.clientHeight, root.scrollHeight);
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.font = getComputedStyle(root).fontFamily || 'Tahoma';
    const rr = root.getBoundingClientRect();
    const sx = root.scrollLeft;
    const sy = root.scrollTop;
    this.srcPos.clear();
    for (const el of root.querySelectorAll<HTMLElement>('[data-staff-id]')) {
      const id = el.dataset.staffId;
      if (!id) continue;
      const r = el.getBoundingClientRect();
      this.srcPos.set(id, { x: r.right - rr.left + sx + 4, y: r.top - rr.top + sy + r.height / 2 });
    }
    for (const a of ANIM_ATTRS) {
      const bar = root.querySelector<HTMLElement>(`[data-attr="${a}"] .dev-bar`);
      const fill = bar?.querySelector<HTMLElement>(':scope > div') ?? null;
      const r = (fill ?? bar)?.getBoundingClientRect();
      if (r) {
        this.barEdge[a] = {
          x: r.right - rr.left + sx - (r.width >= 14 ? 12 : 0),
          y: r.top - rr.top + sy + r.height / 2,
        };
      }
      this.elsNum[a] = root.querySelector<HTMLElement>(`[data-attr="${a}"] .dev-num`);
      this.elsFill[a] = fill;
      this.elsNotch[a] = root.querySelector<HTMLElement>(`[data-attr="${a}"] .dev-notch`);
      this.elsWrap[a] = root.querySelector<HTMLElement>(`[data-attr="${a}"]`);
      if (bar) {
        const br = bar.getBoundingClientRect();
        this.barRect[a] = {
          x0: br.left - rr.left + sx,
          x1: br.right - rr.left + sx,
          y: br.top - rr.top + sy + br.height / 2,
        };
      }
    }
    const pr = root.querySelector<HTMLElement>('[data-dev-progress]');
    if (pr) {
      const r = pr.getBoundingClientRect();
      this.progressRect = { x0: r.left - rr.left + sx, x1: r.right - rr.left + sx, y: r.top - rr.top + sy + r.height / 2 };
    }
  }

  private bez(c: Chip, t: number): [number, number] {
    const u = 1 - t;
    const x = u * u * u * c.x0 + 3 * u * u * t * c.cx1 + 3 * u * t * t * c.cx2 + t * t * t * c.x1;
    const y = u * u * u * c.y0 + 3 * u * u * t * c.cy1 + 3 * u * t * t * c.cy2 + t * t * t * c.y1;
    return [x, y];
  }

  private launch(p: Pending, now: number): void {
    const from = this.srcPos.get(p.staffId);
    const to = this.barEdge[p.attr];
    if (!from || !this.w || this.chips.length >= MAX_ALIVE || this.fx === 'min') {
      // источника нет / перегруз / режим «минимум»: зачисляем мгновенно — счётчик честный
      this.reserved[p.attr] -= p.weight;
      this.shown[p.attr] += p.weight;
      // «минимум»: частиц нет, но рекорд всё равно отмечаем засечкой (статичная метка)
      if (this.fx === 'min' && !this.beaten[p.attr] && this.shown[p.attr] > recordThreshold(this.rec[p.attr])) {
        this.beaten[p.attr] = true;
        this.elsNotch[p.attr]?.classList.add('beat');
      }
      return;
    }
    const chip = this.pool.pop() ?? ({} as Chip);
    chip.kind = 'chip';
    chip.attr = p.attr;
    chip.weight = p.weight;
    chip.heavy = p.heavy;
    chip.life = p.life;
    chip.x0 = from.x;
    chip.y0 = from.y;
    chip.x1 = to.x;
    chip.y1 = to.y;
    chip.cx1 = from.x + (to.x - from.x) * 0.28;
    chip.cy1 = from.y - 46 - Math.random() * 36;
    chip.cx2 = to.x - 44 - Math.random() * 26;
    chip.cy2 = to.y - 24 - Math.random() * 12;
    chip.t0 = now + Math.random() * 0.02;
    chip.silent = p.silent;
    this.chips.push(chip);
    // M2: всплеск у источника — «капля отрывается» (не чаще 0.18 с на сотрудника)
    const lastPuff = this.puffAt.get(p.staffId) ?? 0;
    if (now - lastPuff > 0.18) {
      this.puffAt.set(p.staffId, now);
      this.ripples.push({ x: from.x, y: from.y, t: 0, life: 0.26, c: '#ffffff', lw: 1, r0: 1, r1: 9, a0: 0.5 });
    }
  }

  private land(c: Chip, now: number): void {
    this.reserved[c.attr] -= c.weight;
    this.pool.push(c);
    if (c.kind === 'mine') {
      this.flashEl(this.root.querySelector<HTMLElement>('[data-bugs]'), now);
      return;
    }
    this.shown[c.attr] += c.weight;
    if (!c.silent) this.onLand?.(c.attr); // M5.1: стартовые очки не играют нот
    const [x, y] = this.bez(c, 1);
    if (this.ripples.length < RIPPLE_CAP) {
      // M2: двойная рябь — быстрая яркая + медленная мягкая («средне» — только быстрая)
      this.ripples.push({ x, y, t: 0, life: 0.32, c: COLORS[c.attr], lw: 1, r0: 1.5, r1: 30, a0: 0.7 });
      if (this.fx === 'full') {
        this.ripples.push({ x, y, t: 0, life: 0.62, c: COLORS[c.attr], lw: 1.5, r0: 2, r1: 52, a0: c.heavy > 0.5 ? 0.55 : 0.38 });
      }
    }
    const n = this.fx === 'mid' ? 2 : c.heavy > 0.5 ? 7 : 4;
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= SPARK_CAP) break;
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const sp = 28 + Math.random() * 74;
      this.sparks.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * 0.9,
        t: 0,
        life: 0.22 + Math.random() * 0.2,
        c: Math.random() < 0.25 ? '#ffffff' : this.dark && Math.random() < 0.4 ? DARK_COLORS[c.attr] : COLORS[c.attr],
      });
    }
    // «+N»: не больше одного на направление за такт (иначе на 8× — 211 fillText/кадр)
    if (c.weight > 20 && this.ghosts.length < GHOST_CAP && now - this.lastGhostAt[c.attr] >= this.tickSec * 0.9) {
      this.lastGhostAt[c.attr] = now;
      this.ghosts.push({ x, y, t: 0, life: 0.55, text: `+${c.weight}`, gold: false });
    }
    if (now - this.flashAt[c.attr] > 0.45) {
      this.flashAt[c.attr] = now;
      this.flashEl(this.elsWrap[c.attr], now);
    }
    // решение босса: при превышении рекорда студии — празднование. Через очередь M3-каркаса:
    // тиры не накладываются, событие не стартует поверх волны (полные правила — в M3).
    if (!this.beaten[c.attr] && this.shown[c.attr] > recordThreshold(this.rec[c.attr])) {
      this.beaten[c.attr] = true;
      const gx = x;
      const gy = y - 6;
      const attr = c.attr;
      this.enqueue(1, () => {
        if (this.ghosts.length < GHOST_CAP) {
          this.ghosts.push({ x: gx, y: gy, t: 0, life: this.celebLife(1.15), text: 'РЕКОРД!', gold: true });
        }
        this.elsNotch[attr]?.classList.add('beat');
        // молния по полоске + толчок бара пружиной (+4%, пружина вернёт) — только «полно»
        if (this.fx === 'full') {
          this.bolts.push({ attr, t: 0, life: this.celebLife(0.5) });
          this.barVel[attr] += this.top[attr] * 0.04 * 11;
        }
      });
      // T2: все четыре рекорда взяты — супер-праздник (один раз за партию)
      if (!this.t2Done && ANIM_ATTRS.every((k) => this.beaten[k])) {
        this.t2Done = true;
        this.enqueue(2, () => this.playSuper(performance.now() / 1000));
      }
    }
    // T4: старт разработки — первое впитывание с «ударом» (широкая белая рябь)
    if (this.startPulse) {
      this.startPulse = false;
      if (this.ripples.length < RIPPLE_CAP) {
        this.ripples.push({ x, y, t: 0, life: 0.7, c: '#ffffff', lw: 1.5, r0: 2, r1: 64, a0: 0.5 });
      }
    }
  }

  private flashEl(el: HTMLElement | null, now: number): void {
    if (!el) return;
    el.classList.remove('w95-attr-flash');
    void el.offsetWidth; // рестарт CSS-анимации
    el.classList.add('w95-attr-flash');
    const prev = this.flashes.find((f) => f.el === el);
    if (prev) prev.until = now + 0.55;
    else this.flashes.push({ el, until: now + 0.55 });
  }

  private sweepFlashes(now: number): void {
    if (!this.flashes.length) return;
    this.flashes = this.flashes.filter((f) => {
      if (now >= f.until) {
        f.el.classList.remove('w95-attr-flash');
        return false;
      }
      return true;
    });
  }

  /** M3: амбиент простоя — дыхание кромок, флажки вех, диод автосейва, редкая сценка. */
  private drawAmbient(now: number): void {
    if (this.fx === 'min') return;
    const ctx = this.ctx;
    // «полно»: дыхание кромок и диод; «средне»: только флажки вех (статичная польза)
    if (this.fx === 'full') {
      let i = 0;
      for (const a of ANIM_ATTRS) {
        const r = this.barRect[a];
        if (r) {
          const pct = Math.max(0, Math.min(1, this.barVal[a] / Math.max(1, this.top[a])));
          const edge = r.x0 + (r.x1 - r.x0) * pct;
          const phase = now * (Math.PI * 2 / 5.5) + i * 1.7;
          ctx.globalAlpha = 0.1 + 0.05 * Math.sin(phase);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(edge + Math.sin(phase) * 0.5), Math.round(r.y - 6), 1, 11);
          ctx.globalAlpha = 1;
        }
        i++;
      }
    }
    if (this.progressRect) {
      const pr = this.progressRect;
      for (const fr of this.flagFracs) {
        const x = Math.round(pr.x0 + (pr.x1 - pr.x0) * fr);
        ctx.fillStyle = fr >= 1 ? '#b8860b' : '#000080';
        ctx.fillRect(x, Math.round(pr.y - 9), 1, 8);
        ctx.fillRect(x + 1, Math.round(pr.y - 9), 4, 3);
      }
    }
    if (this.fx === 'full') {
      // диод автосейва: короткий тик раз в 2 с
      ctx.globalAlpha = now % 2 < 0.9 ? 0.45 : 0;
      ctx.fillStyle = '#000080';
      ctx.fillRect(this.w - 6, this.h - 6, 1, 1);
      ctx.globalAlpha = 1;
      this.drawSceneField(now);
    }
  }

  /** M3: микро-сценка простоя — не чаще 1 раза в ~2.5 мин, только в тихом режиме. */
  private drawSceneField(now: number): void {
    if (!this.scene && this.mode !== 'active' && this.w > 0 && now - this.lastWorkAt > 15 && now - this.lastSceneAt > 150) {
      this.scene = { t0: now, x: this.w - 74, y0: this.h - 30 };
      this.lastSceneAt = now;
    }
    const sc = this.scene;
    if (!sc) return;
    const t = now - sc.t0;
    if (t > 4.6) {
      this.scene = null;
      return;
    }
    const ctx = this.ctx;
    const { x, y0 } = sc;
    // труба (пиксельная)
    ctx.fillStyle = '#808080';
    ctx.fillRect(x + 18, y0 - 16, 3, 12);
    ctx.fillRect(x + 18, y0 - 16, 14, 3);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x + 18, y0 - 16, 3, 1);
    // капля: набухает → падает → всплеск
    if (t < 0.35) {
      const dh = Math.max(1, Math.round(3 * Math.min(1, t / 0.3)));
      ctx.fillStyle = '#000080';
      ctx.fillRect(x + 17, y0 - 4 + (3 - dh), 3, dh);
    } else if (t < 0.62) {
      const dy = Math.round(((t - 0.35) / 0.27) * 10);
      ctx.fillStyle = '#000080';
      ctx.fillRect(x + 17, y0 - 4 + dy, 3, 3);
    } else if (t < 0.85) {
      const sp = (t - 0.62) / 0.23;
      ctx.globalAlpha = 1 - sp;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 18, y0 + 6, 1 + sp * 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // лужа с бликом
    ctx.fillStyle = '#000080';
    ctx.fillRect(x + 10, y0 + 7, 16, 2);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(x + 12, y0 + 6, 5, 1);
  }

  /** Полоски и цифры: бары — каждый кадр, цифры — троттлинг 15 Гц, всё мимо React. */
  private drawStatic(now: number, dt: number): void {
    for (const a of ANIM_ATTRS) {
      const topTarget = barScaleTop(this.rec[a], this.shown[a]);
      this.top[a] += (topTarget - this.top[a]) * Math.min(1, dt / 0.22);
      if (Math.abs(topTarget - this.top[a]) < 0.5) this.top[a] = topTarget;
      // M2: пружина — полоска доезжает с лёгким перелётом (stiffness 120, damping 20)
      const targetVal = this.shown[a];
      const sdt = Math.min(dt, 0.05);
      this.barVel[a] += (SPRING_K * (targetVal - this.barVal[a]) - SPRING_C * this.barVel[a]) * sdt;
      this.barVal[a] += this.barVel[a] * sdt;
      if (Math.abs(targetVal - this.barVal[a]) < 0.3 && Math.abs(this.barVel[a]) < 2) {
        this.barVal[a] = targetVal;
        this.barVel[a] = 0;
      }
      const fill = this.elsFill[a];
      if (fill) {
        const pct = Math.max(0, Math.min(100, (this.barVal[a] / Math.max(1, this.top[a])) * 100));
        const w = `${pct.toFixed(2)}%`;
        if (fill.style.width !== w) fill.style.width = w;
      }
      const notch = this.elsNotch[a];
      if (notch) {
        const th = recordThreshold(this.rec[a]);
        const np = Math.max(0, Math.min(100, (th / Math.max(1, this.top[a])) * 100));
        const l = `${np.toFixed(2)}%`;
        if (notch.style.left !== l) notch.style.left = l;
      }
    }
    if (now - this.lastWrite >= 0.06) {
      this.lastWrite = now;
      for (const a of ANIM_ATTRS) {
        // страховка монотонности: показанное число не уменьшается (сброс — только setProject)
        const v = Math.max(Math.round(this.shown[a]), this.lastNum[a]);
        if (v !== this.lastNum[a]) {
          this.lastNum[a] = v;
          const el = this.elsNum[a];
          if (el) el.textContent = fmtInt(v);
        }
      }
    }
  }

  private drawShape(attr: AnimAttr, x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS[attr];
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    if (attr === 'fun') {
      ctx.rect(x - r, y - r, r * 2, r * 2);
    } else if (attr === 'creativity') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
    } else if (attr === 'graphics') {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    } else {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    }
    ctx.fill();
    if (r > 2.2) ctx.stroke();
  }

  private drawMine(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
      ctx.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95);
    }
    ctx.stroke();
    ctx.fillStyle = '#1c1c1c';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath();
    ctx.arc(x - r * 0.22, y - r * 0.26, r * 0.21, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawChip(c: Chip, t: number): void {
    const ctx = this.ctx;
    const col = COLORS[c.attr];
    // M2: замах — в первые 8% жизни точка чуть оттянута назад (вылет «с замахом»)
    const te = t < 0.08 ? t - (0.08 - t) * 0.4 : t;
    const [x, y] = this.bez(c, Math.max(0, te));
    const fade = t < 0.1 ? t / 0.1 : t > 0.92 ? Math.max(0, (1 - t) / 0.08) : 1;

    // направление и скорость — по производной кривой (squash и штрихи)
    const d1 = Math.min(1, te + 0.02);
    const d0 = Math.max(0, te - 0.02);
    const [xa, ya] = this.bez(c, d1);
    const [xb, yb] = this.bez(c, d0);
    const ang = Math.atan2(ya - yb, xa - xb);
    const speed = Math.hypot(xa - xb, ya - yb) / 0.04;

    // след: дискретные призраки (на 4×+ короче — 2 вместо 3)
    const tails = this.fx === 'full' ? (this.speed >= 4 ? 2 : TAIL) : 1;
    for (let i = tails; i >= 1; i--) {
      const [tx, ty] = this.bez(c, Math.max(0, te - i * 0.05));
      const rr = Math.max(0.6, (2.0 + c.heavy * 2.4) * (1 - i * 0.14));
      ctx.globalAlpha = 0.1 * ((tails - i + 1) / tails) * (1 - t * 0.35) * fade;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(tx, ty, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    // M2: тяжёлым — ещё и штрих-струя вдоль вектора
    if (c.heavy > 0.5) {
      const [sx, sy] = this.bez(c, Math.max(0, te - 0.09));
      ctx.globalAlpha = 0.16 * c.heavy * fade;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5 + c.heavy;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    const R = c.kind === 'mine' ? 6.2 : c.heavy > 0 ? 2.6 + c.heavy * 2.8 : 3.1;
    if (c.heavy > 0.35) {
      // «люминофор»: лёгкое свечение тяжёлых частиц (внутри окна, хром не трогаем)
      ctx.globalAlpha = 0.16 * c.heavy * fade;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, R + 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // M2: squash & stretch вдоль вектора скорости (капля вытягивается по движению)
    const stretch = 1 + Math.min(0.22, speed / 2600) + c.heavy * 0.1;
    const squash = 1 / Math.sqrt(stretch);
    ctx.globalAlpha = fade;
    if (c.kind === 'mine') {
      this.drawMine(x, y, R);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.scale(stretch, squash);
      this.drawShape(c.attr, 0, 0, R);
      if (R > 2) {
        // блик капли (спекуляр) — «вода»
        ctx.globalAlpha = 0.75 * fade;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-R * 0.32, -R * 0.36, Math.max(0.7, R * 0.26), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ─── M3-каркас: тихий планировщик (active → quiet → asleep) ───

  private cancelTimer(): void {
    if (this.timerKind === 'raf') cancelAnimationFrame(this.timerId);
    else if (this.timerKind === 'to') clearTimeout(this.timerId);
    this.timerKind = 'none';
    this.timerId = 0;
  }

  /** Единственный владелец цикла: rAF в active, setTimeout в quiet/asleep. */
  private scheduleNext(): void {
    if (this.dead || this.timerKind !== 'none') return;
    if (this.mode === 'active') {
      this.timerKind = 'raf';
      this.timerId = requestAnimationFrame(this.frame);
    } else {
      this.timerKind = 'to';
      this.timerId = window.setTimeout(this.timeoutFrame, this.mode === 'quiet' ? QUIET_MS : ASLEEP_MS);
    }
  }

  private timeoutFrame = (): void => {
    this.timerKind = 'none';
    this.timerId = 0;
    this.frame(performance.now());
  };

  /** Пробуждение: событие важнее экономии — мгновенный переход в active. */
  private wake(): void {
    this.lastWorkAt = performance.now() / 1000;
    this.mode = 'active';
    if (this.timerKind === 'to') this.cancelTimer();
    this.scheduleNext();
  }

  /** Есть ли работа (plan/32 §3.2). */
  private hasWork(): boolean {
    if (this.pending.length || this.chips.length || this.ripples.length || this.sparks.length || this.ghosts.length) {
      return true;
    }
    if (this.flashes.length || this.cues.length || this.bolts.length || this.shaking) return true;
    if (performance.now() / 1000 < this.rainUntil) return true;
    for (const a of ANIM_ATTRS) {
      if (Math.abs(this.top[a] - barScaleTop(this.rec[a], this.shown[a])) >= 0.5) return true;
      if (Math.abs(Math.round(this.shown[a]) - this.lastNum[a]) >= 1) return true;
      if (Math.abs(this.barVal[a] - this.shown[a]) >= 0.15) return true;
    }
    return false;
  }

  /** M3: очередь праздников — тиры, приоритеты и анти-балаган (plan/31 §9.5). */
  private enqueue(tier: Cue['tier'], fn: () => void): void {
    const now = performance.now() / 1000;
    if (this.cues.length >= 6) return;
    if (tier === 2) {
      this.majorTimes = this.majorTimes.filter((t) => now - t < 3600);
      if (this.majorTimes.length >= 6) return; // ≤6 крупных событий за час
    }
    this.cues.push({ tier, fn, at: now });
  }

  /** M3: длительность праздника с учётом скорости (не ниже 250–300 мс — порог читаемости). */
  private celebLife(base: number): number {
    const k = this.speed >= 6 ? 0.35 : this.speed >= 3 ? 0.6 : 1;
    return Math.max(0.26, base * k);
  }

  /** M3, T4: смена фазы проекта — вход в отладку меняет тон экрана. */
  private onPhase(p: string): void {
    if (p === 'debug') {
      this.dark = true;
      if (this.fx === 'min') return; // «минимум»: тон темнеет, но без метки-вспышки
      const x = this.progressRect ? (this.progressRect.x0 + this.progressRect.x1) / 2 : this.w / 2;
      const y = this.progressRect ? this.progressRect.y : 40;
      this.enqueue(4, () => {
        if (this.ghosts.length < GHOST_CAP) {
          this.ghosts.push({ x, y: y - 10, t: 0, life: this.celebLife(1.0), text: 'ОТЛАДКА', gold: false });
        }
      });
    }
  }

  /** M3, T3: вехи прогресса 25/50/75/100 — флажки навсегда + вспышки. */
  private checkMilestones(): void {
    const p = this.progress;
    const m = this.milestoneDone;
    const add = (fr: number) => {
      this.flagFracs.push(fr);
      if (this.fx === 'min') return; // «минимум»: флажок копится, но без вспышек и пульса
      const x = this.progressRect ? this.progressRect.x0 + (this.progressRect.x1 - this.progressRect.x0) * fr : this.w / 2;
      const y = this.progressRect ? this.progressRect.y - 10 : 40;
      this.enqueue(3, () => {
        if (this.ghosts.length < GHOST_CAP) {
          this.ghosts.push({ x, y, t: 0, life: this.celebLife(0.9), text: `${Math.round(fr * 100)}%`, gold: fr >= 1 });
        }
        if (fr >= 1) {
          // пульс кнопки релиза — взгляд к следующему действию
          this.flashEl(this.root.querySelector<HTMLElement>('[data-autopilot="release"]'), performance.now() / 1000);
        }
      });
    };
    if (!m.m25 && p >= 0.25) { m.m25 = true; add(0.25); }
    if (!m.m50 && p >= 0.5) { m.m50 = true; add(0.5); }
    if (!m.m75 && p >= 0.75) { m.m75 = true; add(0.75); }
    if (!m.done && p >= 1) { m.done = true; add(1); }
  }

  /** M3, T2: «все четыре рекорда» — золотой дождь, штамп и лёгкая тряска контента. */
  private playSuper(now: number): void {
    if (this.fx === 'full') {
      this.rainUntil = now + this.celebLife(1.6);
      this.rainNext = now;
      this.shakeStart = now;
      this.shakeUntil = now + 0.3;
      this.shaking = true;
    }
    const x0 = Math.min(...ANIM_ATTRS.map((a) => this.barRect[a]?.x0 ?? this.w));
    const x1 = Math.max(...ANIM_ATTRS.map((a) => this.barRect[a]?.x1 ?? 0));
    const y = this.barRect.fun ? this.barRect.fun.y : 80;
    if (this.ghosts.length < GHOST_CAP) {
      this.ghosts.push({
        x: (x0 + x1) / 2,
        y: y - 14,
        t: 0,
        life: this.celebLife(2.0),
        text: 'СУПЕР-РЕКОРД СТУДИИ',
        gold: true,
        big: true,
      });
    }
  }

  /** Сброс незавершённой работы без зачисления: очередь/частицы/вспышки; числа догонят сами. */
  private dropWork(): void {
    if (this.pending.length) {
      for (const p of this.pending) this.reserved[p.attr] -= p.weight;
      this.pending = [];
    }
    if (this.chips.length) {
      for (const c of this.chips) this.reserved[c.attr] -= c.weight;
      this.chips = [];
    }
    if (this.flashes.length) {
      for (const f of this.flashes) f.el.classList.remove('w95-attr-flash');
      this.flashes = [];
    }
  }

  /**
   * v1.13.3 (plan/32 §2): вкладка ушла в фон — JS-слушатели работают, а rAF-кадров нет;
   * без этой паузы очередь копила бы ~155 МБ за час на 8×. Возврат — замер и нулевая дельта.
   */
  private onVisibility = (): void => {
    if (this.dead) return;
    this.syncClock();
    if (document.hidden && !this.hbOff) {
      this.dropWork();
      this.last = performance.now() / 1000;
    } else {
      this.last = performance.now() / 1000;
      this.measure();
      this.wake();
    }
  };

  /**
   * M5.5: в скрытой вкладке rAF молчит — кадры водит «пульс» аудио-потока (не троттлится).
   * Пока пульс жив, движок живёт в фоне как в активной вкладке: волны, впитывания, ноты.
   * Нет пульса (звук не разбужен) — прежний покой и мгновенный догон при возврате.
   */
  private syncClock(): void {
    const hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
    if (hidden && heartbeatAlive()) {
      if (!this.hbOff) {
        this.cancelTimer();
        this.hbOff = onHeartbeat(() => this.frame(performance.now()));
      }
    } else if (this.hbOff) {
      this.hbOff();
      this.hbOff = null;
      this.wake();
    }
  }

  /** Кадр: сторож (plan/32 §1) — исключение внутри не убивает анимацию, цикл продолжается. */
  private frame = (ms: number): void => {
    this.timerKind = 'none';
    this.timerId = 0;
    if (this.dead) return;
    try {
      this.tick(ms);
    } catch (e) {
      const now = performance.now() / 1000;
      if (now - this.lastErrorAt > 5) {
        this.lastErrorAt = now;
        console.error('[gds] dev-anim: кадр упал — цикл продолжается', e);
      }
    } finally {
      this.scheduleNext();
    }
  };

  /** Тело кадра: симуляция и отрисовка. Без аллокаций на кадр (компакция массивов на месте). */
  private tick(ms: number): void {
    const ctx = this.ctx;
    const now = ms / 1000;
    const dtRaw = Math.min(5, Math.max(0, now - this.last));
    let dt = dtRaw;
    if (dt > 0.05) dt = 0.05;
    this.last = now;

    const tabHidden = document.hidden;
    const winHidden = this.root.offsetParent === null || this.root.clientWidth === 0 || this.w === 0;
    // M5.5: в фоне с живым «пульсом» движок продолжает работу (волны, впитывания, ноты),
    // как в активной вкладке; без пульса или с закрытым окном — прежний покой с догоном
    if ((tabHidden || winHidden) && !(tabHidden && this.hbOff)) {
      // окно скрыто/свёрнуто/вкладка в фоне: не рисуем и не копим; показания быстро догоняют
      // цель, волна сбрасывается — никаких «выстрелов» пачками при возврате
      this.dropWork();
      for (const a of ANIM_ATTRS) {
        // решение босса: числа строго неубывающие внутри партии — догон только вверх,
        // вниз показания опускает лишь явный setProject (смена партии / происшествие)
        if (this.target[a] > this.shown[a]) {
          this.shown[a] += (this.target[a] - this.shown[a]) * Math.min(1, dtRaw / 0.25);
          if (this.target[a] - this.shown[a] < 0.5) this.shown[a] = this.target[a];
        }
      }
      this.drawStatic(now, dtRaw);
      this.sweepFlashes(now);
      if (this.hasWork()) {
        this.lastWorkAt = now;
      } else if (this.mode === 'active' && now - this.lastWorkAt > IDLE_QUIET) {
        this.mode = 'quiet';
      } else if (this.mode === 'quiet' && now - this.lastWorkAt > IDLE_ASLEEP) {
        this.mode = 'asleep';
      }
      return;
    }

    // 1) запуск запланированных частиц (размаз по такту) — компакция на месте
    if (this.pending.length) {
      let wp = 0;
      for (let i = 0; i < this.pending.length; i++) {
        const p = this.pending[i]!;
        if (p.launchAt <= now) this.launch(p, now);
        else this.pending[wp++] = p;
      }
      this.pending.length = wp;
    }

    // 2) симуляция и отрисовка
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    let wc = 0;
    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i]!;
      const t = (now - c.t0) / c.life;
      if (t >= 1) {
        this.land(c, now);
        continue;
      }
      if (t >= 0) this.drawChip(c, t);
      this.chips[wc++] = c;
    }
    this.chips.length = wc;

    // 3) эффекты: рябь, искры, призраки чисел — обновление и отрисовка одним проходом
    let wr = 0;
    for (let i = 0; i < this.ripples.length; i++) {
      const rp = this.ripples[i]!;
      rp.t += dt;
      const a = 1 - rp.t / rp.life;
      if (a <= 0) continue;
      ctx.globalAlpha = a * rp.a0;
      ctx.strokeStyle = rp.c;
      ctx.lineWidth = rp.lw;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r0 + (rp.r1 - rp.r0) * Math.min(1, rp.t / rp.life), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      this.ripples[wr++] = rp;
    }
    this.ripples.length = wr;

    let ws = 0;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i]!;
      s.t += dt;
      if (s.t >= s.life) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 140 * dt;
      ctx.globalAlpha = 1 - s.t / s.life;
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2);
      ctx.globalAlpha = 1;
      this.sparks[ws++] = s;
    }
    this.sparks.length = ws;

    let wg = 0;
    let fontSet = '';
    for (let i = 0; i < this.ghosts.length; i++) {
      const g = this.ghosts[i]!;
      g.t += dt;
      if (g.t >= g.life) continue;
      const f = `bold ${g.big ? 13 : g.gold ? 12 : 11}px ${this.font}`;
      if (f !== fontSet) {
        ctx.font = f;
        fontSet = f;
      }
      ctx.globalAlpha = Math.min(1, (1 - g.t / g.life) * 2);
      ctx.fillStyle = g.gold ? '#b8860b' : '#303030';
      ctx.fillText(g.text, g.x - 10, g.y - 6 - g.t * 26);
      ctx.globalAlpha = 1;
      this.ghosts[wg++] = g;
    }
    this.ghosts.length = wg;

    // 3.5) M3: молнии рекордов, золотой дождь супер-рекорда, тряска контента, амбиент простоя
    let wb = 0;
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i]!;
      b.t += dt;
      if (b.t >= b.life) continue;
      const r = this.barRect[b.attr];
      if (r) {
        const p = b.t / b.life;
        const bx = r.x0 + (r.x1 - r.x0) * p;
        ctx.globalAlpha = 0.8 * (1 - p * 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(bx), Math.round(r.y - 7), 5, 13);
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(Math.round(bx + 2), Math.round(r.y - 7), 1, 13);
        ctx.globalAlpha = 1;
      }
      this.bolts[wb++] = b;
    }
    this.bolts.length = wb;
    if (this.shaking && now >= this.shakeUntil) {
      this.shaking = false;
      this.root.style.transform = '';
    }
    if (this.shaking) {
      const p = now - this.shakeStart;
      this.root.style.transform = `translateY(${Math.sin(p * 90) < 0 ? -1 : 1}px)`;
    }
    if (now < this.rainUntil && now >= this.rainNext && this.sparks.length < SPARK_CAP) {
      this.rainNext = now + 0.05;
      const x0 = Math.min(...ANIM_ATTRS.map((a) => this.barRect[a]?.x0 ?? this.w));
      const x1 = Math.max(...ANIM_ATTRS.map((a) => this.barRect[a]?.x1 ?? 0));
      const y = this.barRect.fun ? this.barRect.fun.y : 80;
      for (let k = 0; k < 3; k++) {
        this.sparks.push({
          x: x0 + Math.random() * Math.max(1, x1 - x0),
          y: y - 20 - Math.random() * 24,
          vx: (Math.random() - 0.5) * 16,
          vy: 30 + Math.random() * 60,
          t: 0,
          life: 0.5 + Math.random() * 0.4,
          c: Math.random() < 0.3 ? '#ffffff' : Math.random() < 0.6 ? '#ffd700' : '#b8860b',
        });
      }
    }
    this.drawAmbient(now);

    // 4) очередь праздников (M3): приоритет по ярусу, анти-балаган, не поверх волны
    if (this.cues.length && now - this.cueLastAt >= 0.25) {
      this.cues.sort((a, b) => b.tier - a.tier);
      for (let i = 0; i < this.cues.length; i++) {
        const c = this.cues[i]!;
        if (this.chips.length !== 0 && now - c.at < 0.25) continue; // ждём конца волны (≤0.25 с)
        if (c.tier === 1 && (now - this.lastT1At < 8 || now < this.muteUntil)) continue;
        if (c.tier === 3 && now < this.muteUntil) continue;
        if (c.tier === 2 && now - this.lastMajorAt < 60) continue;
        if ((c.tier === 3 || c.tier === 4) && now - this.lastMinorAt < 3) continue;
        this.cueLastAt = now;
        if (c.tier === 1) this.lastT1At = now;
        if (c.tier === 2) {
          this.lastMajorAt = now;
          this.majorTimes.push(now);
          this.muteUntil = now + 20;
        }
        if (c.tier === 3 || c.tier === 4) this.lastMinorAt = now;
        this.cues.splice(i, 1);
        c.fn();
        break;
      }
    }

    // 5) полоски и цифры
    this.drawStatic(now, dtRaw);
    this.sweepFlashes(now);

    // M3-каркас: тихий режим — нет работы → ступень вниз; любая работа освежает таймер
    if (this.hasWork()) {
      this.lastWorkAt = now;
    } else if (this.mode === 'active' && now - this.lastWorkAt > IDLE_QUIET) {
      this.mode = 'quiet';
    } else if (this.mode === 'quiet' && now - this.lastWorkAt > IDLE_ASLEEP) {
      this.mode = 'asleep';
    }
  }
}
