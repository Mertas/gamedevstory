// ─── Журналы ───
import { useGame } from '../../store';
import { score100 } from '../../../shared/rules';

export function MagazinesApp() {
  const game = useGame();
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <div className="w95-legend">
        <span>Гран-при: <b>{game.awards.grand}</b></span>
        <span>Лучший дизайн: <b>{game.awards.design}</b></span>
        <span>Лучшая музыка: <b>{game.awards.music}</b></span>
        <span>Второе место: <b>{game.awards.runnerUp}</b></span>
      </div>
      <b>Последние релизы</b>
      <table className="w95-table">
        <thead>
          <tr><th>Игра</th><th>Оценка</th><th>Продажи</th></tr>
        </thead>
        <tbody>
          {[...game.history].reverse().slice(0, 15).map((h, i) => (
            <tr key={i}>
              <td>{h.name}</td>
              <td><b>{score100(h.score)}</b>/100</td>
              <td>{Math.round(h.units)}K</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="w95-hint">Чарты и ежемесячные рейтинги — в разработке.</div>
    </div>
  );
}
