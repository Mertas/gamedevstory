// PLAN-29: окошко продаж (правый верхний угол рабочего стола).
// Пока игра продаётся — живой график копий и накопленного дохода; после окончания продаж —
// итоговая сумма, место в студии по копям и подсветка рекорда. Сквозь окошко кликаем: мышь
// ловит только крестик (иначе оно мешало бы и игроку, и автопилоту).
import { useState } from 'react';
import { useGameSelector } from './store';
import { fmtUnits, pickSalesView, type SalesDay } from '../shared/sales-stats';

const CLOSED_KEY = 'gds-sales-closed';

function loadClosed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function SalesChart({ sales }: { sales: SalesDay[] }) {
  const W = 236;
  const H = 62;
  const n = Math.max(sales.length, 1);
  const maxU = Math.max(1, ...sales.map((s) => s.units));
  const bw = W / n;
  let acc = 0;
  let total = 0;
  for (const s of sales) total += s.revenue;
  const line = sales
    .map((s, i) => {
      acc += s.revenue;
      const x = (i + 0.5) * bw;
      const y = H - 3 - (acc / Math.max(1, total)) * (H - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="sales-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="График продаж">
      {sales.map((s, i) => {
        const h = Math.max(1, (s.units / maxU) * (H - 8));
        return <rect key={s.week} className="sales-bar" x={i * bw} y={H - 2 - h} width={Math.max(1, bw - 0.6)} height={h} />;
      })}
      {sales.length > 1 && <polyline className="sales-line" fill="none" points={line} />}
      <line className="sales-axis" x1="0" y1={H - 1.5} x2={W} y2={H - 1.5} />
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
          <SalesChart sales={view.sales} />
          <div className="sales-nums">
            <span key={`u${view.day}`} className="sales-num">
              🛒 {fmtUnits(view.units)}
            </span>
            <span key={`r${view.day}`} className="sales-num">
              💰 {view.revenue}K
            </span>
          </div>
        </>
      ) : (
        <div className="sales-final">
          <div className="sales-total">💰 {view.revenue}K</div>
          <div className="sales-sub">продано {fmtUnits(view.units)} копий</div>
          <div className="sales-sub">
            место в студии: <b>#{view.rank}</b> из {view.total}
          </div>
          {view.record && <div className="sales-record">🏆 РЕКОРД СТУДИИ!</div>}
        </div>
      )}
    </div>
  );
}
