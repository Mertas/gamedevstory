// Приложение «Код»: мастер нового проекта + статус разработки + релиз.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG, type Mode } from '../../core/config';
import { projectCost } from '../../core/formulas';
import {
  comboGrade, consoleAvailable, consoleById, genreById, isUnlocked, typeById,
} from '../../shared/meta';
import type { DirectionAxis, Role } from '../../core/types';
import { StaffCard } from '../StaffCard';
import {
  actionGenerateStory, actionRelease, actionStartProject, actionUseBooster, clearActionError,
  clearStoryResult, useActionError, useGame, useMeta, useSpeed, useStoryResult,
} from '../store';

const DIRECTION_AXES: { id: DirectionAxis; label: string }[] = [
  { id: 'cute', label: 'Милый' },
  { id: 'realism', label: 'Реализм' },
  { id: 'approach', label: 'Доступность' },
  { id: 'niche', label: 'Нишевость' },
  { id: 'simple', label: 'Простота' },
  { id: 'innovation', label: 'Инновация' },
  { id: 'world', label: 'Игровой мир' },
  { id: 'polish', label: 'Полировка' },
];

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'normal', label: 'Обычный', hint: 'стоимость ×1' },
  { id: 'speed', label: 'Быстрый', hint: '−20% времени, но больше багов' },
  { id: 'quality', label: 'Качественный', hint: '+30% очков, +30% стоимости' },
  { id: 'research', label: 'Исследовательский', hint: '+50% PR, +50% стоимости' },
  { id: 'budget', label: 'Бюджетный', hint: 'стоимость ×2, −15% багов' },
];

const ROLE_LABELS: Record<Role, string> = {
  proposal: 'Сценарий',
  program: 'Программирование',
  graphics: 'Графика',
  sound: 'Звук',
  debug: 'Отладка',
};

export function CodeApp() {
  const game = useGame();
  const g = game.activeGame;

  if (g) return <DevStatus />;
  return <ProjectWizard />;
}

// ─── статус разработки ───
function DevStatus() {
  const game = useGame();
  const meta = useMeta();
  const speed = useSpeed();
  const [boosterStaff, setBoosterStaff] = useState('');
  const [fliers, setFliers] = useState<Flier[]>([]);
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  // СЧЁТЧИК В ПАМЯТИ (целые): растёт ровно на 1 за каждый прилетевший символ.
  // Сколько символов спавнить = разрыв между реальным числом и показанным.
  const [vals, setVals] = useState<Record<string, number>>({ fun: 0, creativity: 0, graphics: 0, sound: 0 });
  const valsRef = useRef<Record<string, number>>({ fun: 0, creativity: 0, graphics: 0, sound: 0 });
  const flyingRef = useRef<Record<string, number>>({ fun: 0, creativity: 0, graphics: 0, sound: 0 });
  // символы, завершившие перелёт (для страховки, когда animationend теряется)
  const landedRef = useRef<Set<string>>(new Set());
  const spawnSeq = useRef(0); // общий порядковый номер для задержек «по очереди»
  const rootRef = useRef<HTMLDivElement>(null);
  const g = game.activeGame;
  if (!g) return null;
  const genre = genreById(meta, g.genreId);
  const type = typeById(meta, g.typeId);
  const consoleData = consoleById(meta, g.consoleId);
  // мины: 1 мина = 1 баг; аккумулятор дробного прироста багов
  const [mines, setMines] = useState<Flier[]>([]);
  const [bugsFlash, setBugsFlash] = useState(false);
  const lastBugsRef = useRef(0);
  const bugsAccRef = useRef(0);
  // ─── мины багов: летят от кодера к счётчику «Баги» ───
  useEffect(() => {
    const bugs = g.bugs ?? 0;
    const delta = bugs - lastBugsRef.current;
    lastBugsRef.current = bugs;
    if (delta > 0) bugsAccRef.current += delta;
    else if (delta < 0) bugsAccRef.current = 0; // отладка — мины не копятся
    if (bugsAccRef.current < 0.5) return; // мина = 1 баг, дробь копим
    const root = rootRef.current;
    const fromEl = root?.querySelector<HTMLElement>('[data-staff-id]');
    const toEl = root?.querySelector<HTMLElement>('[data-bugs]');
    if (!root || !fromEl || !toEl) return;
    const r = root.getBoundingClientRect();
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const startX = fr.right - r.left + 4;
    const startY = fr.top - r.top + fr.height / 2 - 7;
    const targetX = tr.left - r.left + 4;
    const targetY = tr.top - r.top + tr.height / 2 - 7;
    // пачка мин по одной с задержкой, в ряд (как символы вклада) — 1 мина = 1 баг
    const total = Math.floor(bugsAccRef.current);
    const step = Math.max(3, Math.min(13, 70 / Math.max(1, total)));
    setBugsFlash(true); // подсветить счётчик багов
    window.setTimeout(() => setBugsFlash(false), 700);
    let n = 0;
    while (bugsAccRef.current >= 0.5) {
      const sx = startX + n * step;
      const m: Flier = {
        id: `mine-${Date.now()}-${spawnSeq.current++}`,
        attr: 'fun',
        x: sx, y: startY, dx: targetX - sx, dy: targetY - startY, delay: n * 0.12,
      };
      bugsAccRef.current -= 1;
      setMines((all) => [...all, m]);
      setTimeout(() => {
        setMines((all) => all.filter((x) => x.id !== m.id));
      }, 2000 + n * 120);
      n++;
    }
  }, [g, g.bugs, g.weekStarted]);

  // сброс счётчика при смене проекта и при происшествии (реальное падение очков)
  const gKey = `${g.genreId}:${g.typeId}:${g.totalCost}`;
  useEffect(() => {
    const base = { fun: Math.round(g.points.fun), creativity: Math.round(g.points.creativity), graphics: Math.round(g.points.graphics), sound: Math.round(g.points.sound) };
    setVals(base);
    valsRef.current = { ...base };
    flyingRef.current = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
  }, [gKey]);
  useEffect(() => {
    if (game.pendingEvent?.type === 'disaster') {
      const base = { fun: Math.round(g.points.fun), creativity: Math.round(g.points.creativity), graphics: Math.round(g.points.graphics), sound: Math.round(g.points.sound) };
      setVals(base);
      valsRef.current = { ...base };
      flyingRef.current = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pendingEvent?.type]);
  const attrs = [
    { id: 'fun', k: 'Fun', v: Math.round(vals.fun ?? 0), c: '#000080' },
    { id: 'creativity', k: 'Creativity', v: Math.round(vals.creativity ?? 0), c: '#800080' },
    { id: 'graphics', k: 'Graphics', v: Math.round(vals.graphics ?? 0), c: '#008000' },
    { id: 'sound', k: 'Sound', v: Math.round(vals.sound ?? 0), c: '#808000' },
  ];
  const roleStaff = (role: Role) => {
    const ids = g.assignments[role] ?? [];
    if (!ids.length) return '—';
    return ids.map((id, i) => {
      const s = game.staff.find((x) => x.id === id);
      return (
        <span key={id}>
          {i > 0 && ' · '}
          <span data-staff-id={id} style={{ display: 'inline-block', padding: '0 2px', background: '#ffffcc', borderRadius: 2 }} title={s ? (s.homeWeeks > 0 ? `Отдыхает (POWER ${Math.round(s.power)}/${s.maxPower})` : `POWER ${Math.round(s.power)}/${s.maxPower}`) : undefined}>
            {s?.name ?? id}
            {s && (
              <span style={{ display: 'block', width: 46, height: 3, background: '#c8c8c8', marginTop: 1, borderRadius: 1 }}>
                <span
                  style={{
                    display: 'block', height: '100%', borderRadius: 1,
                    width: `${Math.max(0, Math.min(100, (s.power / s.maxPower) * 100))}%`,
                    // отдыхает (ушёл домой) — синяя полоска; иначе уровень бодрости
                    background: s.homeWeeks > 0 ? '#0000cc' : s.power / s.maxPower >= 0.5 ? '#008000' : s.power / s.maxPower >= 0.25 ? '#cc9900' : '#c00000',
                  }}
                />
              </span>
            )}
          </span>
        </span>
      );
    });
  };

  // ─── спавн символов: 1 символ = 1 очко разрыва; распределение по долям вклада ───
  useEffect(() => {
    const contrib = game.devContrib ?? [];
    if (!contrib.length) return;
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    // группируем вклад по атрибутам
    const byAttr: Record<string, { staffId: string; amount: number }[]> = {};
    for (const c of contrib) (byAttr[c.attr] ??= []).push(c);
    const spawn: Flier[] = [];
    for (const attr of ['fun', 'creativity', 'graphics', 'sound'] as const) {
      // доноры символов: прямые роли атрибута; если роли нет (очки из направления) — все работники
      let parts = byAttr[attr] ?? [];
      if (!parts.length) parts = contrib.filter((c) => c.amount > 0);
      if (!parts.length) continue;
      // разрыв: сколько очков ещё не долетело (реальное − показанное − в воздухе)
      const target = Math.round(g.points[attr]);
      const gap = target - (valsRef.current[attr] ?? 0) - (flyingRef.current[attr] ?? 0);
      if (gap <= 0) continue;
      // доли вклада по сотрудникам (largest remainder)
      const sum = parts.reduce((a, p) => a + p.amount, 0);
      if (sum <= 0) continue;
      const alloc = new Map<string, number>();
      let total = 0;
      const rems: { id: string; r: number }[] = [];
      for (const p of parts) {
        const exact = (gap * p.amount) / sum;
        const n = Math.floor(exact);
        alloc.set(p.staffId, n);
        total += n;
        rems.push({ id: p.staffId, r: exact - n });
      }
      rems.sort((a, b) => b.r - a.r);
      for (let i = 0; total < gap; i++) {
        alloc.set(rems[i % rems.length]!.id, (alloc.get(rems[i % rems.length]!.id) ?? 0) + 1);
        total++;
      }
      // спавним символы: у каждого сотрудника, по очереди с маленькой задержкой
      for (const p of parts) {
        const n = alloc.get(p.staffId) ?? 0;
        if (n <= 0) continue;
        const from = root.querySelector<HTMLElement>(`[data-staff-id="${p.staffId}"]`);
        // цель — правый край заполненной части бара (внутренний div со style width/background)
        const bar = root.querySelector<HTMLElement>(`[data-attr="${attr}"] .w95-progress`);
        const fill = bar?.querySelector<HTMLElement>(':scope > div');
        const to = fill ?? bar;
        if (!from || !to) continue;
        const fr = from.getBoundingClientRect();
        const tr = to.getBoundingClientRect();
        // цель: правый край заполнения; если полоса короче символа — в самый край, иначе минус ширина символа
        const targetX = tr.right - r.left - (tr.width >= 14 ? 14 : 0);
        const startX = fr.right - r.left + 8;
        const startY = fr.top - r.top + fr.height / 2 - 7;
        const targetY = tr.top - r.top + tr.height / 2 - 7;
        // ряд у имени: при большом количестве символы перекрываются, чтобы влезать
        const step = Math.max(3, Math.min(13, 70 / Math.max(1, n)));
        for (let k = 0; k < n; k++) {
          const sx = startX + k * step;
          spawn.push({
            id: `${Date.now()}-${spawnSeq.current++}`,
            attr,
            x: sx,
            y: startY,
            dx: targetX - sx,
            dy: targetY - startY,
            delay: k * 0.12,
          });
        }
        flyingRef.current[attr] = (flyingRef.current[attr] ?? 0) + n;
      }
    }
    if (spawn.length) {
      setFliers((f) => [...f, ...spawn]);
      // страховка от потери animationend (фоновая вкладка): засчитываем прилёт принудительно
      const totalDelay = Math.max(...spawn.map((s) => s.delay)) + 1.3;
      setTimeout(() => {
        for (const fl of spawn) {
          if (!landedRef.current.has(fl.id)) {
            flyingRef.current[fl.attr] = Math.max(0, (flyingRef.current[fl.attr] ?? 0) - 1);
            valsRef.current[fl.attr] = (valsRef.current[fl.attr] ?? 0) + 1;
            setVals((v) => ({ ...v, [fl.attr]: (v[fl.attr] ?? 0) + 1 }));
          }
        }
        setFliers((f) => f.filter((x) => !spawn.some((s) => s.id === x.id)));
      }, totalDelay * 1000 + 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.week, game.devContrib]);

  // завершение перелёта символа: счётчик +1 (DOM), вспышка бара
  const onFlierDone = (f: Flier) => {
    landedRef.current.add(f.id);
    setFliers((all) => all.filter((x) => x.id !== f.id));
    flyingRef.current[f.attr] = Math.max(0, (flyingRef.current[f.attr] ?? 0) - 1);
    valsRef.current[f.attr] = (valsRef.current[f.attr] ?? 0) + 1;
    setVals((v) => ({ ...v, [f.attr]: (v[f.attr] ?? 0) + 1 }));
    setFlashes((fl) => ({ ...fl, [f.attr]: Date.now() }));
    setTimeout(() => setFlashes((fl) => {
      const next = { ...fl };
      delete next[f.attr];
      return next;
    }), 600);
  };

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', position: 'relative' }} ref={rootRef}>
      {/* летящие символы вклада */}
      {mines.map((m) => (
        <div
          key={m.id}
          className="w95-flier"
          style={{ left: m.x, top: m.y, ['--dx' as string]: `${m.dx}px`, ['--dy' as string]: `${m.dy}px`, animationDelay: `${m.delay}s` }}
          onAnimationEnd={() => setMines((all) => all.filter((x) => x.id !== m.id))}
        >
          <MineShape />
        </div>
      ))}
      {fliers.map((f) => (
        <div
          key={f.id}
          className="w95-flier"
          style={{
            left: f.x, top: f.y, animationDelay: `${f.delay}s`,
            ['--dx' as string]: `${f.dx}px`, ['--dy' as string]: `${f.dy}px`,
          }}
          onAnimationEnd={() => onFlierDone(f)}
        >
          <ContribShape attr={f.attr} />
        </div>
      ))}
      <div className="w95-row" style={{ justifyContent: 'space-between' }}>
        <b>{genre?.ru ?? genre?.name} × {type?.nameRu ?? type?.name}</b>
        <span>{consoleData?.name} · {MODES.find((m) => m.id === g.mode)?.label} · комбо {g.comboGrade}</span>
      </div>
      <div>
        <div className="w95-row" style={{ justifyContent: 'space-between' }}>
          <span>Прогресс: {Math.round(g.progress * 100)}%</span>
          <span data-bugs className={bugsFlash ? 'w95-attr-flash' : ''}>Баги: <b style={{ color: g.bugs > 20 ? '#c00000' : '#000' }}>{Math.round(g.bugs)}</b></span>
        </div>
        <div className="w95-progress"><div style={{ width: `${Math.min(100, g.progress * 100)}%` }} /></div>
      </div>
      <div className="w95-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {attrs.map((a) => (
          <div key={a.id} data-attr={a.id} className={flashes[a.id] ? 'w95-attr-flash' : ''}>
            <div className="w95-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: a.c }}>{a.k}</span><span>{a.v}</span>
            </div>
            <div className="w95-progress"><div style={{ width: `${Math.min(100, a.v / 4)}%`, background: a.c }} /></div>
          </div>
        ))}
      </div>
      <table className="w95-table">
        <tbody>
          {game.staff.map((s) => {
            const role = (['proposal', 'program', 'graphics', 'sound', 'debug'] as Role[]).find(
              (r) => (g.assignments[r] ?? []).includes(s.id),
            );
            const pct = Math.max(0, Math.min(1, s.maxPower > 0 ? s.power / s.maxPower : 0));
            const powerColor = pct > 0.5 ? '#1a7a1a' : pct > 0.25 ? '#b08a00' : '#c00000';
            return (
              <tr key={s.id}>
                <td data-staff-id={s.id} style={{ width: '50%' }}>
                  {s.name}{s.homeWeeks > 0 && <span title={`Дома ещё ${s.homeWeeks} нед.`}> 🏠</span>}
                  <div className="w95-row" style={{ gap: 4, marginTop: 2 }}>
                    <div className="w95-staff-power" style={{ width: 80, flex: 'none' }}>
                      <div style={{ width: `${Math.round(pct * 100)}%`, background: powerColor }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      {Math.round(s.power)}/{s.maxPower}{s.homeWeeks > 0 ? ' · дома' : ''}
                      {g.contribTotal ? ` · вклад: ${Math.round(g.contribTotal[s.id] ?? 0)}` : ''}
                    </span>
                  </div>
                </td>
                <td>{role ? <b>{ROLE_LABELS[role]}</b> : <span className="w95-hint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {(Object.keys(game.boosterPurchases).length > 0 || Object.values(game.boosterPurchases).some((n) => n > 0)) && (
        <div className="w95-bevel-in" style={{ padding: 6, marginTop: 4 }}>
          <div className="w95-row">
            <b>🧪 Бустеры</b>
            <span className="w95-hint">(сотрудник)</span>
            <select className="w95-input" value={boosterStaff} onChange={(e) => setBoosterStaff(e.target.value)}>
              {game.staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {(['fun', 'creativity', 'graphics', 'sound'] as const).filter((t) => (game.boosterPurchases[t] ?? 0) > 0).map((t) => (
              <button
                key={t}
                className="w95-btn"
                disabled={!boosterStaff}
                onClick={() => boosterStaff && actionUseBooster(boosterStaff, t)}
              >
                {t === 'fun' ? 'Fun' : t === 'creativity' ? 'Creativity' : t === 'graphics' ? 'Graphics' : 'Sound'} +
              </button>
            ))}
          </div>
        </div>
      )}
      {g.phase === 'debug' && (
        <div className="w95-row" style={{ gap: 8, marginTop: 4 }}>
          <button
            className="w95-btn"
            onClick={() => actionRelease()}
            disabled={g.bugs > 10}
            title={g.bugs > 10 ? 'Сначала вычисти баги (≤10)' : 'Выпустить игру'}
          >
            🚀 Выпустить игру {g.bugs > 0 ? `(багов: ${Math.round(g.bugs)})` : ''}
          </button>
          {g.bugs > 10 && <span className="w95-hint">Слишком много багов — рецензенты разгромят</span>}
        </div>
      )}
    </div>
  );
}

// ─── мастер проекта: пошаговый визард ───
const WIZ_STEPS = [
  { id: 1, label: 'Платформа' },
  { id: 2, label: 'Жанр' },
  { id: 3, label: 'Тип' },
  { id: 4, label: 'Режим' },
  { id: 5, label: 'Направление' },
  { id: 6, label: 'Команда' },
  { id: 7, label: 'Итог' },
];

const COMBO_COLOR: Record<string, string> = { S: '#008000', A: '#0000cc', B: '#606060', C: '#a0a0a0' };

// летящий символ вклада (1 символ = 1 очко)
interface Flier {
  id: string;
  attr: 'fun' | 'creativity' | 'graphics' | 'sound';
  x: number; y: number; dx: number; dy: number; delay: number;
}

// мина (баг): тёмный шар с шипами и бликом
function MineShape() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}>
      <g stroke="#fff" strokeWidth="1.1" strokeLinecap="round">
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={7 + Math.cos(a) * 4.4} y1={7 + Math.sin(a) * 4.4}
              x2={7 + Math.cos(a) * 6.6} y2={7 + Math.sin(a) * 6.6}
            />
          );
        })}
      </g>
      <circle cx="7" cy="7" r="4.4" fill="#1c1c1c" stroke="#fff" strokeWidth="0.8" />
      <circle cx="5.4" cy="5.2" r="1.5" fill="#8a8a8a" />
    </svg>
  );
}

// SVG-фигура вклада: программирование — квадрат, сценарий — треугольник, графика — круг, звук — ромб.
// Цвета — как у прогресс-баров атрибутов.
function ContribShape({ attr }: { attr: Flier['attr'] }) {
  const COLORS: Record<Flier['attr'], string> = {
    fun: '#000080', creativity: '#800080', graphics: '#008000', sound: '#808000',
  };
  const c = COLORS[attr];
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}>
      {attr === 'fun' && <rect x="2.5" y="2.5" width="9" height="9" fill={c} stroke="#fff" strokeWidth="0.8" rx="1.5" />}
      {attr === 'creativity' && <polygon points="7,1.5 12.5,11.5 1.5,11.5" fill={c} stroke="#fff" strokeWidth="0.8" strokeLinejoin="round" />}
      {attr === 'graphics' && <circle cx="7" cy="7" r="5.2" fill={c} stroke="#fff" strokeWidth="0.8" />}
      {attr === 'sound' && <polygon points="7,0.5 12.5,7 7,13.5 1.5,7" fill={c} stroke="#fff" strokeWidth="0.8" strokeLinejoin="round" />}
    </svg>
  );
}

function ProjectWizard() {
  const game = useGame();
  const meta = useMeta();
  const [step, setStep] = useState(1);
  const [consoleId, setConsoleId] = useState('pc-game');
  const [genreId, setGenreId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => game.lastMode ?? 'normal');
  const [direction, setDirection] = useState<Record<DirectionAxis, number>>(() => {
    const last = game.lastDirection;
    return {
      cute: last?.cute ?? 0, realism: last?.realism ?? 0, approach: last?.approach ?? 5,
      niche: last?.niche ?? 0, simple: last?.simple ?? 0, innovation: last?.innovation ?? 0,
      world: last?.world ?? 0, polish: last?.polish ?? 5,
    };
  });
  const [roles, setRoles] = useState<Partial<Record<Role, string | null>>>({});
  const [roleTab, setRoleTab] = useState<Role>('proposal');
  const [title, setTitle] = useState('');
  const [plot, setPlot] = useState('');
  const [storyBusy, setStoryBusy] = useState(false);
  const story = useStoryResult();
  // применить сгенерированное название/сюжет
  useEffect(() => {
    clearActionError();
    if (!story) return;
    setStoryBusy(false);
    if (story.ok) {
      if (story.title) setTitle(story.title);
      if (story.plot) setPlot(story.plot);
    }
    clearStoryResult();
  }, [story]);
  const actionError = useActionError();

  // доступные варианты — только открытые (жанры: уровни карьер; типы: + тренинги)
  const consoles = useMemo(() => meta.consoles.filter((c) => {
    const cs = game.consoles[c.id];
    return cs && cs.licensed && consoleAvailable(game, c.id);
  }), [game, meta]);
  const genres = useMemo(
    () => meta.genres.filter((gg) => isUnlocked(game, gg.unlockJob, gg.unlockLevel)),
    [game, meta],
  );
  const types = useMemo(
    () => meta.types.filter((t) => isUnlocked(game, t.unlockJob, t.unlockLevel, t.unlockTraining)),
    [game, meta],
  );

  const spent = Object.values(direction).reduce((a, b) => a + b, 0);
  const dirLeft = game.directionPoints - spent;

  const genre = genreId ? genreById(meta, genreId) : null;
  const type = typeId ? typeById(meta, typeId) : null;
  const consoleData = consoleId ? consoleById(meta, consoleId) : null;
  const cost = genre && type && consoleData
    ? projectCost(
        genre.costWan,
        game.genreLevels[genre.id] ?? 0,
        game.typeLevels[type.id] ?? 0,
        consoleData.costMult,
        mode,
      )
    : 0;
  const combo = genre && type ? comboGrade(meta, genre.id, type.id) : null;
  const canAfford = cost > 0 && cost <= game.money;

  // шаг завершён?
  const stepOk: Record<number, boolean> = {
    1: consoles.length > 0,
    2: !!genreId,
    3: !!typeId,
    4: true,
    5: spent <= game.directionPoints,
    6: !!roles.proposal,
    7: true,
  };
  const maxReached = Math.max(...WIZ_STEPS.filter((s) => stepOk[s.id] && s.id < 7).map((s) => s.id), 1);
  const isDone = (id: number) => stepOk[id] && id < step;
  // первый шаг, который ещё не заполнен (нельзя перепрыгивать через незаполненные)
  const firstMissing = (WIZ_STEPS.find((s) => !stepOk[s.id]) ?? WIZ_STEPS[WIZ_STEPS.length - 1]!).id;

  const next = () => setStep((s) => Math.min(7, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));
  const goTo = (id: number) => { if (id <= step || id <= firstMissing) setStep(id); };

  const start = () => {
    clearActionError();
    actionStartProject({
      consoleId, genreId: genreId!, typeId: typeId!, mode,
      direction: { ...direction },
      proposalStaffId: roles.proposal!,
      assignments: {
        program: roles.program ? [roles.program] : [],
        graphics: roles.graphics ? [roles.graphics] : [],
        sound: roles.sound ? [roles.sound] : [],
        debug: roles.debug ? [roles.debug] : [],
      },
      name: title.trim() || undefined,
      plot: plot.trim() || undefined,
    });
  };

  const setRole = (r: Role, val: string | null) => {
    setRoles((rs) => {
      const next = { ...rs, [r]: val };
      if (val) {
        for (const k of Object.keys(next) as Role[]) {
          if (k !== r && next[k] === val) next[k] = null;
        }
      }
      return next;
    });
  };

  // порядок ролей для авто-перехода (Сценарий → Программирование → … → Отладка)
  const ROLE_ORDER: Role[] = ['proposal', 'program', 'graphics', 'sound', 'debug'];
  // совет подсказки зависит от выбранной роли
  const ROLE_TIPS: Record<Role, string> = {
    proposal: 'Сценарист отвечает за сюжет: влияет на Сценарий и шансы наград. Без него игра не начнётся.',
    program: 'Программист — двигатель разработки: без него не растёт Fun (главная оценка игроков).',
    graphics: 'Дизайнер поднимает Графику — множитель качества и продаж. Назначайте на 2-3-й игре.',
    sound: 'Звукорежиссёр даёт очки Звука — влияет на награды и атмосферу.',
    debug: 'Отладчик снижает баги во время разработки — меньше простоев перед релизом.',
  };

  const handleStaffClick = (s: { id: string }) => {
    const cur = roles[roleTab];
    const val = cur === s.id ? null : s.id;
    setRole(roleTab, val);
    if (val) {
      // назначили — сразу переключаемся на следующую свободную роль
      const idx = ROLE_ORDER.indexOf(roleTab);
      for (let i = idx + 1; i < ROLE_ORDER.length; i++) {
        const nr = ROLE_ORDER[i];
        if (nr && !roles[nr]) { setRoleTab(nr); break; }
      }
    }
  };

  const dirSummary = DIRECTION_AXES.filter((a) => direction[a.id] > 0)
    .map((a) => `${a.label} ${direction[a.id]}`).join(', ') || '—';

  const assignedNames = (r: Role) => {
    const id = roles[r];
    return id ? game.staff.find((s) => s.id === id)?.name ?? '—' : '—';
  };

  return (
    <div className="w95-panel" style={{ height: '100%', padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* список шагов */}
        <div className="w95-bevel-in" style={{ width: 132, padding: 4, margin: 4, overflowY: 'auto', flexShrink: 0 }}>
          {WIZ_STEPS.map((s) => (
            <div
              key={s.id}
              onClick={() => goTo(s.id)}
              className={`w95-row ${s.id === step ? 'w95-step-active' : ''}`}
              style={{
                padding: '3px 4px', cursor: 'pointer', fontSize: 11,
                fontWeight: s.id === step ? 'bold' : 'normal',
                background: s.id === step ? '#000080' : 'transparent',
                color: s.id === step ? '#fff' : '#000',
              }}
            >
              <span>{isDone(s.id) ? '✓' : s.id}</span>
              <span style={{ marginLeft: 4 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* содержимое шага */}
        <div style={{ flex: 1, minWidth: 0, padding: 4, overflowY: 'auto' }}>
          {step === 1 && (
            <>
              <b>Платформа</b>
              <div className="w95-hint">Лицензии на консоли покупаются в окне «Железо».</div>
              <div className="w95-field">
                {consoles.map((c) => (
                  <div key={c.id} className="w95-li" style={{ padding: '2px 4px' }} onClick={() => setConsoleId(c.id)}>
                    <label className="w95-row">
                      <input type="radio" checked={consoleId === c.id} onChange={() => setConsoleId(c.id)} />
                      <b>{c.name}</b>
                      <span className="w95-hint">база: {c.installBase}K · множитель ×{c.costMult}</span>
                    </label>
                  </div>
                ))}
              </div>
              {consoles.length === 0 && <div className="w95-hint">Нет доступных платформ — купите лицензию в «Железе».</div>}
            </>
          )}

          {step === 2 && (
            <>
              <b>Жанр</b>
              {game.lastGenreId && (
                <div className="w95-hint">
                  Прошлый раз: <b>{genreById(meta, game.lastGenreId)?.ru ?? game.lastGenreId}</b> — попробуйте что-то новое!
                </div>
              )}
              <div className="w95-hint">Открытые жанры ({genres.length}/{meta.genres.length}); остальные — за уровни сотрудников.</div>
              <div className="w95-field" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {genres.map((gg) => (
                  <div key={gg.id} className="w95-li" style={{ padding: '1px 4px' }}>
                    <label className="w95-row">
                      <input type="radio" checked={genreId === gg.id} onChange={() => setGenreId(gg.id)} />
                      {gg.ru} <span className="w95-hint">(база {gg.costWan / 10}K)</span>
                    </label>
                  </div>
                ))}
              </div>
              {genres.length === 0 && (
                <div className="w95-hint">Жанры ещё не открыты — прокачайте сотрудников (окно «Найм» → «⬆»).</div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <b>Тип</b>
              {game.lastTypeId && (
                <div className="w95-hint">
                  Прошлый раз: <b>{typeById(meta, game.lastTypeId)?.nameRu ?? typeById(meta, game.lastTypeId)?.name ?? game.lastTypeId}</b>
                </div>
              )}
              <div className="w95-hint">
                {genre ? `Комбо с «${genre.ru}»: S — отлично, A — хорошо. ` : ''}
                Открытые типы ({types.length}/{meta.types.length}); остальные — за уровни и тренинги.
              </div>
              <div className="w95-field" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {types.map((t) => {
                  const cg = genre ? comboGrade(meta, genre.id, t.id) : null;
                  return (
                    <div key={t.id} className="w95-li" style={{ padding: '1px 4px' }}>
                      <label className="w95-row">
                        <input type="radio" checked={typeId === t.id} onChange={() => setTypeId(t.id)} />
                        {t.nameRu ?? t.name}
                        {cg && <b style={{ color: COMBO_COLOR[cg] ?? '#000', marginLeft: 6 }}>({cg})</b>}
                        <span className="w95-hint">({t.popularity})</span>
                      </label>
                    </div>
                  );
                })}
              </div>
              {types.length === 0 && (
                <div className="w95-hint">Типы ещё не открыты — прокачайте сотрудников и пройдите тренинги («Найм» → «Обучение»).</div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <b>Режим разработки</b>
              <div className="w95-field">
                {MODES.map((m) => (
                  <div key={m.id} className="w95-li" style={{ padding: '1px 4px' }}>
                    <label className="w95-row">
                      <input type="radio" checked={mode === m.id} onChange={() => setMode(m.id)} />
                      <b>{m.label}</b> <span className="w95-hint">{m.hint}</span>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <b>Направление</b>
              <div className="w95-hint">
                Очки направления: {spent}/{game.directionPoints}{dirLeft > 0 ? `, свободно ${dirLeft}` : ' (все использованы)'}
              </div>
              <div className="w95-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {DIRECTION_AXES.map((ax) => (
                  <div key={ax.id} className="w95-row" style={{ justifyContent: 'space-between' }}>
                    <span>{ax.label}</span>
                    <span className="w95-row">
                      <button className="w95-btn" style={{ minWidth: 22, padding: '0 6px' }}
                        onClick={() => setDirection((d) => ({ ...d, [ax.id]: Math.max(0, d[ax.id] - 1) }))}>−</button>
                      <b style={{ minWidth: 16, textAlign: 'center' }}>{direction[ax.id]}</b>
                      <button className="w95-btn" style={{ minWidth: 22, padding: '0 6px' }}
                        disabled={dirLeft <= 0}
                        onClick={() => setDirection((d) => ({ ...d, [ax.id]: d[ax.id] + 1 }))}>+</button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <b>Команда</b>
              <div className="w95-hint" style={{ marginBottom: 2 }}>
                1) выберите роль · 2) кликните по сотруднику. Каждый занят на одной роли.
              </div>
              <div className="w95-row" style={{ flexWrap: 'wrap', gap: 2, marginBottom: 2 }}>
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    className={`w95-btn${roleTab === r ? ' active' : ''}`}
                    onClick={() => setRoleTab(r)}
                    title={roles[r] ? game.staff.find((s) => s.id === roles[r])?.name : '—'}
                  >
                    {ROLE_LABELS[r]}: {roles[r] ? game.staff.find((s) => s.id === roles[r])?.name?.split(' ')[0] : '—'}
                  </button>
                ))}
              </div>
              <div className="w95-staff-grid">
                {game.staff.map((s) => {
                  const busyRole = (Object.entries(roles) as [Role, string][]).find(([k, v]) => v === s.id)?.[0];
                  return (
                    <StaffCard
                      key={s.id}
                      st={s}
                      selected={roles[roleTab] === s.id}
                      note={busyRole && busyRole !== roleTab ? `сейчас: ${ROLE_LABELS[busyRole]}` : undefined}
                      onClick={() => handleStaffClick(s)}
                    />
                  );
                })}
              </div>
              <div className="w95-hint" style={{ marginTop: 2 }}>
                💡 {roles[roleTab]
                  ? (ROLE_ORDER.every((r) => roles[r])
                    ? 'Команда укомплектована! Можно переходить к «Итогу».'
                    : `${ROLE_LABELS[roleTab]} назначен. Кликните по карточке следующего сотрудника — роль переключится сама.`)
                  : ROLE_TIPS[roleTab]}
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <b>Итог</b>
              <table className="w95-table">
                <tbody>
                  <tr><td style={{ width: 140 }}>Платформа</td><td>{consoleData?.name}</td></tr>
                  <tr><td>Игра</td><td><b>{genre?.ru ?? '—'} × {type?.nameRu ?? type?.name ?? '—'}</b></td></tr>
                  <tr><td>Комбо</td><td><b style={{ color: COMBO_COLOR[combo ?? ''] ?? '#000' }}>{combo ?? '—'}</b></td></tr>
                  <tr><td>Режим</td><td>{MODES.find((m) => m.id === mode)?.label}</td></tr>
                  <tr><td>Направление</td><td>{dirSummary}</td></tr>
                  <tr><td>Ответственные</td><td>
                    Сценарий: {assignedNames('proposal')} · Программирование: {assignedNames('program')} · Графика: {assignedNames('graphics')} · Звук: {assignedNames('sound')} · Отладка: {assignedNames('debug')}
                  </td></tr>
                  <tr><td>Стоимость</td><td>
                    <b>{Math.round(cost)}K</b>
                    {!canAfford && cost > 0 && <span style={{ color: '#c00000' }}> — не хватает денег!</span>}
                  </td></tr>
                </tbody>
              </table>

              <div className="w95-bevel-out" style={{ padding: 4, marginTop: 6 }}>
                <div className="w95-row" style={{ justifyContent: 'space-between' }}>
                  <b>Название и сюжет</b>
                  <button
                    className="w95-btn"
                    disabled={!genreId || !typeId || storyBusy}
                    onClick={() => {
                      setStoryBusy(true);
                      clearActionError();
                      actionGenerateStory(genreId!, typeId!);
                    }}
                  >
                    {storyBusy ? 'Генерирую…' : '✨ Сгенерировать'}
                  </button>
                </div>
                <input
                  className="w95-input" style={{ width: '100%', marginTop: 4 }}
                  placeholder="Название игры (можно отредактировать)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={40}
                />
                <textarea
                  className="w95-input" style={{ width: '100%', marginTop: 4, height: 56, resize: 'none' }}
                  placeholder="Краткий сюжет (можно отредактировать)"
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  maxLength={10000}
                />
                <div className="w95-hint" style={{ marginTop: 2 }}>
                  {storyBusy ? 'GigaChat придумывает название и сюжет…' : 'Можно оставить пустым — название сгенерируется при релизе.'}
                </div>
              </div>
              {actionError && <div style={{ color: '#c00000', marginTop: 4 }}>⚠ {actionError}</div>}
            </>
          )}
        </div>
      </div>

      {/* футер: стоимость на каждом шаге + навигация */}
      <div className="w95-bevel-out" style={{ padding: 4, margin: 4 }}>
        <div className="w95-row" style={{ justifyContent: 'space-between' }}>
          <span>
            Стоимость: <b>{cost > 0 ? `${Math.round(cost)}K` : '—'}</b>
            {combo && <span> · Комбо: <b style={{ color: COMBO_COLOR[combo] ?? '#000' }}>{combo}</b></span>}
            <span className="w95-hint"> · В кассе: {Math.round(game.money)}K</span>
            {cost > 0 && !canAfford && <span style={{ color: '#c00000' }}> — не хватает!</span>}
          </span>
          <span className="w95-row" style={{ gap: 4 }}>
            <button className="w95-btn" disabled={step <= 1} onClick={prev}>← Назад</button>
            {step < 7 ? (
              <button className="w95-btn" disabled={!stepOk[step]} onClick={next}>Далее →</button>
            ) : (
              <button
                className="w95-btn"
                disabled={!canAfford || !stepOk[6]}
                onClick={start}
              >
                ▶ Начать разработку
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
