// ─── Контракты ───
import { useState } from 'react';
import { actionTakeContract, useGame, useMeta } from '../../store';

export function ContractsApp() {
  const game = useGame();
  const meta = useMeta();
  const [selId, setSelId] = useState<number | null>(null);
  const [team, setTeam] = useState<string[]>([]);

  const sel = meta.contracts.find((c) => c.id === selId);

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <b>Активные контракты</b>
      {game.contracts.filter((c) => !c.done).length === 0 && (
        <div className="w95-hint">Нет активных заказов.</div>
      )}
      {game.contracts.filter((c) => !c.done).map((c) => (
        <div key={c.id} className="w95-bevel-in" style={{ padding: 4, marginBottom: 4 }}>
          <b>{meta.contracts.find((m) => m.id === c.id)?.nameRu ?? c.name}</b> — дедлайн: день {c.deadline}
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
          {meta.contracts.map((c) => (
            <tr key={c.id}>
              <td>{c.nameRu ?? c.name}</td>
              <td>{Math.round((c.weeks ?? 0) * 7)} дн.</td>
              <td className="w95-hint">
                П{c.reqProgram ?? '—'} С{c.reqScenario ?? '—'} Г{c.reqGraphics ?? '—'} З{c.reqSound ?? '—'}
              </td>
              <td>{c.rewardMin ?? 0}–{c.rewardMax ?? 0}K + {c.prMin ?? 0}–{c.prMax ?? 0} PR</td>
              <td>
                {selId === c.id ? (
                  <button className="w95-btn" onClick={() => setSelId(null)}>отмена</button>
                ) : (
                  <button className="w95-btn" onClick={() => setSelId(c.id)}>Взять</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sel && (
      <div className="w95-bevel-in" style={{ padding: 6 }}>
      <b>{sel.nameRu ?? sel.name}</b> — назначьте 1–3 сотрудников:
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {game.staff.map((st) => (
              <label key={st.id} className="w95-row">
                <input
                  type="checkbox"
                  checked={team.includes(st.id)}
                  onChange={(e) => setTeam((t) => (e.target.checked ? [...t, st.id] : t.filter((x) => x !== st.id)))}
                />
                {st.name}
              </label>
            ))}
          </div>
          <button
            className="w95-btn"
            disabled={team.length === 0 || team.length > 3}
            onClick={() => { actionTakeContract(sel.id, team); setSelId(null); setTeam([]); }}
          >
            Начать работу
          </button>
        </div>
      )}
    </div>
  );
}
