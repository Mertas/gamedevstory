// ─── Архив ───
import { CONFIG } from '../../../core/config';
import { dateLabel } from '../../../shared/meta';
import { useGame, useMeta } from '../../store';
import { score100 } from '../../../shared/rules';
import { fmtK } from '../../../shared/nums';

export function ArchiveApp() {
  const game = useGame();
  const meta = useMeta();
  const totalUnits = game.history.reduce((a, h) => a + h.units, 0);
  const totalRev = game.history.reduce((a, h) => a + h.revenue, 0);
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Игр: <b>{game.history.length}</b></span>
        <span>Продано: <b>{fmtK(totalUnits)}</b></span>
        <span>Доход: <b>{fmtK(totalRev)}</b></span>
        <span>Рекорд: <b>{score100(Math.max(0, ...game.history.map((h) => h.score)))}/100</b></span>
      </div>
      <table className="w95-table">
        <thead>
          <tr><th>Дата</th><th>Игра</th><th>Жанр × тип</th><th>Платформа</th><th>Оценка</th><th>Продажи</th><th>Доход</th><th>Вклад</th></tr>
        </thead>
        <tbody>
          {[...game.history].reverse().map((h, i) => (
            <tr key={i}>
              <td>{dateLabel(h.releaseWeek)}</td>
              <td>{h.name}</td>
              {/* аудит 05.09: русские названия вместо сырых id (было h.genreId × h.typeId) */}
              <td>{meta.genres.find((g) => g.id === h.genreId)?.ru ?? h.genreId} × {meta.types.find((t) => t.id === h.typeId)?.nameRu ?? h.typeId}</td>
              <td>{meta.consoles.find((c) => c.id === h.consoleId)?.name ?? h.consoleId}</td>
              <td><b>{h.score}</b>{h.score >= CONFIG.HALL_OF_FAME ? ' 🏆' : ''}</td>
              <td>{fmtK(h.units)}</td>
              <td>{fmtK(h.revenue)}</td>
              <td>{h.contrib ? Object.entries(h.contrib).map(([n, v]) => `${n} ${v}`).join(' · ') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
