// PLAN-29/30: окошко продаж (правый верхний угол рабочего стола).
// Живой режим: синие столбики — продажи по НЕДЕЛЯМ (текущая неделя растёт день ото дня, шкала
// задана полной первой неделей — она максимальная), жёлтая линия с подписью — накопленный доход,
// слева подписи вертикальной оси. После продаж — итог, место в студии и подсветка рекорда.
// Сквозь окошко кликаем: мышь ловит только крестик.
import { useState } from 'react';
import { useGameSelector } from './store';
import { fmtCopies, pickSalesView, type SalesDay } from '../shared/sales-stats';

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
          {money}K
        </text>
      )}
      <line className="sales-axis" x1={LEFT} y1={BOT} x2={W - 2} y2={BOT} />
    </svg>
  );
}

export function SalesWidget() {
  const game = useGameSelector((g) => g);
  const [closed, setClosed] = useState<Set<string>>(loadClosed);
  const view = pickSalesView(game.released, game.history, game.week);
  if (!view || closed.has(view.key)) return null;
  const close = () => {
    const next = new Set(closed).add(view.key);
    setClosed(next);
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...next]));
    } catch {
      /* noop */
    }
  };
  return (
    <div className="sales-widget" role="status">
      <div className="sales-head">
        <span className="sales-title">📈 Продажи</span>
        {view.live && view.days > 0 && (
          <span className="sales-day">
            день {view.day} из {view.days}
          </span>
        )}
        <button className="sales-x" title="Закрыть" onClick={close}>
          ✕
        </button>
      </div>
      <div className="sales-name">{view.name}</div>
      {view.live && view.sales.length > 0 ? (
        <>
          <SalesChart sales={view.sales} scale={view.scaleWeek1} planRevenue={view.planRevenue} money={view.revenue} />
          <div className="sales-nums">
            <span key={`u${view.day}`} className="sales-num">
              🛒 {fmtCopies(view.units)}
            </span>
            <span key={`r${view.day}`} className="sales-num">
              💰 {view.revenue}K
            </span>
          </div>
        </>
      ) : (
        <div className="sales-final">
          <div className="sales-total">💰 {view.revenue}K</div>
          <div className="sales-sub">продано {fmtCopies(view.units)} копий</div>
          <div className="sales-sub">
            место в студии: <b>#{view.rank}</b> из {view.total}
          </div>
          {view.record && <div className="sales-record">🏆 РЕКОРД СТУДИИ!</div>}
        </div>
      )}
    </div>
  );
}
