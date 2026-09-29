// PLAN-41: Окно сотрудника — персональное «приложение» на рабочем столе (иконка появляется
// при найме, исчезает при увольнении). Полное управление: статы и ПОРОГИ (caps), левелап,
// обучение (включая авто «до максимума»), отпуск, история профессий/обучения, персона.
import { useState } from 'react';
import { CONFIG } from '../../../core/config';
import { CAREER_LABELS, CAREER_ORDER } from '../../careers';
import { StaffAvatar } from '../../StaffAvatar';
import { actionApplyCareerManual, actionFire, actionLevelUp, actionRestStaff, actionTrain, actionTrainToMax, useGame, useMeta } from '../../store';
import { useWindows } from '../../wm';
import { fmtK } from '../../../shared/nums';
import { dateLabel } from '../../../shared/meta';
import { capGain, careerChangePreview, effTrainDelta, STAT_KEYS, STAT_SHORT, type StatKey } from '../../../shared/train';
import type { Staff } from '../../../core/types';
import type { CareerId } from '../../../core/data/schema';

export const STAFF_WIN_PREFIX = 'staff:';
export function staffWinId(id: string): string { return `${STAFF_WIN_PREFIX}${id}`; }
export function staffFromWinId(game: { staff: Staff[] }, winId: string): Staff | null {
  if (!winId.startsWith(STAFF_WIN_PREFIX)) return null;
  const id = winId.slice(STAFF_WIN_PREFIX.length);
  return game.staff.find((x) => x.id === id) ?? null;
}

const ROLE_RU: Record<string, string> = { proposal: 'сценарий', program: 'код', graphics: 'графика', sound: 'звук', debug: 'отладка' };
const HIST_ICON: Record<string, string> = { hire: '📥', career: '🔁', levelup: '⬆', train: '🎓', rest: '🧳', back: '✅' };

/** окно сотрудника: winId = 'staff:<id>' */
export function StaffWindow({ winId }: { winId: string }) {
  const game = useGame();
  const meta = useMeta();
  const wm = useWindows();
  const [fireArm, setFireArm] = useState(false);
  const [careerTarget, setCareerTarget] = useState<CareerId | null>(null);

  const s = staffFromWinId(game, winId);
  if (!s) return <div className="w95-hint" style={{ padding: 10 }}>Сотрудник не найден — возможно, он уволен.</div>;

  const lv = s.careers[s.activeCareer] ?? 0;
  const price = CONFIG.LEVEL_PR[s.activeCareer]?.[lv - 1];
  const salaryNow = s.salary * Math.pow(1.2, s.levelUps);
  const salaryNext = salaryNow * 1.2;
  const persona = meta.staff?.find((m) => m.id === s.id)?.persona ?? null;
  const resting = (s.restDays ?? 0) > 0;
  const busy = game.contracts.some((c) => !c.done && c.staffIds.includes(s.id));
  const ag = game.activeGame && game.activeGame.phase !== 'released' ? game.activeGame : null;
  const roles = ag ? (Object.entries(ag.assignments ?? {}) as [string, string[]][]).filter(([, ids]) => ids?.includes(s.id)).map(([r]) => ROLE_RU[r] ?? r) : [];
  const powerPct = s.maxPower > 0 ? Math.max(0, Math.min(1, s.power / s.maxPower)) : 0;
  const powerColor = powerPct > 0.5 ? '#1a7a1a' : powerPct > 0.25 ? '#b08a00' : '#c00000';
  const weights = CONFIG.CAP_GROW[s.activeCareer] ?? {};
  const manuals = game.careerManuals ?? 0;
  /** чего не хватает для смены профессии («у вас LvN» для каждого требования) */
  const careerMissing = (t: CareerId) => Object.entries(CONFIG.CAREER_PREREQ[t] ?? {})
    .filter(([job, need]) => (s.careers[job as CareerId] ?? 0) < need)
    .map(([job, need]) => `${CAREER_LABELS[job] ?? job} Lv${need} (у вас Lv${s.careers[job as CareerId] ?? 0})`);

  // статус
  let status = 'Свободен';
  if (resting) status = `🧳 В отпуске — вернётся через ${s.restDays} дн. (POWER будет полный)`;
  else if (s.homeWeeks > 0) status = `🏠 Дома (вымотался), ещё ${s.homeWeeks} нед.`;
  else if (busy) status = '📄 Занят на контракте';
  else if (ag && roles.length) status = `💻 Разработка: ${ag.name || 'проект'} (${roles.join(', ')})`;
  else if (ag) status = `💻 В офисе, на проекте не назначен`;

  const atCapAll = STAT_KEYS.every((k) => s.stats[k] >= s.caps[k]);
  const canAnyTrain = meta.trainings.some((t) => game.officeLevel >= (t.office ?? 1) && game.money >= (t.costWan ?? 0) / 10 && s.power >= 1 && !resting && STAT_KEYS.some((k) => effTrainDelta((t as unknown as Record<StatKey, number>)[k], s.caps[k]) > 0 && s.stats[k] < s.caps[k]));

  const hist = [...s.history].reverse();
  const trainRows = Object.entries(s.trainCount ?? {})
    .map(([id, a]) => ({ t: meta.trainings.find((x) => String(x.id) === id), n: a.n, gains: a.gains }))
    .filter((r) => r.t && r.n > 0)
    .sort((a, b) => b.n - a.n);
  const gainsTxt = (gains: { program: number; scenario: number; graphics: number; sound: number }) =>
    STAT_KEYS.filter((k) => (gains[k] ?? 0) > 0).map((k) => `+${gains[k]} ${STAT_SHORT[k]}`).join(', ');

  return (
    <div style={{ overflowY: 'auto', height: '100%', paddingBottom: 8 }}>
      {/* шапка: аватар + кто это */}
      <div className="arc-sec" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingTop: 6 }}>
        <div style={{ flex: 'none', width: 120, height: 120, border: '2px solid var(--w95-dark)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StaffAvatar staff={s} size={116} fallback={<span style={{ fontSize: 64 }}>{s.gender === 'F' ? '👩' : '👨'}</span>} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 'bold' }}>{s.name}</div>
          <div className="w95-hint">{CAREER_LABELS[s.activeCareer] ?? s.activeCareer} Lv{lv}{lv >= 5 ? ' (максимум)' : ''} · оклад {fmtK(salaryNow)}K/год{lv < 5 ? ` → после левелапа ${fmtK(salaryNext)}K` : ''}</div>
          <div style={{ marginTop: 2 }}>{status}</div>
          {persona && <div className="w95-hint" style={{ marginTop: 2, fontStyle: 'italic' }}>{persona}</div>}
        </div>
      </div>

      {/* POWER + отпуск */}
      <div className="arc-sec">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ flex: 'none' }}>POWER</b>
          <div className="w95-staff-power" style={{ flex: 1, margin: 0 }}><div style={{ width: `${Math.round(powerPct * 100)}%`, background: powerColor }} /></div>
          <span style={{ flex: 'none' }}>{Math.round(s.power)}/{s.maxPower}</span>
          <button
            className="w95-btn"
            disabled={resting || s.homeWeeks > 0 || busy || s.power >= s.maxPower}
            title={resting ? 'Уже отдыхает' : s.power >= s.maxPower ? 'POWER и так полный' : `Отпуск ${CONFIG.REST_DAYS} дней — вернётся с полным POWER`}
            onClick={() => actionRestStaff(s.id)}
          >
            🧳 Отправить на отдых ({CONFIG.REST_DAYS} дн.)
          </button>
        </div>
        <div className="w95-hint" style={{ marginTop: 2 }}>Отпуск: {CONFIG.REST_DAYS} дней без работы (вклада нет), по возвращении POWER полный. Обычно POWER: −1/нед на работе, +3/нед в простое.</div>
      </div>

      {/* статы и пороги */}
      <div className="arc-sec">
        <b>Характеристики и пороги</b>
        <table className="w95-table">
          <thead>
            <tr><th>Хар-ка</th><th>Сейчас</th><th></th><th>Порог</th><th>После левелапа</th></tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((k) => {
              const val = s.stats[k];
              const cap = s.caps[k];
              const maxed = val >= cap;
              const g = lv < 5 ? capGain(weights[k] ?? 0, 1, maxed) : 0;
              return (
                <tr key={k}>
                  <td>{STAT_SHORT[k]}</td>
                  <td>{val}{maxed ? ' 🎯' : ''}</td>
                  <td style={{ width: 90 }}>
                    <div className="w95-staff-power" style={{ width: 80, margin: '4px 4px 1px' }}><div style={{ width: `${cap > 0 ? Math.round((val / cap) * 100) : 0}%`, background: maxed ? '#1a7a1a' : '#000080' }} /></div>
                  </td>
                  <td>{cap}</td>
                  <td>
                    {lv < 5 && g > 0 ? (
                      <span style={{ color: maxed ? '#1a7a1a' : undefined, fontWeight: maxed ? 'bold' : undefined }}>
                        {cap} → {cap + g} (+{g}{maxed ? ', залит ×10!' : ''})
                      </span>
                    ) : (
                      <span className="w95-hint">{lv >= 5 ? 'профессия на максимуме' : '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="w95-hint">🎯 = стат залит до порога. Залей все 4 до порогов и жми левелап — пороги вырастут ×{CONFIG.CAP_MAX_BONUS}. Обучение свыше порога невозможно: растёт только порог — через уровни и первые смены профессий.</div>
      </div>

      {/* левелап */}
      <div className="arc-sec">
        <b>Повышение уровня</b>
        <div style={{ marginTop: 2 }}>
          {lv < 5 && price ? (
            <button className="w95-btn" disabled={game.research < price} onClick={() => actionLevelUp(s.id)}>
              ⬆ {CAREER_LABELS[s.activeCareer] ?? s.activeCareer} Lv{lv} → Lv{lv + 1} — {price} PR
            </button>
          ) : (
            <span className="w95-hint">Профессия прокачана до максимума (Lv5). Смена профессии — в «Найм» → «Профессии».</span>
          )}
          {lv < 5 && <span className="w95-hint" style={{ marginLeft: 8 }}>Есть {Math.round(game.research)} PR. Зарплата после левелапа ×1.2.</span>}
        </div>
      </div>

      {/* обучение */}
      <div className="arc-sec">
        <b>Обучение</b>
        <div style={{ margin: '3px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="w95-btn" disabled={!canAnyTrain} onClick={() => actionTrainToMax(s.id)} title="Сама крутит доступные методы, пока статы не упрутся в пороги (или не кончатся POWER/деньги)">
            ⚡ Тренировать до максимума
          </button>
          <span className="w95-hint">{atCapAll ? 'Все статы на порогах — пора на левелап!' : 'Прирост тренировок растёт вместе с порогами (×порог/100).'}</span>
        </div>
        <table className="w95-table">
          <thead>
            <tr><th>Тренинг</th><th>Цена</th><th>POWER</th><th>Пр</th><th>Сц</th><th>Гр</th><th>Зв</th><th></th></tr>
          </thead>
          <tbody>
            {meta.trainings.map((t) => {
              const cost = (t.costWan ?? 0) / 10;
              const off = game.officeLevel < (t.office ?? 1);
              const cell = (k: StatKey) => {
                const d = effTrainDelta((t as unknown as Record<StatKey, number>)[k], s.caps[k]);
                if (d === 0) return <span className="w95-hint">—</span>;
                return <span style={{ color: d > 0 ? '#1a7a1a' : '#c00000' }}>{d > 0 ? '+' : ''}{d}</span>;
              };
              return (
                <tr key={t.id}>
                  <td>{t.nameRu ?? t.name}</td>
                  <td>{fmtK(cost)}</td>
                  <td>{off ? `офис ${t.office}` : `−${t.power ?? 0}`}</td>
                  <td>{cell('program')}</td>
                  <td>{cell('scenario')}</td>
                  <td>{cell('graphics')}</td>
                  <td>{cell('sound')}</td>
                  <td>
                    <button
                      className="w95-btn"
                      disabled={off || resting || game.money < cost || s.power < 1}
                      onClick={() => actionTrain(s.id, t.id)}
                    >
                      Обучить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* профессии: смена — ТОЛЬКО по руководству и только при выполненных требованиях */}
      <div className="arc-sec">
        <b>Профессии</b>
        <div className="w95-row" style={{ marginTop: 3 }}>
          <span className="w95-hint">📘 Руководств в запасе: <b>{manuals}</b></span>
          {manuals <= 0 && <span className="w95-hint" style={{ color: '#c00000' }}>продавец приходит в первую неделю мая (с года 2)</span>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
          {CAREER_ORDER.map((c) => {
            const cl = s.careers[c] ?? 0;
            const act = c === s.activeCareer;
            const sel = c === careerTarget;
            const locked = careerMissing(c).length > 0;
            return (
              <button
                key={c}
                className="w95-btn"
                style={{
                  padding: '0 5px', fontSize: 11,
                  border: sel && !act ? '2px solid #000080' : undefined,
                  background: act ? '#000080' : sel ? '#c8d4f8' : undefined,
                  color: act ? '#fff' : undefined,
                }}
                onClick={() => setCareerTarget(c)}
                title={locked ? '🔒 требования не выполнены' : 'требования выполнены'}
              >
                {CAREER_LABELS[c] ?? c} Lv{cl}{act ? ' ●' : locked ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
        {careerTarget === null && (
          <div className="w95-hint" style={{ marginTop: 3 }}>Выберите профессию — покажу требования и как изменятся статы и пороги (смена — по руководству).</div>
        )}
        {careerTarget === s.activeCareer && (
          <div className="w95-hint" style={{ marginTop: 3 }}>Это текущая профессия ({CAREER_LABELS[careerTarget] ?? careerTarget} Lv{lv}).</div>
        )}
        {careerTarget !== null && careerTarget !== s.activeCareer && (() => {
          const t = careerTarget;
          const missing = careerMissing(t);
          const reqs = Object.entries(CONFIG.CAREER_PREREQ[t] ?? {});
          const prev = careerChangePreview(s.stats, s.caps, s.careers, t);
          const statParts = STAT_KEYS.filter((k) => prev.stats[k].to !== prev.stats[k].from)
            .map((k) => `${STAT_SHORT[k]} ${prev.stats[k].from} → ${prev.stats[k].to}`);
          const capParts = STAT_KEYS.filter((k) => prev.caps[k].gain > 0)
            .map((k) => `${STAT_SHORT[k]} ${prev.caps[k].from} → ${prev.caps[k].to} (+${prev.caps[k].gain}${prev.caps[k].maxed ? ' ×10' : ''})`);
          return (
            <div className="w95-panel" style={{ gap: 3, marginTop: 4 }}>
              <div className="w95-row">
                {reqs.length === 0 ? (
                  <span className="w95-hint">Базовая профессия — требований нет.</span>
                ) : (
                  reqs.map(([job, need]) => {
                    const have = s.careers[job as CareerId] ?? 0;
                    const ok = have >= need;
                    return (
                      <span key={job} className="w95-hint" style={{ color: ok ? '#008000' : '#c00000' }}>
                        {CAREER_LABELS[job] ?? job} Lv{need} — у вас Lv{have} {ok ? '✓' : '✗'}
                      </span>
                    );
                  })
                )}
              </div>
              {prev.fresh ? (
                <>
                  <div className="w95-hint">Статы (первый вход): {statParts.length ? statParts.join(' · ') : 'без изменений'}</div>
                  <div className="w95-hint">Пороги: {capParts.length ? capParts.join(' · ') : 'без изменений'}{prev.maxedCount > 0 ? ` · залито ${prev.maxedCount}/4 — рост ×10 отмечен` : ''}</div>
                </>
              ) : (
                <div className="w95-hint">Профессия знакома — простое переключение, статы и пороги не изменятся.</div>
              )}
              <div className="w95-row">
                <button
                  className="w95-btn"
                  data-autopilot="staff-career-apply"
                  disabled={missing.length > 0 || manuals <= 0}
                  onClick={() => actionApplyCareerManual(s.id, t)}
                >
                  📘 Сменить на «{CAREER_LABELS[t] ?? t}» (руководств: {manuals})
                </button>
                <span className="w95-hint">
                  {missing.length > 0 ? `не хватает: ${missing.join(', ')}`
                    : manuals <= 0 ? 'запаса нет — продавец в мае'
                      : 'потратит 1 руководство из запаса'}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* история */}
      <div className="arc-sec">
        <b>История</b>
        {trainRows.length > 0 && (
          <div className="w95-hint" style={{ marginTop: 2 }}>
            Обучение всего: {trainRows.map((r) => `${r.t!.nameRu ?? r.t!.name} ×${r.n}${gainsTxt(r.gains) ? ` (${gainsTxt(r.gains)})` : ''}`).join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 4, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--w95-dark)', background: '#fff', padding: '2px 4px' }}>
          {hist.length === 0 && <div className="w95-hint">Пока пусто.</div>}
          {hist.map((h, i) => (
            <div key={i} style={{ fontSize: 11, padding: '1px 0' }}>
              <span className="w95-hint">{dateLabel(h.week)}</span> {HIST_ICON[h.kind] ?? '•'} {h.text}
            </div>
          ))}
        </div>
      </div>

      {/* увольнение */}
      {game.staff.length > 2 && (
        <div className="arc-sec">
          {!fireArm ? (
            <button className="w95-btn" onClick={() => setFireArm(true)}>Уволить…</button>
          ) : (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span>Точно уволить {s.name}?</span>
              <button className="w95-btn" onClick={() => { wm.close(staffWinId(s.id)); actionFire(s.id); }}>Да, уволить</button>
              <button className="w95-btn" onClick={() => setFireArm(false)}>Отмена</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
