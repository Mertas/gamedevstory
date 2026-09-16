// ─── Архив: все игры студии — фильтры, сортировка, «показать ещё», карточка игры ───
import { useEffect, useMemo, useState } from 'react';
import type { GameRecord } from '../../../core/types';
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { useGame, useMeta } from '../../store';
import { pressVerdict, score100 } from '../../../shared/rules';
import { fmtK } from '../../../shared/nums';
import { fmtCopies, recordUnits } from '../../../shared/sales-stats';
import { CRITICS } from '../../../core/data/critics';
import { SalesChart } from '../../SalesWidget';
import {
  ARCHIVE_PAGE, EMPTY_FILTER, filterHistory, rebuildSalesCurve, sortHistory,
  type ArchiveFilter, type ArchiveSort,
} from '../../../shared/archive';

const SORT_LABELS: Record<ArchiveSort, string> = {
  'date-desc': 'Дата выпуска: новые',
  'date-asc': 'Дата выпуска: старые',
  score: 'Оценка (больше — выше)',
  units: 'Копии (больше — выше)',
  revenue: 'Доход (больше — выше)',
  title: 'Название (А–Я)',
};

export function ArchiveApp() {
  const game = useGame();
  const meta = useMeta();
  const [f, setF] = useState<ArchiveFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<ArchiveSort>('date-desc');
  const [limit, setLimit] = useState(ARCHIVE_PAGE);
  const [card, setCard] = useState<GameRecord | null>(null);

  const totalUnits = game.history.reduce((a, h) => a + h.units, 0);
  const totalRev = game.history.reduce((a, h) => a + h.revenue, 0);
  const rows = useMemo(() => sortHistory(filterHistory(game.history, f), sort), [game.history, f, sort]);
  const shown = rows.slice(0, limit);

  // фильтр/сортировка изменились — показываем с первой страницы
  useEffect(() => {
    setLimit(ARCHIVE_PAGE);
  }, [f, sort]);

  // Esc закрывает карточку
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  // место в студии по копиям (как в окне продаж)
  const ranks = useMemo(() => {
    const sorted = [...game.history].sort((a, b) => recordUnits(b) - recordUnits(a));
    const m = new Map<GameRecord, number>();
    sorted.forEach((h, i) => m.set(h, i + 1));
    return m;
  }, [game.history]);

  const genreName = (id: string) => meta.genres.find((g) => g.id === id)?.ru ?? id;
  const typeName = (id: string) => meta.types.find((t) => t.id === id)?.nameRu ?? id;
  const consoleName = (id: string) => meta.consoles.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Игр: <b>{game.history.length}</b></span>
        <span>Продано: <b>{fmtK(totalUnits)}</b></span>
        <span>Доход: <b>{fmtK(totalRev)}</b></span>
        <span>Рекорд: <b>{score100(Math.max(0, ...game.history.map((h) => h.score)))}/100</b></span>
        <span>Показано: <b>{shown.length}</b> из {rows.length}</span>
      </div>

      <div className="w95-row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '2px 4px' }}>
        <input
          className="w95-input"
          style={{ width: 140 }}
          placeholder="🔍 по названию"
          value={f.q}
          onChange={(e) => setF({ ...f, q: e.target.value })}
        />
        <select className="w95-input" value={f.genreId} onChange={(e) => setF({ ...f, genreId: e.target.value })}>
          <option value="">Жанр: все</option>
          {meta.genres.map((g) => <option key={g.id} value={g.id}>{g.ru}</option>)}
        </select>
        <select className="w95-input" value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
          <option value="">Тип: все</option>
          {meta.types.map((t) => <option key={t.id} value={t.id}>{t.nameRu}</option>)}
        </select>
        <select className="w95-input" value={f.consoleId} onChange={(e) => setF({ ...f, consoleId: e.target.value })}>
          <option value="">Платформа: все</option>
          {meta.consoles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="w95-row" style={{ gap: 4 }}>
          <input type="checkbox" checked={f.awardsOnly} onChange={(e) => setF({ ...f, awardsOnly: e.target.checked })} />
          только с наградами
        </label>
        <select className="w95-input" value={sort} onChange={(e) => setSort(e.target.value as ArchiveSort)}>
          {(Object.keys(SORT_LABELS) as ArchiveSort[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
        </select>
      </div>

      <table className="w95-table">
        <thead>
          <tr><th>Дата</th><th>Игра</th><th>Жанр × тип</th><th>Платформа</th><th>Оценка</th><th>Продажи</th><th>Доход</th></tr>
        </thead>
        <tbody>
          {shown.map((h) => (
            <tr key={`${h.name}#${h.releaseWeek}`} className="arc-row" onClick={() => setCard(h)} title="Открыть карточку игры">
              <td>{dateLabel(h.releaseWeek)}</td>
              <td>{h.name}</td>
              <td>{genreName(h.genreId)} × {typeName(h.typeId)}</td>
              <td>{consoleName(h.consoleId)}</td>
              <td><b>{h.score}</b>{h.score >= CONFIG.HALL_OF_FAME ? ' 🏆' : ''}{(h.awards?.length ?? 0) > 0 ? ' 🎖' : ''}</td>
              <td>{fmtK(h.paidUnits ?? h.units)}</td>
              <td>{fmtK(h.paidRevenue ?? h.revenue)}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr><td colSpan={7}><span className="w95-hint">Ничего не нашлось — попробуйте другие фильтры.</span></td></tr>
          )}
        </tbody>
      </table>

      {shown.length < rows.length && (
        <div style={{ padding: '4px 2px' }}>
          <button className="w95-btn" onClick={() => setLimit((n) => n + ARCHIVE_PAGE)}>
            Показать ещё ({rows.length - shown.length})
          </button>
        </div>
      )}

      {card && <GameCard h={card} onClose={() => setCard(null)} rank={ranks.get(card) ?? 1} total={game.history.length} />}
    </div>
  );
}

/** Карточка игры: продажи с графиком, пресса с текстами, вклад, как решали (отрывок чата). */
function GameCard({ h, onClose, rank, total }: { h: GameRecord; onClose: () => void; rank: number; total: number }) {
  const meta = useMeta();
  const consoleMult = meta.consoles.find((c) => c.id === h.consoleId)?.costMult ?? 1;
  const curve = useMemo(() => rebuildSalesCurve(h, consoleMult), [h, consoleMult]);
  const scaleW1 = curve.slice(0, 7).reduce((a, d) => a + (d.unitsF ?? d.units), 0);
  const planRevenue = curve.reduce((a, d) => a + d.revenue, 0);
  const genreName = meta.genres.find((g) => g.id === h.genreId)?.ru ?? h.genreId;
  const typeName = meta.types.find((t) => t.id === h.typeId)?.nameRu ?? h.typeId;
  const consoleName = meta.consoles.find((c) => c.id === h.consoleId)?.name ?? h.consoleId;
  const factUnits = h.paidUnits ?? h.units;
  const factRev = h.paidRevenue ?? h.revenue;
  const criticRows = h.judgeScores ?? [];
  const texts = h.reviewMessages ?? [];

  return (
    <div className="arc-overlay" onClick={onClose} role="dialog" aria-label={`Карточка игры ${h.name}`}>
      <div className="arc-card" onClick={(e) => e.stopPropagation()}>
        <div className="arc-head">
          <span>🎮 {h.name}</span>
          <button className="arc-x" onClick={onClose} title="Закрыть">✕</button>
        </div>

        <div className="arc-sec">
          <span className="w95-hint">{genreName} × {typeName} · {consoleName} · {dateLabel(h.releaseWeek)} (год {h.year})</span>
        </div>

        <div className="arc-sec" style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="arc-score">{h.score}/100</span>
          <span>{pressVerdict(h.score)}</span>
          {h.score >= CONFIG.HALL_OF_FAME && <b>🏆</b>}
        </div>

        <div className="arc-sec">
          <b>📜 Описание</b>
          <div>{h.plot || <span className="w95-hint">описание не сохранилось (архив до обновления)</span>}</div>
        </div>

        <div className="arc-sec">
          <b>📈 Продажи</b>
          <div className="arc-chart">
            <SalesChart sales={curve} scale={scaleW1} planRevenue={planRevenue} money={factRev} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Копии: <b>{fmtCopies(factUnits)}</b>{h.paidUnits !== undefined && <> <span className="w95-hint">(план {fmtK(h.units)})</span></>}</span>
            <span>Доход: <b>{fmtK(factRev)}</b></span>
            <span>Место в студии: <b>#{rank}</b> из {total}</span>
          </div>
        </div>

        <div className="arc-sec">
          <b>📰 Пресса</b>
          {criticRows.length > 0 ? (
            criticRows.map((s, i) => (
              <div className="arc-crit" key={i}>
                <div className="mag">{CRITICS[i]?.magazine ?? 'Пресса'} · <b>{s}/10</b></div>
                <div><b>{CRITICS[i]?.name ?? 'Критик'}:</b> {texts[i] || <span className="w95-hint">текст не сохранился</span>}</div>
              </div>
            ))
          ) : (
            <div className="w95-hint">пресса не сохранилась (архив до обновления)</div>
          )}
        </div>

        <div className="arc-sec">
          <b>🧑‍🤝‍🧑 Вклад команды</b>
          <div>{h.contrib && Object.keys(h.contrib).length > 0
            ? Object.entries(h.contrib).map(([n, v]) => `${n} ${v}`).join(' · ')
            : <span className="w95-hint">—</span>}</div>
        </div>

        <div className="arc-sec">
          <b>🧾 Детали</b>
          <div className="w95-hint">
            Баги: {h.bugsTotal ?? h.bugs} · Атрибуты: веселье {h.attrs.fun}, креатив {h.attrs.creativity}, графика {h.attrs.graphics}, звук {h.attrs.sound}
            {h.awards && h.awards.length > 0 && <> · Награды: <b>{h.awards.join(', ')}</b> 🎖</>}
          </div>
        </div>

        <div className="arc-sec" style={{ paddingBottom: 8 }}>
          <b>🗣 Как решали делать эту игру</b>
          {h.decisionChat && h.decisionChat.length > 0 ? (
            <div className="arc-chat">
              {h.decisionChat.map((m, i) => (
                <div className="arc-bubble" key={i}>
                  <span className="who">{m.author}</span> <span className="w95-hint">{dateLabel(m.week)}</span>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="w95-hint">обсуждение не сохранилось — появится у игр, начатых после обновления</div>
          )}
        </div>
      </div>
    </div>
  );
}
