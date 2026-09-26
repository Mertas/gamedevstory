// ─── Найм: вкладка «Профессии» — справка + полное управление профессиями ───
// Свободная смена — только на высшие профессии (director/producer/hw/hacker) и по уровням
// на том же сотруднике; руководство из запаса (продавец) снимает любые требования.
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import type { CareerId } from '../../../core/data/schema';
import { CAREER_LABELS } from '../../careers';
import { actionApplyCareerManual, actionChangeCareer, useGame, useMeta } from '../../store';

const ALL_CAREERS = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'] as const;
const ADVANCED = ['director', 'producer', 'hw', 'hacker'];
const isAdvanced = (c: string) => ADVANCED.includes(c);
const lvIn = (careers: Record<CareerId, number>, c: string) => careers[c as CareerId] ?? 0;

export function ProfessionsTab() {
  const game = useGame();
  const meta = useMeta();
  const [staffId, setStaffId] = useState('');
  const [target, setTarget] = useState<string>('director');
  const st = game.staff.find((x) => x.id === staffId);
  const manuals = game.careerManuals ?? 0;
  const reqs = Object.entries(CONFIG.CAREER_PREREQ[target] ?? {});
  const reqsMet = !!st && reqs.every(([job, lv]) => lvIn(st.careers, job) >= lv);
  const sameCareer = !!st && st.activeCareer === target;

  return (
    <>
      <b>👔 Профессии</b>
      <div className="w95-hint">
        Профессия задаёт, что сотрудник делает лучше, и открывает жанры и темы. Свободная смена — только на
        высшие профессии (директор, продюсер, железо, хакер) и по уровням на том же сотруднике. Руководство
        (продавец, май) снимает любые требования — для любой профессии.
      </div>

      <div className="w95-row">
        <span>📘 Руководств в запасе: <b>{manuals}</b></span>
        <span className="w95-hint" style={{ color: '#c00000' }}>
          {game.salesmanHere ? 'продавец здесь — купить во вкладке «Продавец»' : 'продавец приходит в первую неделю мая (с года 2)'}
        </span>
      </div>

      <b>Смена профессии</b>
      <div className="w95-row">
        <select className="w95-input" value={staffId} onChange={(e) => setStaffId(e.target.value)} data-autopilot="career-staff">
          <option value="">— сотрудник —</option>
          {game.staff.map((s2) => (
            <option key={s2.id} value={s2.id}>
              {s2.name} ({CAREER_LABELS[s2.activeCareer] ?? s2.activeCareer} Lv{lvIn(s2.careers, s2.activeCareer)})
            </option>
          ))}
        </select>
        <select className="w95-input" value={target} onChange={(e) => setTarget(e.target.value)} data-autopilot="career-target">
          {ALL_CAREERS.map((c) => (
            <option key={c} value={c}>{CAREER_LABELS[c] ?? c}{isAdvanced(c) ? '' : ' (только по руководству)'}</option>
          ))}
        </select>
      </div>

      {!st && <div className="w95-hint">Выберите сотрудника — покажу условия и кнопки смены.</div>}

      {st && sameCareer && (
        <div className="w95-hint">{st.name} уже {CAREER_LABELS[target] ?? target} — выберите другую профессию.</div>
      )}

      {st && !sameCareer && (
        <div className="w95-panel" style={{ gap: 3 }}>
          {isAdvanced(target) ? (
            <>
              <div className="w95-row">
                {reqs.length === 0 ? (
                  <span className="w95-hint">Требований нет — можно менять свободно.</span>
                ) : (
                  reqs.map(([job, lv]) => {
                    const have = lvIn(st.careers, job);
                    const ok = have >= lv;
                    return (
                      <span key={job} className="w95-hint" style={{ color: ok ? '#008000' : '#c00000' }}>
                        {CAREER_LABELS[job] ?? job} Lv{lv} — у сотрудника Lv{have} {ok ? '✓' : '✗'}
                      </span>
                    );
                  })
                )}
              </div>
              <div className="w95-row">
                <button
                  className="w95-btn"
                  data-autopilot="career-change"
                  disabled={!reqsMet}
                  onClick={() => actionChangeCareer(st.id, target)}
                >
                  Сменить: {CAREER_LABELS[st.activeCareer] ?? st.activeCareer} → {CAREER_LABELS[target] ?? target}
                </button>
                <span className="w95-hint">
                  {reqsMet ? 'все условия выполнены' : 'не хватает уровней — можно применить руководство'}
                </span>
              </div>
            </>
          ) : (
            <div className="w95-hint">На базовую профессию свободной смены нет — только по руководству.</div>
          )}
          <div className="w95-row">
            <button
              className="w95-btn"
              data-autopilot="career-manual"
              disabled={manuals <= 0}
              onClick={() => actionApplyCareerManual(st.id, target)}
            >
              Применить руководство ({manuals})
            </button>
            <span className="w95-hint">
              {manuals <= 0 ? 'запаса нет — купите у продавца' : 'сменит профессию без требований, запас −1'}
            </span>
          </div>
        </div>
      )}

      <b>Справка по профессиям</b>
      <table className="w95-table">
        <thead>
          <tr><th>Профессия</th><th>Вход</th><th>Открывает (жанры / темы)</th><th>Повышения: PR за уровень</th></tr>
        </thead>
        <tbody>
          {ALL_CAREERS.map((c) => {
            const req = Object.entries(CONFIG.CAREER_PREREQ[c] ?? {});
            const opens = [
              ...meta.genres.filter((g) => g.unlockJob === c && g.unlockLevel).map((g) => `🎮 ${g.ru ?? g.name} (Lv${g.unlockLevel})`),
              ...meta.types.filter((t) => t.unlockJob === c && t.unlockLevel).map((t) => `📦 ${t.nameRu ?? t.name} (Lv${t.unlockLevel})`),
            ];
            const pr = CONFIG.LEVEL_PR[c] ?? [];
            const mine = game.staff.filter((s2) => s2.activeCareer === c);
            return (
              <tr key={c}>
                <td style={{ verticalAlign: 'top' }}>
                  {CAREER_LABELS[c] ?? c}
                  {mine.length > 0 && (
                    <span className="w95-hint"> — {mine.map((m) => `${m.name} Lv${lvIn(m.careers, c)}`).join(', ')}</span>
                  )}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {isAdvanced(c)
                    ? (req.length > 0 ? `${req.map(([j, lv]) => `${CAREER_LABELS[j] ?? j} Lv${lv}`).join(' + ')} (свободно) / по руководству` : 'свободно')
                    : 'по руководству'}
                </td>
                <td style={{ verticalAlign: 'top' }}>{opens.length > 0 ? opens.join(', ') : '—'}</td>
                <td style={{ verticalAlign: 'top' }}>{pr.join(' → ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">«Открывает» — если профессия нужного уровня есть у любого сотрудника; повышения — цена Lv1→5 в PR (кнопка ⬆ во вкладке «Команда»).</div>
    </>
  );
}
