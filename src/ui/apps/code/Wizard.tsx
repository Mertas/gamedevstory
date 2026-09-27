// ─── Код: мастер нового проекта — шаги, сюжет, команда (UI-08: вынесено из CodeApp.tsx) ───
import { useEffect, useMemo, useState } from 'react';
import type { Mode } from '../../../core/config';
import { projectCostBreakdown } from '../../../core/formulas';
import {
  comboGrade, consoleAvailable, consoleById, genreById, isUnlocked, typeById,
} from '../../../shared/meta';
import { DIRECTION_LABELS, DIRECTION_ORDER } from '../../../core/types';
import type { DirectionAxis, Role } from '../../../core/types';
import { StaffCard } from '../../StaffCard';
import {
  actionGenerateStory, actionStartProject, clearActionError, clearStoryResult, showClientError,
  useActionError, useStoryResult, useGame, useMeta,
} from '../../store';
import { useProfile } from '../../profile';
import { MODES, ROLE_LABELS } from './shared';
import { fmtK, fmtK1 } from '../../../shared/nums';

const DIRECTION_AXES: { id: DirectionAxis; label: string }[] = DIRECTION_ORDER.map((id) => ({
  id, label: DIRECTION_LABELS[id],
}));
// ─── мастер проекта: пошаговый визард ───
// множитель для разбора стоимости: «×1», «×2.44»
const fmtMult = (n: number) => `×${Number(n.toFixed(2))}`;
const WIZ_STEPS = [
  { id: 1, label: 'Платформа' },
  { id: 2, label: 'Жанр' },
  { id: 3, label: 'Тип' },
  { id: 4, label: 'Режим' },
  { id: 5, label: 'Направление' },
  { id: 6, label: 'Команда' },
  { id: 7, label: 'Итог' },
];


export function ProjectWizard() {
  const game = useGame();
  const meta = useMeta();
  const [step, setStep] = useState(1);
  const [consoleId, setConsoleId] = useState('pc-game');
  const [genreId, setGenreId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => game.lastMode ?? 'normal');
  const [direction, setDirection] = useState<Record<DirectionAxis, number>>(() => {
    const last = game.lastDirection;
    return {
      cute: last?.cute ?? 0, realism: last?.realism ?? 0, approach: last?.approach ?? 5,
      niche: last?.niche ?? 0, simple: last?.simple ?? 0, innovation: last?.innovation ?? 0,
      world: last?.world ?? 0, polish: last?.polish ?? 5,
    };
  });
  const [roles, setRoles] = useState<Partial<Record<Role, string | null>>>({});
  const [roleTab, setRoleTab] = useState<Role>('proposal');
  const [title, setTitle] = useState('');
  const [plot, setPlot] = useState('');
  const [storyBusy, setStoryBusy] = useState(false);
  const story = useStoryResult();
  // применить сгенерированное название/сюжет
  useEffect(() => {
    clearActionError();
    if (!story) return;
    setStoryBusy(false);
    if (story.ok) {
      if (story.title) setTitle(story.title);
      if (story.plot) setPlot(story.plot);
    }
    clearStoryResult();
  }, [story]);
  // SRV-05: ответ мог потеряться (обрыв сокета) — не оставляем «Генерирую…» навсегда
  useEffect(() => {
    if (!storyBusy) return;
    const t = window.setTimeout(() => {
      setStoryBusy(false);
      showClientError('GigaChat не ответил за 95 секунд — попробуйте ещё раз');
    }, 95000);
    return () => window.clearTimeout(t);
  }, [storyBusy]);
  const actionError = useActionError();

  // доступные варианты — только открытые (жанры: уровни карьер; типы: + тренинги)
  // PLAN-22: открытые игроком комбо (аккаунт, не сейв) — такие пары доступны всегда
  const profile = useProfile();
  const opened = useMemo(() => new Set(profile?.combos ?? []), [profile]);
  const openedGenres = useMemo(() => new Set([...opened].map((k) => k.split('|')[0] ?? '')), [opened]);
  const openedTypes = useMemo(() => new Set([...opened].map((k) => k.split('|')[1] ?? '')), [opened]);

  const consoles = useMemo(() => meta.consoles.filter((c) => {
    const cs = game.consoles[c.id];
    return cs && cs.licensed && consoleAvailable(game, c.id);
  }), [game, meta]);
  const genres = useMemo(
    () => meta.genres.filter((gg) =>
      isUnlocked(game, gg.unlockJob, gg.unlockLevel) || openedGenres.has(gg.id)),
    [game, meta, openedGenres],
  );
  // M5.4: жанр, открытый только комбо-парами (уровни карьер ещё не доросли), — тип обязан быть
  // из уже открытой пары: иначе «Запустить игру» откажет («Жанр не открыт»), как на сервере
  const genreRuleOk = useMemo(() => {
    const gg = genreId ? genreById(meta, genreId) : null;
    return !!gg && isUnlocked(game, gg.unlockJob, gg.unlockLevel);
  }, [game, meta, genreId]);
  const types = useMemo(
    () => meta.types.filter((t) => {
      const pairOpen = genreId ? opened.has(`${genreId}|${t.id}`) : openedTypes.has(t.id);
      return pairOpen || (genreRuleOk && isUnlocked(game, t.unlockJob, t.unlockLevel, t.unlockTraining));
    }),
    [game, meta, genreId, opened, openedTypes, genreRuleOk],
  );

  const spent = Object.values(direction).reduce((a, b) => a + b, 0);
  const dirLeft = game.directionPoints - spent;

  const genre = genreId ? genreById(meta, genreId) : null;
  const type = typeId ? typeById(meta, typeId) : null;
  const consoleData = consoleId ? consoleById(meta, consoleId) : null;
  const costBd = genre && type && consoleData
    ? projectCostBreakdown(
        genre.costWan,
        game.genreLevels[genre.id] ?? 0,
        game.typeLevels[type.id] ?? 0,
        consoleData.costMult,
        mode,
      )
    : null;
  const cost = costBd ? costBd.total : 0;

  const canAfford = cost > 0 && cost <= game.money;

  // шаг завершён?
  const stepOk: Record<number, boolean> = {
    1: consoles.length > 0,
    2: !!genreId,
    3: !!typeId,
    4: true,
    5: spent <= game.directionPoints,
    6: !!roles.proposal,
    7: true,
  };
  // первый шаг, который ещё не заполнен (нельзя перепрыгивать через незаполненные)
  const firstMissing = (WIZ_STEPS.find((s) => !stepOk[s.id]) ?? WIZ_STEPS[WIZ_STEPS.length - 1]!).id;
  const isDone = (id: number) => stepOk[id] && id < step;

  const next = () => setStep((s) => Math.min(7, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));
  const goTo = (id: number) => { if (id <= step || id <= firstMissing) setStep(id); };

  const start = () => {
    clearActionError();
    actionStartProject({
      consoleId, genreId: genreId!, typeId: typeId!, mode,
      direction: { ...direction },
      proposalStaffId: roles.proposal!,
      assignments: {
        program: roles.program ? [roles.program] : [],
        graphics: roles.graphics ? [roles.graphics] : [],
        sound: roles.sound ? [roles.sound] : [],
        debug: roles.debug ? [roles.debug] : [],
      },
      name: title.trim() || undefined,
      plot: plot.trim() || undefined,
    });
  };

  const setRole = (r: Role, val: string | null) => {
    setRoles((rs) => {
      const next = { ...rs, [r]: val };
      if (val) {
        for (const k of Object.keys(next) as Role[]) {
          if (k !== r && next[k] === val) next[k] = null;
        }
      }
      return next;
    });
  };

  // порядок ролей для авто-перехода (Сценарий → Программирование → … → Отладка)
  const ROLE_ORDER: Role[] = ['proposal', 'program', 'graphics', 'sound', 'debug'];
  // совет подсказки зависит от выбранной роли
  const ROLE_TIPS: Record<Role, string> = {
    proposal: 'Сценарист отвечает за сюжет: влияет на Сценарий и шансы наград. Без него игра не начнётся.',
    program: 'Программист — двигатель разработки: без него не растёт Fun (главная оценка игроков).',
    graphics: 'Дизайнер поднимает Графику — множитель качества и продаж. Назначайте на 2-3-й игре.',
    sound: 'Звукорежиссёр даёт очки Звука — влияет на награды и атмосферу.',
    debug: 'Отладчик снижает баги во время разработки — меньше простоев перед релизом.',
  };

  const handleStaffClick = (s: { id: string }) => {
    const cur = roles[roleTab];
    const val = cur === s.id ? null : s.id;
    setRole(roleTab, val);
    if (val) {
      // назначили — сразу переключаемся на следующую свободную роль
      const idx = ROLE_ORDER.indexOf(roleTab);
      for (let i = idx + 1; i < ROLE_ORDER.length; i++) {
        const nr = ROLE_ORDER[i];
        if (nr && !roles[nr]) { setRoleTab(nr); break; }
      }
    }
  };

  const dirSummary = DIRECTION_AXES.filter((a) => direction[a.id] > 0)
    .map((a) => `${a.label} ${direction[a.id]}`).join(', ') || '—';

  const assignedNames = (r: Role) => {
    const id = roles[r];
    return id ? game.staff.find((s) => s.id === id)?.name ?? '—' : '—';
  };

  return (
    <div className="w95-panel" style={{ height: '100%', padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* список шагов */}
        <div className="w95-bevel-in" style={{ width: 132, padding: 4, margin: 4, overflowY: 'auto', flexShrink: 0 }}>
          {WIZ_STEPS.map((s) => (
            <div
              key={s.id}
              onClick={() => goTo(s.id)}
              data-autopilot={`wiz-step-${s.id}`}
              className={`w95-row ${s.id === step ? 'w95-step-active' : ''}`}
              style={{
                padding: '3px 4px', cursor: 'pointer', fontSize: 11,
                fontWeight: s.id === step ? 'bold' : 'normal',
                background: s.id === step ? '#000080' : 'transparent',
                color: s.id === step ? '#fff' : '#000',
              }}
            >
              <span>{isDone(s.id) ? '✓' : s.id}</span>
              <span style={{ marginLeft: 4 }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* содержимое шага */}
        <div style={{ flex: 1, minWidth: 0, padding: 4, overflowY: 'auto' }}>
          {step === 1 && (
            <>
              <b>Платформа</b>
              <div className="w95-hint">Лицензии на консоли покупаются в окне «Железо».</div>
              <div className="w95-field">
                {consoles.map((c) => (
                  <div key={c.id} className="w95-li" style={{ padding: '2px 4px' }} onClick={() => setConsoleId(c.id)} data-autopilot={`wiz-console-${c.id}`}>
                    <label className="w95-row">
                      <input type="radio" checked={consoleId === c.id} onChange={() => setConsoleId(c.id)} />
                      <b>{c.name}</b>
                      <span className="w95-hint">база: {fmtK(c.installBase)} · множитель ×{c.costMult}</span>
                    </label>
                  </div>
                ))}
              </div>
              {consoles.length === 0 && <div className="w95-hint">Нет доступных платформ — купите лицензию в «Железе».</div>}
            </>
          )}

          {step === 2 && (
            <>
              <b>Жанр</b>
              {game.lastGenreId && (
                <div className="w95-hint">
                  Прошлый раз: <b>{genreById(meta, game.lastGenreId)?.ru ?? game.lastGenreId}</b> — попробуйте что-то новое!
                </div>
              )}
              <div className="w95-hint">Открытые жанры ({genres.length}/{meta.genres.length}); остальные — за уровни сотрудников.</div>
              <div className="w95-field" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {genres.map((gg) => (
                  <div key={gg.id} className="w95-li" style={{ padding: '1px 4px' }} onClick={() => setGenreId(gg.id)} data-autopilot={`wiz-genre-${gg.id}`}>
                    <label className="w95-row">
                      <input type="radio" checked={genreId === gg.id} onChange={() => setGenreId(gg.id)} />
                      {gg.ru} <span className="w95-hint">(база {fmtK(gg.costWan / 10)})</span>
                    </label>
                  </div>
                ))}
              </div>
              {genres.length === 0 && (
                <div className="w95-hint">Жанры ещё не открыты — прокачайте сотрудников (окно «Найм» → «⬆»).</div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <b>Тип</b>
              {game.lastTypeId && (
                <div className="w95-hint">
                  Прошлый раз: <b>{typeById(meta, game.lastTypeId)?.nameRu ?? typeById(meta, game.lastTypeId)?.name ?? game.lastTypeId}</b>
                </div>
              )}
              <div className="w95-hint">
                Открытые типы ({types.length}/{meta.types.length}); остальные — за уровни и тренинги.
                Качество комбо узнаете, когда начнёте разработку.
              </div>
              {genreId && !genreRuleOk && (
                <div className="w95-hint">Жанр держат только открытые комбо — ниже лишь уже открытые пары.</div>
              )}
              <div className="w95-field" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {types.map((t) => {
                  return (
                    <div key={t.id} className="w95-li" style={{ padding: '1px 4px' }} onClick={() => setTypeId(t.id)} data-autopilot={`wiz-type-${t.id}`}>
                      <label className="w95-row">
                        <input type="radio" checked={typeId === t.id} onChange={() => setTypeId(t.id)} />
                        {t.nameRu ?? t.name}
                        <span className="w95-hint">({t.popularity})</span>
                        {genreId && opened.has(`${genreId}|${t.id}`) && (
                          <span className="w95-combo-open" title="Это комбо у вас открыто — оценка сохранится">
                            {comboGrade(meta, genreId, t.id)}
                          </span>
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
              {types.length === 0 && (
                <div className="w95-hint">Типы ещё не открыты — прокачайте сотрудников и пройдите тренинги («Найм» → «Обучение»).</div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <b>Режим разработки</b>
              <div className="w95-field">
                {MODES.map((m) => (
                  <div key={m.id} className="w95-li" style={{ padding: '1px 4px' }} onClick={() => setMode(m.id)} data-autopilot={`wiz-mode-${m.id}`}>
                    <label className="w95-row">
                      <input type="radio" checked={mode === m.id} onChange={() => setMode(m.id)} />
                      <b>{m.label}</b> <span className="w95-hint">{m.hint}</span>
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <b>Направление</b>
              <div className="w95-hint">
                Очки направления: {spent}/{game.directionPoints}{dirLeft > 0 ? `, свободно ${dirLeft}` : ' (все использованы)'}
              </div>
              <div className="w95-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {DIRECTION_AXES.map((ax) => (
                  <div key={ax.id} className="w95-row" style={{ justifyContent: 'space-between' }}>
                    <span>{ax.label}</span>
                    <span className="w95-row">
                      <button className="w95-btn" style={{ minWidth: 22, padding: '0 6px' }} data-autopilot={`wiz-dir-${ax.id}-minus`}
                        onClick={() => setDirection((d) => ({ ...d, [ax.id]: Math.max(0, d[ax.id] - 1) }))}>−</button>
                      <b style={{ minWidth: 16, textAlign: 'center' }} data-autopilot-dir-value={ax.id}>{direction[ax.id]}</b>
                      <button className="w95-btn" style={{ minWidth: 22, padding: '0 6px' }} data-autopilot={`wiz-dir-${ax.id}-plus`}
                        disabled={dirLeft <= 0}
                        onClick={() => setDirection((d) => ({ ...d, [ax.id]: d[ax.id] + 1 }))}>+</button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <b>Команда</b>
              <div className="w95-hint" style={{ marginBottom: 2 }}>
                1) выберите роль · 2) кликните по сотруднику. Каждый занят на одной роли.
              </div>
              <div className="w95-row" style={{ flexWrap: 'wrap', gap: 2, marginBottom: 2 }}>
                {ROLE_ORDER.map((r) => (
                  <button
                    key={r}
                    className={`w95-btn${roleTab === r ? ' active' : ''}`}
                    onClick={() => setRoleTab(r)}
                    data-autopilot={`wiz-role-${r}`}
                    title={roles[r] ? game.staff.find((s) => s.id === roles[r])?.name : '—'}
                  >
                    {ROLE_LABELS[r]}: {roles[r] ? game.staff.find((s) => s.id === roles[r])?.name?.split(' ')[0] : '—'}
                  </button>
                ))}
              </div>
              <div className="w95-staff-grid">
                {game.staff.map((s) => {
                  const busyRole = (Object.entries(roles) as [Role, string][]).find(([, v]) => v === s.id)?.[0];
                  // PLAN-41: отдыхающие и «дома» вклада не дают — в команду не берём
                  const away = (s.restDays ?? 0) > 0 || s.homeWeeks > 0;
                  const awayNote = (s.restDays ?? 0) > 0 ? `🧳 в отпуске ${s.restDays} дн.` : s.homeWeeks > 0 ? `🏠 дома ${s.homeWeeks} нед.` : undefined;
                  return (
                    <StaffCard
                      key={s.id}
                      st={s}
                      selected={roles[roleTab] === s.id}
                      disabled={away}
                      note={awayNote ?? (busyRole && busyRole !== roleTab ? `сейчас: ${ROLE_LABELS[busyRole]}` : undefined)}
                      onClick={() => handleStaffClick(s)}
                    />
                  );
                })}
              </div>
              <div className="w95-hint" style={{ marginTop: 2 }}>
                💡 {roles[roleTab]
                  ? (ROLE_ORDER.every((r) => roles[r])
                    ? 'Команда укомплектована! Можно переходить к «Итогу».'
                    : `${ROLE_LABELS[roleTab]} назначен. Кликните по карточке следующего сотрудника — роль переключится сама.`)
                  : ROLE_TIPS[roleTab]}
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <b>Итог</b>
              <table className="w95-table">
                <tbody>
                  <tr><td style={{ width: 140 }}>Платформа</td><td>{consoleData?.name}</td></tr>
                  <tr><td>Игра</td><td><b>{genre?.ru ?? '—'} × {type?.nameRu ?? type?.name ?? '—'}</b></td></tr>

                  <tr><td>Режим</td><td>{MODES.find((m) => m.id === mode)?.label}</td></tr>
                  <tr><td>Направление</td><td>{dirSummary}</td></tr>
                  <tr><td>Ответственные</td><td>
                    Сценарий: {assignedNames('proposal')} · Программирование: {assignedNames('program')} · Графика: {assignedNames('graphics')} · Звук: {assignedNames('sound')} · Отладка: {assignedNames('debug')}
                  </td></tr>
                  <tr><td>Стоимость</td><td>
                    <b>{fmtK1(cost)}</b>
                    {!canAfford && cost > 0 && <span style={{ color: '#c00000' }}> — не хватает денег!</span>}
                  </td></tr>
                </tbody>
              </table>

              {costBd && (
                <div className="w95-bevel-in" style={{ padding: 4, marginTop: 6, fontSize: 11 }} data-autopilot="cost-breakdown">
                  <b>Из чего складывается стоимость:</b>
                  <div>Жанр «{genre!.ru}»: база {fmtK1(costBd.genreBaseK)}, уровень {game.genreLevels[genre!.id] ?? 0} → {fmtMult(costBd.genreLvMult)} = {fmtK1(costBd.genreK)}</div>
                  <div>Тип «{type!.nameRu ?? type!.name}»: база {fmtK1(costBd.typeBaseK)}, уровень {game.typeLevels[type!.id] ?? 0} → {fmtMult(costBd.typeLvMult)} = {fmtK1(costBd.typeK)}</div>
                  <div>Платформа «{consoleData!.name}»: {fmtMult(costBd.consoleMult)} · режим «{MODES.find((m) => m.id === mode)?.label}»: {fmtMult(costBd.modeCost)} · масштаб баланса: {fmtMult(costBd.scale)}</div>
                  <div>Итого: ({fmtK1(costBd.genreK)} + {fmtK1(costBd.typeK)}) {fmtMult(costBd.consoleMult)} {fmtMult(costBd.modeCost)} {fmtMult(costBd.scale)} = <b>{fmtK1(costBd.total)}</b></div>
                </div>
              )}

              <div className="w95-bevel-out" style={{ padding: 4, marginTop: 6 }}>
                <div className="w95-row" style={{ justifyContent: 'space-between' }}>
                  <b>Название и сюжет</b>
                  <button
                    className="w95-btn"
                    disabled={!genreId || !typeId || storyBusy}
                    data-autopilot="wiz-story-gen"
                    onClick={() => {
                      setStoryBusy(true);
                      clearActionError();
                      actionGenerateStory(genreId!, typeId!);
                    }}
                  >
                    {storyBusy ? 'Генерирую…' : '✨ Сгенерировать'}
                  </button>
                </div>
                <input
                  className="w95-input" style={{ width: '100%', marginTop: 4 }}
                  placeholder="Название игры (можно отредактировать)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={40}
                />
                <textarea
                  className="w95-input" style={{ width: '100%', marginTop: 4, height: 56, resize: 'none' }}
                  placeholder="Краткий сюжет (можно отредактировать)"
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  maxLength={10000}
                />
                <div className="w95-hint" style={{ marginTop: 2 }}>
                  {storyBusy ? 'GigaChat придумывает название и сюжет…' : 'Можно оставить пустым — название сгенерируется при релизе.'}
                </div>
              </div>
              {actionError && <div style={{ color: '#c00000', marginTop: 4 }}>⚠ {actionError}</div>}
            </>
          )}
        </div>
      </div>

      {/* футер: стоимость на каждом шаге + навигация */}
      <div className="w95-bevel-out" style={{ padding: 4, margin: 4 }}>
        <div className="w95-row" style={{ justifyContent: 'space-between' }}>
          <span>
            Стоимость: <b>{cost > 0 ? fmtK1(cost) : '—'}</b>

            <span className="w95-hint"> · В кассе: {fmtK(game.money)}</span>
            {cost > 0 && !canAfford && <span style={{ color: '#c00000' }}> — не хватает!</span>}
          </span>
          <span className="w95-row" style={{ gap: 4 }}>
            <button className="w95-btn" disabled={step <= 1} onClick={prev}>← Назад</button>
            {step < 7 ? (
              <button className="w95-btn" disabled={!stepOk[step]} onClick={next}>Далее →</button>
            ) : (
              <button
                className="w95-btn"
                disabled={!canAfford || !stepOk[6]}
                onClick={start}
                data-autopilot="wizard-start"
              >
                ▶ Начать разработку
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
