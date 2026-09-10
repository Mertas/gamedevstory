// ─── Найм: «Поиск сотрудников» — методы, кандидаты, трудоустройство (UI-08) ───
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import type { HireMethodId } from '../../../core/config';
import { candidatePool } from '../../../shared/meta';
import { CAREER_LABELS } from '../../careers';
import { actionHire, useGame, useMeta } from '../../store';

const METHOD_LABELS: Record<HireMethodId, string> = {
  'word-of-mouth': 'По знакомству ($50K)',
  magazine: 'Объявление в журнале ($120K)',
  online: 'Объявление в интернете ($550K)',
  vocational: 'Профучилище ($800K)',
  'open-house': 'День открытых дверей ($1,800K)',
  hollywood: 'Голливуд ($3,500K)',
};

export function SearchTab() {
  const game = useGame();
  const meta = useMeta();
  const [method, setMethod] = useState<HireMethodId>('word-of-mouth');
  const cfg = CONFIG.HIRE_METHODS[method];
  const pool = candidatePool(game, meta, cfg.pool);
  const officeCap = CONFIG.OFFICE_CAPACITY[game.officeLevel] ?? 4;
  const officeFull = game.staff.length >= officeCap;
  const candidates = pool.slice(0, 3).map((id) => meta.staff.find((d) => d.id === id)).filter(Boolean);

  return (
    <>
      <b>Поиск сотрудников</b>
      <div className="w95-field">
        {(Object.keys(CONFIG.HIRE_METHODS) as HireMethodId[]).map((m) => (
          <div key={m} className="w95-li" style={{ padding: '1px 4px' }}>
            <label className="w95-row">
              <input
                type="radio" checked={method === m} onChange={() => setMethod(m)}
                disabled={game.officeLevel < CONFIG.HIRE_METHODS[m].office}
              />
              {METHOD_LABELS[m]}
              {game.officeLevel < CONFIG.HIRE_METHODS[m].office && <span className="w95-hint">(нужен офис {CONFIG.HIRE_METHODS[m].office})</span>}
            </label>
          </div>
        ))}
      </div>
      {candidates.length > 0 && (
        <>
          <div className="w95-hint">Кандидаты ({cfg.pool.join(', ')}) — нажмите «Нанять» под нужным:</div>
          <table className="w95-table">
            <tbody>
              {candidates.map((c) => c && (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{CAREER_LABELS[c.activeCareer] ?? c.activeCareer}</td>
                  <td>П{c.stats.program} С{c.stats.scenario} Г{c.stats.graphics} З{c.stats.sound}</td>
                  <td>взнос {Math.round(c.hireFee)}K</td>
                  <td>{Math.round(c.salary)}K/год</td>
                  <td>
                    <button
                      className="w95-btn"
                      data-autopilot={`hire-${c.id}`}
                      disabled={officeFull || game.money < cfg.cost + c.hireFee}
                      onClick={() => actionHire(method, c.id)}
                      title={officeFull ? 'Офис заполнен — купите офис больше' : game.money < cfg.cost + c.hireFee ? `Нужно ${cfg.cost + Math.round(c.hireFee)}K` : `Нанять за ${cfg.cost + Math.round(c.hireFee)}K`}
                    >
                      Нанять
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="w95-hint">
            Поиск {cfg.cost}K; при найме спишется взнос. Кандидаты после найма/увольнения больше не появляются.
          </div>
        </>
      )}
      {candidates.length === 0 && <div className="w95-hint">Кандидатов по этому методу больше нет.</div>}
    </>
  );
}
