// ─── Найм: «Поиск сотрудников» — тип поиска (платно) → список кандидатов → найм (UI-08, M7) ───
// Клик по кандидату показывает мини-карточку (профессии — обязательно; запрос игрока 28.09.2026).
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import type { HireMethodId } from '../../../core/config';
import { HIRE_METHOD_LABELS, MYSTERY_IDS } from '../../../shared/hire';
import { CAREER_LABELS } from '../../careers';
import { StaffMiniCard } from '../../StaffMiniCard';
import { actionBuySeat, actionHire, actionSearch, useGame, useMeta } from '../../store';
import { fmtK } from '../../../shared/nums';

export function SearchTab() {
  const game = useGame();
  const meta = useMeta();
  const [method, setMethod] = useState<HireMethodId>('word-of-mouth');
  const [candId, setCandId] = useState<string | null>(null);
  const cfg = CONFIG.HIRE_METHODS[method];
  const seats = game.seats ?? CONFIG.STAFF_SEATS_BASE; // PLAN-53: места покупаются по одному
  const officeFull = game.staff.length >= seats;
  const search = game.activeSearch;
  const activeCfg = search ? CONFIG.HIRE_METHODS[search.method] : null;
  const rows = (search?.ids ?? []).map((id) => meta.staff.find((d) => d.id === id)).filter(Boolean);
  const picked = rows.find((c) => c && c.id === candId) ?? null;
  const pickedPersona = picked?.persona ?? null;

  return (
    <>
      <b>Поиск сотрудников</b>
      <div className="w95-hint">
        Выберите тип поиска — деньги спишутся сразу, и появится список кандидатов.
        Чем дороже поиск, тем сильнее кандидаты.
      </div>
      <div className="w95-field">
        {(Object.keys(CONFIG.HIRE_METHODS) as HireMethodId[]).map((m) => (
          <div key={m} className="w95-li" style={{ padding: '1px 4px' }} onClick={() => setMethod(m)} data-autopilot={`hire-method-${m}`}>
            <label className="w95-row">
              <input
                type="radio" checked={method === m} onChange={() => setMethod(m)}
                disabled={game.officeLevel < CONFIG.HIRE_METHODS[m].office}
              />
              {HIRE_METHOD_LABELS[m]} ({CONFIG.HIRE_METHODS[m].cost}K)
              {game.officeLevel < CONFIG.HIRE_METHODS[m].office && <span className="w95-hint">(нужен офис {CONFIG.HIRE_METHODS[m].office})</span>}
            </label>
          </div>
        ))}
      </div>
      <div className="w95-row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="w95-btn"
          data-autopilot="hire-search"
          disabled={game.money < cfg.cost}
          title={game.money < cfg.cost ? `Нужно ${cfg.cost}K` : undefined}
          onClick={() => actionSearch(method)}
        >
          🔍 Искать кандидатов ({cfg.cost}K)
        </button>
        {officeFull && (
          <span className="w95-row">
            <span className="w95-hint" style={{ color: '#c00000' }}>свободных мест нет</span>
            <button className="w95-btn" onClick={() => actionBuySeat()}>💺 Купить место</button>
          </span>
        )}
      </div>

      {search && activeCfg && (
        <>
          <div className="w95-hint">
            Список от: <b>{HIRE_METHOD_LABELS[search.method]}</b> (поиск оплачен) — найм только по взносу кандидата:
          </div>
          {rows.length > 0 ? (
            <table className="w95-table">
              <tbody>
                {rows.map((c) => c && (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer' }}
                    title="Показать карточку кандидата"
                    data-autopilot={`hire-row-${c.id}`}
                    onClick={() => setCandId((v) => (v === c.id ? null : c.id))}
                  >
                    <td>{MYSTERY_IDS.has(c.id) ? '🌟 ' : ''}{c.name}</td>
                    <td>{CAREER_LABELS[c.activeCareer as keyof typeof CAREER_LABELS] ?? c.activeCareer}</td>
                    <td>П{c.stats.program} С{c.stats.scenario} Г{c.stats.graphics} З{c.stats.sound}</td>
                    <td>взнос {fmtK(c.hireFee)}</td>
                    <td>{Math.round(c.salary)}K/год</td>
                    <td>
                      <button
                        className="w95-btn"
                        data-autopilot={`hire-${c.id}`}
                        disabled={officeFull || game.money < c.hireFee}
                        onClick={(e) => { e.stopPropagation(); actionHire(c.id); }}
                        title={officeFull ? 'Свободных мест нет — купите место' : game.money < c.hireFee ? `Нужно ${Math.round(c.hireFee)}K` : `Нанять за ${Math.round(c.hireFee)}K`}
                      >
                        Нанять
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="w95-hint">Из этого списка всех разобрали — ищите заново.</div>
          )}
          {picked && (
            <StaffMiniCard
              st={picked}
              persona={pickedPersona}
              footer={
                <div className="w95-hint" style={{ marginTop: 2 }}>
                  Взнос {fmtK(picked.hireFee)} · {Math.round(picked.salary)}K/год. Повторный клик по кандидату скрывает карточку.
                </div>
              }
            />
          )}
          <div className="w95-hint">
            Список живёт до следующего поиска: нанять можно сколько угодно, за каждого — только взнос.
            Захочешь других кандидатов — платишь за новый поиск.
          </div>
        </>
      )}
      {!search && <div className="w95-hint">Поиска ещё не было.</div>}
    </>
  );
}
