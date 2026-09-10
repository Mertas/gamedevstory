// ─── Найм: вкладка «Команда» — таблица сотрудников и смена профессии (UI-08) ───
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import { CAREER_LABELS } from '../../careers';
import { actionChangeCareer, actionFire, actionLevelUp, useGame } from '../../store';

export function TeamTab() {
  const game = useGame();
  const [careerFor, setCareerFor] = useState<string>('');
  const s = game.staff.find((x) => x.id === careerFor);

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
                    {st.avatar ? <img src={st.avatar} alt="" style={{ width: 20, height: 20 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
                    {st.name}
                  </span>
                </td>
                <td>{CAREER_LABELS[st.activeCareer] ?? st.activeCareer} Lv{lv}</td>
                <td>{st.stats.program}</td>
                <td>{st.stats.scenario}</td>
                <td>{st.stats.graphics}</td>
                <td>{st.stats.sound}</td>
                <td>{st.power}/{st.maxPower}</td>
                <td>{Math.round(st.salary * Math.pow(1.2, st.levelUps))}K</td>
                <td>
                  {price && lv < 5 && (
                    <button className="w95-btn" disabled={game.research < price} data-autopilot={`lvl-${st.id}`} onClick={() => actionLevelUp(st.id)} title={`${price} PR`}>
                      ⬆ Lv{lv + 1} ({price})
                    </button>
                  )}
                </td>
                <td>
                  {game.staff.length > 2 && (
                    <button className="w95-btn" onClick={() => actionFire(st.id)}>Уволить</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-row">
        <span className="w95-hint">Смена профессии (нужны уровни на этом сотруднике):</span>
        <select className="w95-input" value={careerFor} onChange={(e) => setCareerFor(e.target.value)}>
          <option value="">— сотрудник —</option>
          {game.staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        <select className="w95-input" onChange={(e) => { if (careerFor && e.target.value) actionChangeCareer(careerFor, e.target.value); e.target.value = ''; }}>
          <option value="">— новая профессия —</option>
          {['director', 'producer', 'hw', 'hacker'].map((c) => <option key={c} value={c}>{CAREER_LABELS[c] ?? c}</option>)}
        </select>
        {s && <span className="w95-hint">требования: {Object.entries(CONFIG.CAREER_PREREQ[s.activeCareer] ?? {}).map(([j, lv]) => `${CAREER_LABELS[j] ?? j} Lv${lv}`).join(' + ')}</span>}
      </div>
    </>
  );
}
