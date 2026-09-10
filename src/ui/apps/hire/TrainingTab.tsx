// ─── Найм: вкладка «Обучение» — тренинги сотрудников (UI-08) ───
import { useState } from 'react';
import { StaffCard } from '../../StaffCard';
import { actionTrain, useGame, useMeta } from '../../store';

export function TrainingTab() {
  const game = useGame();
  const meta = useMeta();
  const [trainStaffId, setTrainStaffId] = useState('');

  return (
    <>
      <div className="w95-hint" style={{ marginBottom: 2 }}>Сотрудник на тренинг:</div>
      <div className="w95-staff-grid">
        {game.staff.map((st) => (
          <StaffCard
            key={st.id}
            st={st}
            selected={trainStaffId === st.id}
            disabled={st.power < 1}
            onClick={() => setTrainStaffId(st.id)}
          />
        ))}
      </div>
      <table className="w95-table">
        <thead>
          <tr><th>Тренинг</th><th>Цена</th><th>POWER</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th>Офис</th><th></th></tr>
        </thead>
        <tbody>
          {meta.trainings.map((t) => (
            <tr key={t.id}>
              <td>{t.nameRu ?? t.name}</td>
              <td>{Math.round((t.costWan ?? 0) / 10)}K</td>
              <td>−{t.power ?? 0}</td>
              <td>{t.program ?? '—'}</td>
              <td>{t.scenario ?? '—'}</td>
              <td>{t.graphics ?? '—'}</td>
              <td>{t.sound ?? '—'}</td>
              <td>{t.office}</td>
              <td>
                <button
                  className="w95-btn"
                  data-autopilot={`train-${t.id}`}
                  disabled={!trainStaffId || game.officeLevel < (t.office ?? 1)}
                  onClick={() => actionTrain(trainStaffId, t.id)}
                >
                  Обучить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="w95-hint">Тренинги открывают новые типы игр (например, «чтение» → фэнтези).</div>
    </>
  );
}
