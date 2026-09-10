// ─── Железо ───
import { actionBuyLicense, useGame, useMeta } from '../../store';
import { OwnConsolePanel } from './OwnConsole';

export function HardwareApp() {
  const game = useGame();
  const meta = useMeta();
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <table className="w95-table">
        <thead>
          <tr><th>Консоль</th><th>Компания</th><th>Доступна</th><th>База</th><th>Лицензия</th><th></th></tr>
        </thead>
        <tbody>
          {meta.consoles.map((c) => {
            const cs = game.consoles[c.id];
            if (!cs || cs.removedAtWeek !== null && cs.removedAtWeek <= game.week) return null;
            return (
              <tr key={c.id}>
                <td><b>{c.name}</b> <span className="w95-hint">×{c.costMult}</span></td>
                <td>{c.company}</td>
                <td>{(() => {
                  const avail = cs.availableAtWeek;
                  return avail !== null && avail > game.week ? `через ${Math.round((avail - game.week) / 7)} нед.` : 'да';
                })()}</td>
                <td>{cs.base}K</td>
                <td>{c.licenseCost === 0 ? 'бесплатно' : `${Math.round(c.licenseCost)}K`}</td>
                <td>
                  {cs.licensed
                    ? <span style={{ color: '#008000' }} data-autopilot={`lic-${c.id}`}>куплена</span>
                    : (
                      <button
                        className="w95-btn"
                        data-autopilot={`lic-${c.id}`}
                        disabled={(cs.availableAtWeek ?? 0) > game.week || game.money < c.licenseCost}
                        onClick={() => actionBuyLicense(c.id)}
                      >
                        Купить
                      </button>
                    )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">Своя консоль — см. панель ниже.</div>
      <OwnConsolePanel />
    </div>
  );
}
