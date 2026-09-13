// M1 (plan/31_Анимация_разработки.md): canvas-движок анимации окна «Код».
// Один rAF на окно, пул частиц, стратифицированный размаз по такту, счётчики мимо React.
// Геометрия меряется один раз на такт; координаты — в системе контента (учёт скролла).
// Никаких setState на прилёт, никаких per-particle таймеров и animationend.
// Числа строго неубывающие: вниз показания опускает только setProject (партия/происшествие).
// v1.13.3 (plan/32): suspend() по visibilitychange (фоновая вкладка не копит очередь),
// сторож кадров (исключение не убивает цикл), стоп-лимиты очереди и эффектов, компакция без аллокаций.
// M2 (v1.14.0): «вода» — замах, squash по вектору, блик капли, штрихи-струи, двойная рябь,
// пружинные полоски, всплеск у источника; каркас M3 — тихий планировщик и очередь праздников.
import type { DevContrib, Stats } from '../../../core/types';
import {
  ANIM_ATTRS,
  barScaleTop,
  planWave,
  recordThreshold,
  type AnimAttr,
} from '../../../shared/dev-anim';
import { fmtInt } from '../../../shared/nums';

const COLORS: Record<AnimAttr, string> = {
  fun: '#000080',
  creativity: '#800080',
  graphics: '#008000',
  sound: '#808000',
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
}

interface Pending {
  attr: AnimAttr;
  staffId: string;
  weight: number;
  heavy: number;
  launchAt: number;
  life: number;
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
  private dead = false;
  private mode: 'active' | 'quiet' | 'asleep' = 'active';
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
  }

  destroy(): void {
    this.dead = true;
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
    this.lastNum = { fun: -1, creativity: -1, graphics: -1, sound: -1 };
    // мгновенный слепок в DOM (эффект до первой отрисовки — без мигания пустых полосок)
    this.drawStatic(performance.now() / 1000, 0.25);
    this.wake();
  }

  /** Новый игровой день: цель из игры + вклад за день → план волны с размазом по такту. */
  setWave(target: Stats, contrib: DevContrib[], rec: Partial<Record<AnimAttr, number>>, speed: number): void {
    this.speed = Math.max(0.5, speed || 1);
    this.tickSec = 1 / this.speed;
    this.target = { ...target };
    for (const a of ANIM_ATTRS) this.rec[a] = rec[a] ?? 0;
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
      });
    }
  }

  /** Мины багов: от первого сотрудника к счётчику «Баги» (1 мина = 1 баг). */
  spawnMines(n: number): void {
    this.wake();
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
    const k = Math.min(1, Math.max(0.45, 1 / Math.pow(this.speed, 0.35)));
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
    if (!from || !this.w || this.chips.length >= MAX_ALIVE) {
      // источника нет / перегруз: зачисляем мгновенно — счётчик честный
      this.reserved[p.attr] -= p.weight;
      this.shown[p.attr] += p.weight;
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
    const [x, y] = this.bez(c, 1);
    if (this.ripples.length < RIPPLE_CAP) {
      // M2: двойная рябь — быстрая яркая + медленная мягкая
      this.ripples.push({ x, y, t: 0, life: 0.32, c: COLORS[c.attr], lw: 1, r0: 1.5, r1: 30, a0: 0.7 });
      this.ripples.push({ x, y, t: 0, life: 0.62, c: COLORS[c.attr], lw: 1.5, r0: 2, r1: 52, a0: c.heavy > 0.5 ? 0.55 : 0.38 });
    }
    const n = c.heavy > 0.5 ? 7 : 4;
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
        c: Math.random() < 0.25 ? '#ffffff' : COLORS[c.attr],
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
          this.ghosts.push({ x: gx, y: gy, t: 0, life: 1.15, text: 'РЕКОРД!', gold: true });
        }
        this.elsNotch[attr]?.classList.add('beat');
      });
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

    // след: дискретные призраки
    for (let i = TAIL; i >= 1; i--) {
      const [tx, ty] = this.bez(c, Math.max(0, te - i * 0.05));
      const rr = Math.max(0.6, (2.0 + c.heavy * 2.4) * (1 - i * 0.14));
      ctx.globalAlpha = 0.1 * ((TAIL - i + 1) / TAIL) * (1 - t * 0.35) * fade;
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
    if (this.flashes.length || this.cues.length) return true;
    for (const a of ANIM_ATTRS) {
      if (Math.abs(this.top[a] - barScaleTop(this.rec[a], this.shown[a])) >= 0.5) return true;
      if (Math.abs(Math.round(this.shown[a]) - this.lastNum[a]) >= 1) return true;
      if (Math.abs(this.barVal[a] - this.shown[a]) >= 0.15) return true;
    }
    return false;
  }

  /** M3-каркас: очередь праздников — тиры не накладываются (полные правила — в M3). */
  private enqueue(tier: Cue['tier'], fn: () => void): void {
    if (this.cues.length >= 4) return;
    this.cues.push({ tier, fn });
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
    if (document.hidden) {
      this.dropWork();
      this.last = performance.now() / 1000;
    } else {
      this.last = performance.now() / 1000;
      this.measure();
      this.wake();
    }
  };

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

    const hidden =
      document.hidden || this.root.offsetParent === null || this.root.clientWidth === 0 || this.w === 0;
    if (hidden) {
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
      const f = `bold ${g.gold ? 12 : 11}px ${this.font}`;
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

    // 4) очередь праздников (M3-каркас): не поверх волны, пауза ≥0.25 с между событиями
    if (this.cues.length && (this.chips.length === 0 || now - this.cueLastAt > 0.25)) {
      const cue = this.cues.shift()!;
      this.cueLastAt = now;
      cue.fn();
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
