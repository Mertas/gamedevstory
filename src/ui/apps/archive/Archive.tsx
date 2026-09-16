// ─── Архив: все игры студии — фильтры, сортировка, «показать ещё»; клик → окно-карточка игры ───
import { useEffect, useMemo, useState } from 'react';
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { useGame, useMeta } from '../../store';
import { useWindows } from '../../wm';
import { score100 } from '../../../shared/rules';
import { fmtK } from '../../../shared/nums';
import { cardWinId } from './GameCardWindow';
import {
  ARCHIVE_PAGE, DEFAULT_SORT, EMPTY_FILTER, filterHistory, nextSort, sortHistory,
  type ArchiveFilter, type ArchiveSortKey, type ArchiveSortState,
} from '../../../shared/archive';

export function ArchiveApp() {
  const game = useGame();
  const meta = useMeta();
  const wm = useWindows();
  const [f, setF] = useState<ArchiveFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<ArchiveSortState>(DEFAULT_SORT);
  const [limit, setLimit] = useState(ARCHIVE_PAGE);

  const totalUnits = game.history.reduce((a, h) => a + h.units, 0);
  const totalRev = game.history.reduce((a, h) => a + h.revenue, 0);
  const rows = useMemo(() => sortHistory(filterHistory(game.history, f), sort), [game.history, f, sort]);
  const shown = rows.slice(0, limit);

  // фильтр/сортировка изменились — показываем с первой страницы
  useEffect(() => {
    setLimit(ARCHIVE_PAGE);
  }, [f, sort]);

  const genreName = (id: string) => meta.genres.find((g) => g.id === id)?.ru ?? id;
  const typeName = (id: string) => meta.types.find((t) => t.id === id)?.nameRu ?? id;
  const consoleName = (id: string) => meta.consoles.find((c) => c.id === id)?.name ?? id;

  // клик по заголовку — сортировка; шеврон ▼/▲ у активной колонки
  const th = (label: string, key: ArchiveSortKey) => (
    <th
      className="arc-th-sort"
      onClick={() => setSort((s) => nextSort(s, key))}
      title={`Сортировать: ${label}`}
    >
      {label}
      {sort.key === key && <span className="arc-chev">{sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );

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
      </div>

      <table className="w95-table">
        <thead>
          <tr>
            {th('Дата', 'date')}
            {th('Игра', 'title')}
            <th>Жанр × тип</th>
            <th>Платформа</th>
            {th('Оценка', 'score')}
            {th('Продажи', 'units')}
            {th('Доход', 'revenue')}
          </tr>
        </thead>
        <tbody>
          {shown.map((h) => (
            <tr
              key={`${h.name}#${h.releaseWeek}`}
              className="arc-row"
              onClick={() => wm.open(cardWinId(h))}
              title="Открыть карточку игры"
            >
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

      <div className="w95-hint" style={{ padding: '2px 4px' }}>
        Клик по игре — карточка в отдельном окне (двигается и сворачивается как обычное приложение).
      </div>
    </div>
  );
}
