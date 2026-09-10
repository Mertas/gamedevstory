// ─── Код: статус разработки — очки вклада, бустеры, баги (UI-08: вынесено из CodeApp.tsx) ───
import { useEffect, useRef, useState } from 'react';
import { consoleById, genreById, typeById } from '../../../shared/meta';
import type { Role } from '../../../core/types';
import { actionUseBooster, useGame, useMeta } from '../../store';
import { ReleasePanel } from './Release';
import { MODES, ROLE_LABELS } from './shared';

// ─── статус разработки ───
export function DevStatus() {
  const game = useGame();
  const meta = useMeta();
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
  const gKey = g ? `${g.genreId}:${g.typeId}:${g.totalCost}` : '';
  // ─── аудит 05.09: ВСЕ хуки до раннего return (rules-of-hooks). Раньше useEffect ниже
  // `if (!g) return null` вызывались условно; тела эффектов теперь с гвардом !g ───
  // мины: 1 мина = 1 баг; аккумулятор дробного прироста багов
  const [mines, setMines] = useState<Flier[]>([]);
  const [bugsFlash, setBugsFlash] = useState(false);
  const lastBugsRef = useRef(0);
  const bugsAccRef = useRef(0);
  // null-безопасные депсы для эффекта мин (аудит 05.09: правила exhaustive-deps)
  const bugsDep = g ? g.bugs : 0;
  const weekStartedDep = g ? g.weekStarted : 0;
  // ─── мины багов: летят от кодера к счётчику «Баги» ───
  useEffect(() => {
    if (!g) return;
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
  }, [g, bugsDep, weekStartedDep]);

  // сброс счётчика при смене проекта и при происшествии (реальное падение очков)
  useEffect(() => {
    if (!g) return;
    const base = { fun: Math.round(g.points.fun), creativity: Math.round(g.points.creativity), graphics: Math.round(g.points.graphics), sound: Math.round(g.points.sound) };
    setVals(base);
    valsRef.current = { ...base };
    flyingRef.current = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gKey]);
  useEffect(() => {
    if (!g) return;
    if (game.pendingEvent?.type === 'disaster') {
      const base = { fun: Math.round(g.points.fun), creativity: Math.round(g.points.creativity), graphics: Math.round(g.points.graphics), sound: Math.round(g.points.sound) };
      setVals(base);
      valsRef.current = { ...base };
      flyingRef.current = { fun: 0, creativity: 0, graphics: 0, sound: 0 };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pendingEvent?.type]);

  // ─── спавн символов: 1 символ = 1 очко разрыва; распределение по долям вклада ───
  useEffect(() => {
    if (!g) return;
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

  if (!g) return null;
  const genre = genreById(meta, g.genreId);
  const type = typeById(meta, g.typeId);
  const consoleData = consoleById(meta, g.consoleId);
  const attrs = [
    { id: 'fun', k: 'Fun', v: Math.round(vals.fun ?? 0), c: '#000080' },
    { id: 'creativity', k: 'Creativity', v: Math.round(vals.creativity ?? 0), c: '#800080' },
    { id: 'graphics', k: 'Graphics', v: Math.round(vals.graphics ?? 0), c: '#008000' },
    { id: 'sound', k: 'Sound', v: Math.round(vals.sound ?? 0), c: '#808000' },
  ];

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
            <select className="w95-input" data-autopilot="booster-staff" value={boosterStaff} onChange={(e) => setBoosterStaff(e.target.value)}>
              {game.staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {(['fun', 'creativity', 'graphics', 'sound'] as const).filter((t) => (game.boosterPurchases[t] ?? 0) > 0).map((t) => (
              <button
                key={t}
                className="w95-btn"
                data-autopilot={`booster-use-${t}`}
                disabled={!boosterStaff}
                onClick={() => boosterStaff && actionUseBooster(boosterStaff, t)}
              >
                {t === 'fun' ? 'Fun' : t === 'creativity' ? 'Creativity' : t === 'graphics' ? 'Graphics' : 'Sound'} +
              </button>
            ))}
          </div>
        </div>
      )}
      <ReleasePanel />
    </div>
  );
}

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
