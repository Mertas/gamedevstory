// аудит-51 05-P2-6: экран итогов партии — «счёт по активам» (капитал) и витрина достижений.
// Данные собирает shared/finale.ts; попап открывает App.tsx по событию { type: 'finale' }.
import { fmtInt, fmtK } from '../shared/nums';
import { fmtCopies } from '../shared/sales-stats';
import { ruYears } from '../shared/saga-text';
import { finaleReport } from '../shared/finale';
import type { GameState } from '../core/types';

export function FinaleReport({ game }: { game: GameState }) {
  const r = finaleReport(game);
  const rows: { k: string; v: string }[] = [
    { k: 'Капитал на день завершения истории', v: fmtK(r.worth) },
    { k: 'Студия', v: `«${game.studioName}» — ${r.yearsLabel}, ${ruYears(r.years)} работы` },
  ];
  if (r.best) {
    rows.push({ k: 'Лучшая игра', v: `«${r.best.name}» — ${r.best.score}/100, ${fmtCopies(r.best.units)} копий` });
  }
  const aw = r.awards;
  const awards = [
    aw.grand ? `Гран-при ×${aw.grand}` : '',
    aw.design ? `Дизайн ×${aw.design}` : '',
    aw.music ? `Музыка ×${aw.music}` : '',
    aw.runnerUp ? `второе место ×${aw.runnerUp}` : '',
  ].filter(Boolean);
  if (awards.length) rows.push({ k: 'Награды', v: awards.join(' · ') });
  rows.push({ k: 'Фанаты', v: fmtInt(r.fans) });
  if (r.consoleName) rows.push({ k: 'Своя консоль', v: `«${r.consoleName}»` });
  if (r.gamesCount > 0) rows.push({ k: 'Игр в архиве', v: String(r.gamesCount) });

  return (
    <div style={{ lineHeight: 1.5 }}>
      <div>Позади — целая жизнь студии: картриджи, релизы, ночные смены. Осталось посчитать, чем она стала.</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((row) => (
          <div key={row.k}>
            <span style={{ color: 'GrayText' }}>{row.k}:</span> <b>{row.v}</b>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>Дальше — свободная игра: история не заканчивается на этой странице.</div>
    </div>
  );
}
