// ─── Железо: рынок консолей — лицензии, пороги событийных консолей и таймеры ───
import { actionBuyLicense, useGame, useMeta } from '../../store';
import { OwnConsolePanel } from './OwnConsole';
import { fmtK } from '../../../shared/nums';
import { dateToDay, EVENT_CONSOLE_REQ } from '../../../shared/consoles';
import { allConsoles, dateLabel } from '../../../shared/meta';

/** копии: units в тысячах → «6.1M» / «74K» (как в окне продаж) */
function unitsLabel(units: number): string {
  return units >= 1000 ? `${(units / 1000).toFixed(1)}M` : `${Math.round(units)}K`;
}

export function HardwareApp() {
  const game = useGame();
  const meta = useMeta();
  const bestUnits = game.history.reduce((m, h) => Math.max(m, h.units), 0);
  const weeksLeft = (days: number): number => Math.max(0, Math.round(days / 7));

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', gap: 4 }}>
      <table className="w95-table">
        <thead>
          <tr><th>Консоль</th><th>Компания</th><th>Статус</th><th>База</th><th>Лицензия</th><th></th></tr>
        </thead>
        <tbody>
          {allConsoles(meta, game).map((c) => {
            const cs = game.consoles[c.id];
            if (!cs) return null;
            const isOwn = c.id.startsWith('own-');
            // аудит-51 03-P2-5: снятую консоль с купленной лицензией не скрываем — иначе игрок
            // «теряет» платформу (и деньги за лицензию) без единого объяснения
            const retired = cs.removedAtWeek !== null && cs.removedAtWeek <= game.week;
            if (retired && !cs.licensed && !isOwn) return null;

            // таймер снятия (дата известна заранее; слух в журнале — за 3 недели)
            const removedDay = Array.isArray(c.removed) ? dateToDay(c.removed as [number, number, number]) : null;
            const retireIn = removedDay !== null && cs.removedAtWeek === null ? removedDay - game.week : null;

            let status = <span className="w95-hint">недоступна</span>;
            let buyDisabled = true;
            let buyTitle = '';
            if (retired && !isOwn) {
              status = (
                <>
                  ❌ снята с производства
                  <div className="w95-hint">лицензия больше не даёт проектов — новые игры на ней не выпустить</div>
                </>
              );
            } else if (isOwn) {
              status = <span style={{ color: '#008000' }}>✓ ваша консоль</span>;
            } else if (cs.licensed) {
              status = <span style={{ color: '#008000' }}>✓ куплена</span>;
            } else if (Array.isArray(c.unlock)) {
              // рыночная консоль: либо уже в продаже, либо известна дата появления
              const day = dateToDay(c.unlock as [number, number, number]);
              if (day <= game.week) {
                status = <>доступна</>;
                buyDisabled = game.money < c.licenseCost;
                buyTitle = buyDisabled ? `Нужно ${fmtK(c.licenseCost)}` : `Купить за ${fmtK(c.licenseCost)}`;
              } else {
                status = <>🕐 появится <b>{dateLabel(day)}</b> (через {weeksLeft(day - game.week)} нед.)</>;
              }
            } else {
              // событийная консоль: порог по наградам (прогресс — из состояния партии)
              const req = EVENT_CONSOLE_REQ[c.id];
              if (cs.availableAtWeek !== null) {
                status = <>доступна</>;
                buyDisabled = game.money < c.licenseCost;
                buyTitle = buyDisabled ? `Нужно ${fmtK(c.licenseCost)}` : `Купить за ${fmtK(c.licenseCost)}`;
              } else if (req) {
                const need: string[] = [`Гран-при ${game.awards.grand}/${req.grand}`];
                if (req.units) need.push(`лучшая игра ${unitsLabel(bestUnits)}/${unitsLabel(req.units)}`);
                status = <span className="w95-hint">🏆 нужно: {need.join(' · ')}</span>;
              }
            }

            return (
              <tr key={c.id}>
                <td><b>{c.name}</b> <span className="w95-hint">×{c.costMult}</span></td>
                <td>{c.company}</td>
                <td>
                  {status}
                  {retireIn !== null && !isOwn && (
                    <div className="w95-hint" style={{ color: retireIn <= 21 ? '#c00000' : undefined }}>
                      {retireIn <= 0 ? 'снятие на этой неделе' : `снятие через ${weeksLeft(retireIn)} нед.`}
                      {cs.licensed ? ' — успейте выпустить игру' : ''}
                    </div>
                  )}
                </td>
                <td>{fmtK(cs.base)}</td>
                <td>{isOwn ? '—' : c.licenseCost === 0 ? 'бесплатно' : fmtK(c.licenseCost)}</td>
                <td>
                  {!cs.licensed && (
                    <button
                      className="w95-btn"
                      data-autopilot={`lic-${c.id}`}
                      disabled={buyDisabled}
                      title={buyTitle || undefined}
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
      <div className="w95-hint">
        О снятии с производства предупреждают заранее — в последние 3 недели отсчёт краснеет; о новинках — тоже за 3 недели.
        После снятия консоль с купленной лицензией остаётся в списке, но новые проекты на ней невозможны.
        База консоли растёт с каждым релизом под неё.
      </div>
      <OwnConsolePanel />
    </div>
  );
}
