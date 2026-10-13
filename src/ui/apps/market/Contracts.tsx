// ─── Контракты ───
import { useState } from 'react';
import { actionTakeContract, useGame, useMeta } from '../../store';
import { fmtInt, fmtK } from '../../../shared/nums';
import { CONFIG } from '../../../core/config';
import { contractForecast } from '../../../core/formulas';
import { dateLabel } from '../../../shared/meta';

const AXIS_RU = { program: 'Программирование', scenario: 'Сценарий', graphics: 'Графика', sound: 'Звук' } as const;
const dec1 = (n: number) => String(Math.round(n * 10) / 10);

export function ContractsApp() {
  const game = useGame();
  const meta = useMeta();
  const [selId, setSelId] = useState<number | null>(null);
  const [team, setTeam] = useState<string[]>([]);

  const sel = meta.contracts.find((c) => c.id === selId);
  // M9: кулдаун повтора и занятость — один источник с движком (CONFIG, busyStaffIds)
  const cdDays = CONFIG.CONTRACT_COOLDOWN_WEEKS * 7;
  const busy = new Set(game.contracts.filter((c) => !c.done).flatMap((c) => c.staffIds));

  // аудит-51 03-P2-4: заказы чужих офисов не рисуем (plan/40 «недоступное не рисуется»)
  const avail = meta.contracts.filter((c) => (c.office ?? 1) <= game.officeLevel);
  // прогноз бригады — те же формулы, что у движка (contractForecast)
  const teamStaff = game.staff.filter((s) => team.includes(s.id));
  const selWeeks = sel?.weeks ?? 10;
  const fc = sel ? contractForecast(sel, selWeeks, teamStaff) : null;
  const sumStat = (k: 'program' | 'scenario' | 'graphics' | 'sound') => teamStaff.reduce((a, s) => a + s.stats[k], 0);

  const stateOf = (id: number) => {
    const active = game.contracts.find((x) => x.id === id && !x.done);
    if (active) return { active: true, cdWeeks: 0 };
    const lastDone = game.contracts
      .filter((x) => x.id === id && x.done)
      .reduce((m, x) => Math.max(m, x.finishedWeek ?? -99999), -99999);
    const left = cdDays - (game.week - lastDone);
    return { active: false, cdWeeks: left > 0 ? Math.ceil(left / 7) : 0 };
  };

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <b>Активные контракты</b>
      {game.contracts.filter((c) => !c.done).length === 0 && (
        <div className="w95-hint">Нет активных заказов.</div>
      )}
      {game.contracts.filter((c) => !c.done).map((c) => (
        <div key={c.id} className="w95-bevel-in" style={{ padding: 4, marginBottom: 4 }}>
          <b>{meta.contracts.find((m) => m.id === c.id)?.nameRu ?? c.name}</b> — дедлайн: {dateLabel(c.deadline)}
          <div className="w95-hint">
            П: {Math.round(c.progress.program)} · С: {Math.round(c.progress.scenario)} · Г: {Math.round(c.progress.graphics)} · З: {Math.round(c.progress.sound)}
          </div>
        </div>
      ))}

      <b>Доступные заказы</b>
      <table className="w95-table">
        <thead>
          <tr><th>Заказ</th><th>Срок</th><th>Требования</th><th>Награда</th><th></th></tr>
        </thead>
        <tbody>
          {avail.map((c) => {
            const st = stateOf(c.id);
            return (
              <tr key={c.id}>
                <td>{c.nameRu ?? c.name}</td>
                <td>{c.weeks} нед. ({(c.weeks ?? 0) * 7} дн.)</td>
                <td className="w95-hint">
                  П{c.reqProgram ?? '—'} С{c.reqScenario ?? '—'} Г{c.reqGraphics ?? '—'} З{c.reqSound ?? '—'}
                </td>
                <td>{fmtInt(c.rewardMin ?? 0)}–{fmtK(c.rewardMax ?? 0)} + {c.prMin ?? 0}–{c.prMax ?? 0} PR</td>
                <td>
                  {st.active
                    ? <span className="w95-hint">в работе</span>
                    : st.cdWeeks > 0
                      ? <span className="w95-hint">повтор через {st.cdWeeks} нед.</span>
                      : selId === c.id
                        ? <button className="w95-btn" onClick={() => setSelId(null)}>отмена</button>
                        : <button className="w95-btn" onClick={() => setSelId(c.id)}>Взять</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sel && (
      <div className="w95-bevel-in" style={{ padding: 6 }}>
      <b>{sel.nameRu ?? sel.name}</b> — назначьте 1–{CONFIG.CONTRACT_MAX_STAFF} сотрудников:
          <div className="w95-hint">⚠ Пока контракт не сдан, назначенные не работают над текущей игрой.</div>
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {game.staff.map((st) => {
              const onContract = busy.has(st.id);
              return (
                <label key={st.id} className="w95-row" title={onContract ? 'Уже занят на контракте' : undefined}>
                  <input
                    type="checkbox"
                    disabled={onContract}
                    checked={team.includes(st.id)}
                    onChange={(e) => setTeam((t) => (e.target.checked ? [...t, st.id] : t.filter((x) => x !== st.id)))}
                  />
                  {st.name}{onContract ? ' (на контракте)' : ''}
                </label>
              );
            })}
          </div>
          {/* аудит-51 03-P2-4: прогноз бригады — суммы статов, темп узкой оси и вердикт по сроку */}
          {team.length === 0 ? (
            <div className="w95-hint" data-contract-forecast>Отметьте сотрудников — покажу прогноз: успеют ли к сроку.</div>
          ) : fc && !Number.isFinite(fc.need) ? (
            <div className="w95-hint" data-contract-forecast style={{ color: '#c00000' }}>
              ⚠ «{AXIS_RU[fc.bottleneck ?? 'program']}» у этой бригады не растёт — заказ так не закрыть.
            </div>
          ) : fc && (
            <div className="w95-hint" data-contract-forecast style={fc.fits ? { color: '#008000' } : { color: '#c00000' }}>
              Σ бригады: Пр {sumStat('program')} · Ск {sumStat('scenario')} · Гр {sumStat('graphics')} · Зв {sumStat('sound')}.
              {fc.bottleneck ? ` Узкое место — ${AXIS_RU[fc.bottleneck]}: +${dec1(fc.perWeek)}/нед из ${fc.req} → ≈${dec1(fc.need)} нед.` : ''}
              {fc.fits ? ` Срок ${selWeeks} нед. — успевают.` : ` Срок ${selWeeks} нед. — не успевают: добавьте людей.`}
            </div>
          )}
          <button
            className="w95-btn"
            disabled={team.length === 0 || team.length > CONFIG.CONTRACT_MAX_STAFF}
            onClick={() => { actionTakeContract(sel.id, team); setSelId(null); setTeam([]); }}
          >
            Начать работу
          </button>
        </div>
      )}
    </div>
  );
}
