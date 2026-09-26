// ─── Найм: вкладка «Профессии» — справка + смена по руководству ───
// Смена профессии — ТОЛЬКО по руководству продавца (запас) и только когда выполнены требования
// профессии. База (кодер/сценарист/дизайнер/звукорежиссёр) — без требований. Руководство
// требования НЕ снимает. Полное превью порогов — в окне сотрудника.
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import type { CareerId } from '../../../core/data/schema';
import { CAREER_LABELS } from '../../careers';
import { actionApplyCareerManual, useGame, useMeta } from '../../store';

const ALL_CAREERS = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'] as const;
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
        Профессия задаёт, что сотрудник делает лучше, и открывает жанры и темы. Смена — только по
        руководству (продавец, май) и только когда требования профессии выполнены; руководство
        требования не снимает. База (кодер, сценарист, дизайнер, звукорежиссёр) — без требований.
        Сменить можно и из окна сотрудника — там видно, как изменятся пороги.
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
            <option key={c} value={c}>{CAREER_LABELS[c] ?? c}</option>
          ))}
        </select>
      </div>

      {!st && <div className="w95-hint">Выберите сотрудника — покажу требования и кнопку смены.</div>}

      {st && sameCareer && (
        <div className="w95-hint">{st.name} уже {CAREER_LABELS[target] ?? target} — выберите другую профессию.</div>
      )}

      {st && !sameCareer && (
        <div className="w95-panel" style={{ gap: 3 }}>
          <div className="w95-row">
            {reqs.length === 0 ? (
              <span className="w95-hint">Базовая профессия — требований нет, нужно только руководство.</span>
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
              data-autopilot="career-manual"
              disabled={manuals <= 0 || !reqsMet}
              onClick={() => actionApplyCareerManual(st.id, target)}
            >
              Применить руководство ({manuals})
            </button>
            <span className="w95-hint">
              {manuals <= 0 ? 'запаса нет — купите у продавца' : !reqsMet ? 'сначала выполните требования профессии' : 'сменит профессию, запас −1'}
            </span>
          </div>
        </div>
      )}

      <b>Справка по профессиям</b>
      <table className="w95-table">
        <thead>
          <tr><th>Профессия</th><th>Требования для смены</th><th>Открывает (жанры / темы)</th><th>Повышения: PR за уровень</th></tr>
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
                  {req.length > 0 ? req.map(([j, lv]) => `${CAREER_LABELS[j] ?? j} Lv${lv}`).join(' + ') : '— (базовая)'}
                </td>
                <td style={{ verticalAlign: 'top' }}>{opens.length > 0 ? opens.join(', ') : '—'}</td>
                <td style={{ verticalAlign: 'top' }}>{pr.join(' → ')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="w95-hint">Смена — только по руководству и при выполненных требованиях. «Открывает» — если профессия нужного уровня есть у любого сотрудника; повышения — цена Lv1→5 в PR (кнопка ⬆ во вкладке «Команда»).</div>
    </>
  );
}
