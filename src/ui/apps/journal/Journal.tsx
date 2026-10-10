// аудит-51 P1-12: журнал студии — события core/log в человеческом виде: свежие сверху,
// с игровыми датами (снятие консолей, контракты, награды, выпуски игр и прочая жизнь студии).
import { useMemo } from 'react';
import { dateLabel } from '../../../shared/meta';
import { useGame } from '../../store';

export function JournalApp() {
  const game = useGame();
  const rows = useMemo(() => [...game.log].reverse(), [game.log]);
  return (
    <div className="w95-journal">
      {rows.length === 0 && (
        <div className="w95-hint" style={{ padding: 8 }}>Пока пусто — история студии начнётся с первой игры.</div>
      )}
      {rows.map((e, i) => (
        <div key={rows.length - i} className="w95-journal-row">
          <span className="w95-journal-date">{dateLabel(e.week)}</span>
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}
