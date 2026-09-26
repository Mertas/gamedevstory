// ─── Найм: вкладка «Команда» — таблица сотрудников (UI-08; смена профессии — во вкладке «Профессии») ───
import { CONFIG } from '../../../core/config';
import { CAREER_LABELS } from '../../careers';
import { StaffAvatar } from '../../StaffAvatar';
import { actionFire, actionLevelUp, useGame } from '../../store';
import { fmtK } from '../../../shared/nums';

export function TeamTab() {
  const game = useGame();

  return (
    <>
      <b>Команда ({game.staff.length}/{CONFIG.OFFICE_CAPACITY[game.officeLevel]})</b>
      <table className="w95-table">
        <thead>
          <tr><th>Сотрудник</th><th>Профессия</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>POWER</th><th>Зарплата</th><th>Действия</th><th></th></tr>
        </thead>
        <tbody>
          {game.staff.map((st) => {
            const lv = st.careers[st.activeCareer] ?? 0;
            const price = CONFIG.LEVEL_PR[st.activeCareer]?.[lv - 1];
            return (
              <tr key={st.id}>
                <td>
                  <span className="w95-row">
                    <StaffAvatar staff={st} size={20} />
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
                  {game.staff.length > 2 && (
                    <button className="w95-btn" data-autopilot={`fire-${st.id}`} onClick={() => actionFire(st.id)}>Уволить</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
