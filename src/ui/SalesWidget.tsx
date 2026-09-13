// PLAN-29/30: окошко продаж (правый верхний угол рабочего стола).
// Живой режим: синие столбики — продажи по НЕДЕЛЯМ (текущая неделя растёт день ото дня, шкала
// задана полной первой неделей — она максимальная), жёлтая линия с подписью — накопленный доход,
// слева подписи вертикальной оси. После продаж — итог, место в студии и подсветка рекорда.
// Сквозь окошко кликаем: мышь ловит только крестик.
import { useEffect, useRef, useState } from 'react';
import { useGameSelector } from './store';
import { fmtCopies, pickSalesViews, smoothView, type SalesDay, type SalesView } from '../shared/sales-stats';
import { fmtK } from '../shared/nums';

const CLOSED_KEY = 'gds-sales-closed';

function loadClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

/** График: столбики продаж по неделям + линия накопленного дохода + подписи вертикальной оси. */
function SalesChart({ sales, scale, planRevenue, money }: { sales: SalesDay[]; scale: number; planRevenue: number; money: number }) {
  const W = 240;
  const H = 80;
  const LEFT = 36;
  const TOP = 6;
  const BOT = 66;
  const slot = (W - LEFT) / 24;
  const weeks = Array.from({ length: 24 }, () => 0);
  let acc = 0;
  const line: string[] = [];
  sales.forEach((s, i) => {
    const w = Math.floor(i / 7);
    if (w < 24) weeks[w] = (weeks[w] ?? 0) + (s.unitsF ?? s.units);
    acc += s.revenue;
    const x = LEFT + ((i + 0.5) / 7) * slot;
    const y = BOT - Math.min(1, acc / Math.max(1, planRevenue)) * (BOT - TOP);
    line.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  const current = Math.floor((sales.length - 1) / 7);
  const yOf = (v: number) => BOT - Math.min(1, v / Math.max(0.0001, scale)) * (BOT - TOP);
  const lastY = sales.length > 1 ? Number((line[line.length - 1] ?? '').split(',')[1]) : BOT;
  return (
    <svg className="sales-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Продажи по неделям и накопленный доход">
      {[scale, scale / 2, 0].map((v, k) => (
        <g key={k}>
          <line className="sales-grid" x1={LEFT} y1={yOf(v)} x2={W - 2} y2={yOf(v)} />
          <text className="sales-axlabel" x={LEFT - 4} y={yOf(v) + 3} textAnchor="end">
            {fmtCopies(v)}
          </text>
        </g>
      ))}
      {weeks.map((v, w) => {
        const y = yOf(v);
        return (
          <rect
            key={w}
            className={`sales-bar${w === current ? ' current' : ''}`}
            x={LEFT + w * slot + 0.8}
            y={y}
            width={Math.max(1, slot - 1.6)}
            height={Math.max(0.5, BOT - y)}
          />
        );
      })}
      {sales.length > 1 && <polyline className="sales-line" fill="none" points={line.join(' ')} />}
      {sales.length > 1 && (
        <text className="sales-moneylabel" x={W - 3} y={Math.max(TOP + 7, Math.min(BOT, lastY) - 3)} textAnchor="end">
          {fmtK(money)}
        </text>
      )}
      <line className="sales-axis" x1={LEFT} y1={BOT} x2={W - 2} y2={BOT} />
    </svg>
  );
}

export function SalesWidget() {
  const game = useGameSelector((g) => g);
  const [closed, setClosed] = useState<Set<string>>(loadClosed);
  const views = pickSalesViews(game.released, game.history, game.week);

  // PLAN-31: длительность игрового дня меряем по смене недели, чтобы растянуть обновления на день
  const periodRef = useRef(1500);
  const lastWeek = useRef({ w: -1, t: 0 }); // заполняется в эффекте (performance.now нельзя в рендере)
  useEffect(() => {
    const now = performance.now();
    if (lastWeek.current.w < 0) {
      lastWeek.current = { w: game.week, t: now };
      return;
    }
    if (game.week !== lastWeek.current.w) {
      const p = now - lastWeek.current.t;
      if (p > 150 && p < 20000) periodRef.current = p;
      lastWeek.current = { w: game.week, t: now };
    }
  }, [game.week]);

  // Прошло: 5 обновлений за игровой день (0.2 → 1.0), а не один рывок в конце дня
  const dayKey = views.filter((v) => v.live).map((v) => `${v.key}:${v.day}`).join('|');
  // PLAN-35: прогресс дня хранится ВМЕСТЕ со своим ключом. Раньше прогресс жил отдельно: на смене
  // дня первый кадр рисовался со старым прогрессом (0.2–1.0) и новым полным днём продаж — полоска
  // и линия дохода прыгали вверх, а следующим кадром падали почти в ноль. Теперь чужой день = 0.
  const [pr, setPr] = useState({ day: '', p: 1 });
  const progress = pr.day === dayKey ? pr.p : 0;
  useEffect(() => {
    if (!dayKey) return;
    setPr((x) => (x.day === dayKey ? x : { day: dayKey, p: 0 }));
    const step = Math.max(60, periodRef.current / 5);
    const id = setInterval(() => {
      setPr((x) => {
        if (x.day !== dayKey) return { day: dayKey, p: 0.2 };
        if (x.p >= 1) return x;
        return { day: dayKey, p: Math.round(Math.min(1, x.p + 0.2) * 10) / 10 };
      });
    }, step);
    return () => clearInterval(id);
  }, [dayKey]);

  // PLAN-34: мировой список (все аккаунты) — «место среди всех» и отметки топ-10/рекорда мира
  const [lb, setLb] = useState<{ rows: Array<{ units: number }>; total: number } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/leaderboard')
        .then((r) => (r.ok ? (r.json() as Promise<{ rows?: Array<{ units: number }>; total?: number }>) : null))
        .then((j) => {
          if (alive && j?.rows && typeof j.total === 'number') setLb({ rows: j.rows, total: j.total });
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const worldOf = (units: number): { rank: number; total: number } | null =>
    lb ? { rank: 1 + lb.rows.filter((r) => r.units > units).length, total: lb.total } : null;

  const shown = views.filter((v) => !closed.has(v.key)).slice(0, 2);
  if (shown.length === 0) return null;
  const close = (key: string) => {
    setClosed((prev) => {
      const next = new Set(prev).add(key);
      try {
        localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
      } catch {
        /* noop */
      }
      return next;
    });
  };
  return (
    <div className="sales-widget">
      {shown.map((v) => {
        const sv: SalesView = v.live ? smoothView(v, progress) : v;
        const world = sv.live ? null : worldOf(sv.units);
        return (
          <div key={v.key} className="sales-panel" role="status">
            <div className="sales-head">
              <span className="sales-title">📈 Продажи</span>
              <button className="sales-x" title="Закрыть" onClick={() => close(v.key)}>
                ✕
              </button>
            </div>
            <div className="sales-name">{sv.name}</div>
            {sv.live && sv.sales.length > 0 ? (
              <>
                <SalesChart sales={sv.sales} scale={sv.scaleWeek1} planRevenue={sv.planRevenue} money={Math.round(sv.revenue)} />
                <div className="sales-nums">
                  <span key={`u${sv.day}${progress}`} className="sales-num">
                    🛒 {fmtCopies(sv.units)}
                  </span>
                  <span key={`r${sv.day}${progress}`} className="sales-num">
                    💰 {fmtK(sv.revenue)}
                  </span>
                </div>
              </>
            ) : (
              <div className="sales-final">
                <div className="sales-line1">
                  💰 {fmtK(sv.revenue)} · 🛒 {fmtCopies(sv.units)} копий
                </div>
                <div className="sales-sub">
                  место в студии: <b>#{sv.rank}</b> из {sv.total}
                </div>
                {world && (
                  <div className="sales-sub">
                    среди всех игроков: <b>#{world.rank}</b> из {world.total}
                  </div>
                )}
                {sv.record && <div className="sales-record">🏆 РЕКОРД СТУДИИ!</div>}
                {world && world.rank === 1 && <div className="sales-record">🏆 РЕКОРД МИРА!</div>}
                {world && world.rank > 1 && world.rank <= 10 && <div className="sales-record">🏆 ТОП-10 среди всех игроков!</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
