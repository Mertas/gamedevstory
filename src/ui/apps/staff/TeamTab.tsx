// ─── Найм: вкладка «Команда» — таблица сотрудников (UI-08; смена профессии — во вкладке «Профессии») ───
import { CONFIG } from '../../../core/config';
import { CAREER_LABELS } from '../../careers';
import { AV, StaffAvatar } from '../../StaffAvatar';
import { actionBuySeat, actionFire, actionLevelUp, useGame } from '../../store';
import { nextSeatPrice } from '../../../core/systems/hierarchy';
import { useWindows } from '../../wm';
import { staffWinId } from './StaffWindow';
import { fmtK } from '../../../shared/nums';

export function TeamTab() {
  const game = useGame();
  const wm = useWindows();

  return (
    <>
      <div className="w95-row">
        <b>Команда ({game.staff.length}/{game.seats ?? CONFIG.STAFF_SEATS_BASE})</b>
        <button className="w95-btn" onClick={() => actionBuySeat()} disabled={game.money < nextSeatPrice(game)} data-autopilot="buy-seat">
          💺 Купить место ({fmtK(nextSeatPrice(game))})
        </button>
      </div>
      <table className="w95-table hire-team">
        <thead>
          <tr><th>Сотрудник</th><th>Профессия</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>POWER</th><th>Зарплата</th><th>Действия</th><th></th></tr>
        </thead>
        <tbody>
          {game.staff.map((st) => {
            const lv = st.careers[st.activeCareer] ?? 0;
            const price = CONFIG.LEVEL_PR[st.activeCareer]?.[lv - 1];
            return (
              // аудит-51 03-P3-7в: клик по строке открывает окно сотрудника (как иконка на столе)
              <tr key={st.id} style={{ cursor: 'pointer' }} title="Открыть окно сотрудника" onClick={() => wm.open(staffWinId(st.id))}>
                <td>
                  <span className="w95-row">
                    <StaffAvatar staff={st} variant={AV.hireTeam} />
                    {st.name}{(st.restDays ?? 0) > 0 && <span title={`В отпуске ещё ${st.restDays} дн.`}> 🧳</span>}
                  </span>
                </td>
                <td>{CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv{lv}</td>
                <td>{st.stats.program}</td>
                <td>{st.stats.scenario}</td>
                <td>{st.stats.graphics}</td>
                <td>{st.stats.sound}</td>
                <td>{st.power}/{st.maxPower}</td>
                <td>{fmtK(st.salary * Math.pow(1.2, st.levelUps))}</td>
                <td>
                  {price && lv < 5 && (
                    <button className="w95-btn" disabled={game.research < price} data-autopilot={`lvl-${st.id}`} onClick={() => actionLevelUp(st.id)} title={`${price} PR`}>
                      ⬆ Lv{lv + 1} ({price})
                    </button>
                  )}
                </td>
                <td>
                  {/* PLAN-48: ГГ не увольняется; партнёр — только два варианта (кнопка ведёт в его окно) */}
                  {st.hero ? (
                    <span className="w95-hint" title={st.gender === 'F' ? 'Основательница студии — уволить нельзя' : 'Основатель студии — уволить нельзя'}>🛡️</span>
                  ) : typeof st.partnerPct === 'number' ? (
                    <button className="w95-btn" title="Расставание с партнёром: выкуп доли или доля дохода" onClick={() => wm.open(staffWinId(st.id))}>Уволить…</button>
                  ) : game.staff.length > 2 ? (
                    <button className="w95-btn" data-autopilot={`fire-${st.id}`} onClick={() => actionFire(st.id)}>Уволить</button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
