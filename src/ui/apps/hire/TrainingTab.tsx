// ─── Найм: вкладка «Обучение» — тренинги сотрудников (UI-08) ───
// PLAN-41: прирост показан с масштабом от порогов выбранного сотрудника.
import { useState } from 'react';
import { StaffCard } from '../../StaffCard';
import { actionTrain, useGame, useMeta } from '../../store';
import { fmtK } from '../../../shared/nums';
import { effTrainDelta, type StatKey } from '../../../shared/train';

export function TrainingTab() {
  const game = useGame();
  const meta = useMeta();
  const [trainStaffId, setTrainStaffId] = useState('');
  const sel = game.staff.find((x) => x.id === trainStaffId);

  return (
    <>
      <div className="w95-hint" style={{ marginBottom: 2 }}>Сотрудник на тренинг:</div>
      <div className="w95-staff-grid">
        {game.staff.map((st) => (
          <StaffCard
            key={st.id}
            st={st}
            selected={trainStaffId === st.id}
            disabled={st.power < 1 || (st.restDays ?? 0) > 0}
            onClick={() => setTrainStaffId(st.id)}
          />
        ))}
      </div>
      <table className="w95-table">
        <thead>
          <tr><th>Тренинг</th><th>Цена</th><th>POWER</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>Офис</th><th></th></tr>
        </thead>
        <tbody>
          {meta.trainings.map((t) => {
            const cell = (k: StatKey, v: number | null | undefined) => {
              if (v == null || v === 0) return <span className="w95-hint">—</span>;
              const d = sel ? effTrainDelta(v, sel.caps[k]) : v;
              return <span style={{ color: d > 0 ? '#1a7a1a' : d < 0 ? '#c00000' : undefined }}>{d > 0 ? '+' : ''}{d}</span>;
            };
            return (
              <tr key={t.id}>
                <td>{t.nameRu ?? t.name}</td>
                <td>{fmtK((t.costWan ?? 0) / 10)}</td>
                <td>−{t.power ?? 0}</td>
                <td>{cell('program', t.program)}</td>
                <td>{cell('scenario', t.scenario)}</td>
                <td>{cell('graphics', t.graphics)}</td>
                <td>{cell('sound', t.sound)}</td>
                <td>{t.office}</td>
                <td>
                  <button
                    className="w95-btn"
                    data-autopilot={`train-${t.id}`}
                    disabled={!trainStaffId || game.officeLevel < (t.office ?? 1) || (sel?.restDays ?? 0) > 0}
                    onClick={() => actionTrain(trainStaffId, t.id)}
                  >
                    Обучить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">Тренинги открывают новые типы игр (например, «чтение» → фэнтези).{sel ? ' Прирост растёт вместе с порогами сотрудника (×порог/100).' : ' Выберите сотрудника — покажем прирост с учётом его порогов.'}</div>
    </>
  );
}
