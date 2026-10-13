// ─── Код: статус разработки — очки вклада, бустеры, баги (UI-08: вынесено из CodeApp.tsx) ───
// M1 (plan/31): анимация вклада переехала в canvas-движок dev-anim.ts
// (один rAF, пул частиц, размаз по такту, счётчики и полоски мимо React).
import { useEffect, useMemo, useRef, useState } from 'react';
import { allConsoles, genreById, typeById } from '../../../shared/meta';
import { fatigueMult } from '../../../core/formulas';
import type { Role } from '../../../core/types';
import { actionUseBooster, useGame, useMeta, useSpeed } from '../../store';
import { studioRecords } from '../../../shared/records';
import { resolveFx } from '../../../shared/dev-anim';
import { burstOnWave, type BurstStage } from '../../../shared/wtc';
import { wtc } from '../../wtc';
import { DevAnim } from './dev-anim';
import { ReleasePanel } from './Release';
import { MODES, ROLE_LABELS } from './shared';
import { AV, StaffAvatar } from '../../StaffAvatar';

// ─── статус разработки ───
export function DevStatus() {
  const game = useGame();
  const meta = useMeta();
  const speed = useSpeed();
  const [boosterStaff, setBoosterStaff] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DevAnim | null>(null);
  // мины: 1 мина = 1 баг; аккумулятор дробного прироста багов между тиками
  const lastBugsRef = useRef(0);
  const bugsAccRef = useRef(0);
  // M5.3: пачки очков («предложение», первая рабочая неделя, улучшение) — каденция вместо мелодии;
  // стадия помнит, какую пачку уже сыграли (см. burstOnWave)
  const prevSumRef = useRef(0);
  const stageRef = useRef<BurstStage>('idle');
  // M3.8: уровень эффектов — выбор игрока («Эффекты экрана…») важнее системной настройки
  const fx = useMemo(
    () => resolveFx(game.ui?.fx, safeReducedMotion()),
    [game.ui?.fx],
  );
  const g = game.activeGame;
  const gKey = g ? `${g.genreId}:${g.typeId}:${g.totalCost}` : '';
  const hasGame = !!g;
  // null-безопасные депсы для эффекта мин (аудит 05.09: правила exhaustive-deps)
  const bugsDep = g ? g.bugs : 0;
  const weekStartedDep = g ? g.weekStarted : 0;

  // книга рекордов студии — динамический верх шкалы полосок (решение босса)
  const records = useMemo(() => studioRecords(game.history).dirs, [game.history]);
  const recs = useMemo(
    () => ({
      fun: records.fun?.value ?? 0,
      creativity: records.creativity?.value ?? 0,
      graphics: records.graphics?.value ?? 0,
      sound: records.sound?.value ?? 0,
    }),
    [records],
  );

  useEffect(() => {
    if (!hasGame) return;
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const engine = new DevAnim(canvas, root);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [hasGame]);

  // M3.8: уровень эффектов — применяем на лету (и при (пере)создании движка)
  useEffect(() => {
    engineRef.current?.setEffects(fx);
    wtc.setEnabled(fx !== 'min'); // M5: «Эффекты: минимум» глушит Баха
  }, [fx, hasGame]);

  // M5 (v1.19.0): на впитывании играет Бах по нотам (ХТК, ротация) вместо капель.
  // Ноты и сэмплы Knight подгружаются при открытии окна «Код».
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    wtc.prepare();
    eng.onLand = () => wtc.onAbsorb();
    return () => {
      if (engineRef.current) engineRef.current.onLand = undefined;
      wtc.release();
    };
  }, [hasGame]);

  // смена проекта: показания мгновенно выравниваются (без анимации «из нуля»)
  useEffect(() => {
    if (!g) return;
    engineRef.current?.setProject(
      {
        fun: Math.round(g.points.fun),
        creativity: Math.round(g.points.creativity),
        graphics: Math.round(g.points.graphics),
        sound: Math.round(g.points.sound),
      },
      recs,
    );
    prevSumRef.current = Math.round(g.points.fun + g.points.creativity + g.points.graphics + g.points.sound);
    stageRef.current = 'idle';
    // аудит-51 04-P3-10: сброс анимации ровно на смену партии (gKey); game/g пересоздаются вместе с ключом — в депсах незачем
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gKey]);

  // происшествие (реальный обвал очков) — тоже мгновенно, без кино
  useEffect(() => {
    if (!g) return;
    if (game.pendingEvent?.type === 'disaster') {
      engineRef.current?.setProject({
        fun: Math.round(g.points.fun),
        creativity: Math.round(g.points.creativity),
        graphics: Math.round(g.points.graphics),
        sound: Math.round(g.points.sound),
      });
    }
    // аудит-51 04-P3-10: мгновенный скачок ровно на смену типа происшествия; очки намеренно не в депсах
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.pendingEvent?.type]);

  // волна вклада дня: разрыв (цель − показано − в воздухе) → план частиц с размазом по такту.
  // В точном режиме (≤12 очков на атрибут за такт) — честно «1 символ = 1 очко».
  // M5.3: пачки (стартовые очки, первая рабочая неделя, улучшение) — не мелодия:
  // частицы летят молча, вместо нот играет каденция в текущей тональности.
  useEffect(() => {
    if (!g) return;
    const sum = Math.round(g.points.fun + g.points.creativity + g.points.graphics + g.points.sound);
    const jump = sum - prevSumRef.current;
    prevSumRef.current = sum;
    const nearStart = game.week - g.weekStarted <= 3;
    const dec = burstOnWave(stageRef.current, game.devContrib?.length ?? 0, jump, nearStart);
    stageRef.current = dec.stage;
    if (dec.kind === 'long') wtc.longChord(); // старт проекта: один длинный аккорд в гармонии
    else if (dec.kind === 'cadence') wtc.chordBurst(); // улучшение: короткая каденция
    engineRef.current?.setWave(
      { fun: g.points.fun, creativity: g.points.creativity, graphics: g.points.graphics, sound: g.points.sound },
      game.devContrib ?? [],
      recs,
      speed,
      g.progress,
      g.phase,
      dec.burst,
    );
    // аудит-51 04-P3-10: волна за такт — по неделе/вкладу, чтобы не пересобирать частицы на каждый рендер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.week, game.devContrib, gKey]);

  // мины багов: летят из аватарок разработчиков к счётчику «Баги» (1 мина = 1 баг)
  useEffect(() => {
    if (!g) return;
    const bugs = g.bugs ?? 0;
    const delta = bugs - lastBugsRef.current;
    lastBugsRef.current = bugs;
    if (delta > 0) bugsAccRef.current += delta;
    else if (delta < 0) bugsAccRef.current = 0; // отладка — мины не копятся
    if (bugsAccRef.current < 0.5) return; // мина = 1 баг, дробь копим
    const n = Math.floor(bugsAccRef.current);
    bugsAccRef.current -= n;
    // кто мог «родить» баг: активные сотрудники (не дома и не в отпуске) — мины летят из их аватарок
    const ids = game.staff.filter((s) => s.homeWeeks === 0 && (s.restDays ?? 0) === 0).map((s) => s.id);
    engineRef.current?.spawnMines(n, ids);
  }, [g, bugsDep, weekStartedDep, game.staff]);

  if (!g) return null;
  const genre = genreById(meta, g.genreId);
  const type = typeById(meta, g.typeId);
  const consoleData = allConsoles(meta, game).find((c) => c.id === g.consoleId);
  const attrs = [
    { id: 'fun' as const, k: 'Fun', c: '#000080' },
    { id: 'creativity' as const, k: 'Creativity', c: '#800080' },
    { id: 'graphics' as const, k: 'Graphics', c: '#008000' },
    { id: 'sound' as const, k: 'Sound', c: '#808000' },
  ];

  return (
    <div className={`w95-panel dev-fx-${fx}`} style={{ overflowY: 'auto', height: '100%', position: 'relative' }} ref={rootRef}>
      {/* M1: canvas-слой анимации вклада (частицы, рябь, искры) — поверх контента, клики сквозь */}
      <canvas ref={canvasRef} className="dev-anim-canvas" aria-hidden="true" />
      <div className="w95-row" style={{ justifyContent: 'space-between' }}>
        <b>{genre?.ru ?? genre?.name} × {type?.nameRu ?? type?.name}</b>
        <span>{consoleData?.name} · {MODES.find((m) => m.id === g.mode)?.label} · комбо {g.comboGrade}</span>
      </div>
      <div>
        <div className="w95-row" style={{ justifyContent: 'space-between' }}>
          <span>Прогресс: {Math.round(g.progress * 100)}%</span>
          <span data-bugs>Баги: <b style={{ color: g.bugs > 20 ? '#c00000' : '#000' }}>{Math.round(g.bugs)}</b></span>
        </div>
        <div className="w95-progress" data-dev-progress><div style={{ width: `${Math.min(100, g.progress * 100)}%` }} /></div>
      </div>
      <div className="w95-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {attrs.map((a) => (
          <div key={a.id} data-attr={a.id}>
            <div className="w95-row" style={{ justifyContent: 'space-between' }}>
              <span style={{ color: a.c }}>{a.k}</span>
              {/* число пишет ТОЛЬКО движок (монотонно); React сюда не вмешивается */}
              <span className="dev-num" />
            </div>
            <div className="w95-progress dev-bar">
              <div style={{ width: '0%', background: a.c }} />
              <i className="dev-notch" />
            </div>
          </div>
        ))}
      </div>
      <table className="w95-table">
        <tbody>
          {game.staff.map((s) => {
            const role = (['proposal', 'program', 'graphics', 'sound', 'debug'] as Role[]).find(
              (r) => (g.assignments[r] ?? []).includes(s.id),
            );
            const pct = Math.max(0, Math.min(1, s.maxPower > 0 ? s.power / s.maxPower : 0));
            const powerColor = pct > 0.5 ? '#1a7a1a' : pct > 0.25 ? '#b08a00' : '#c00000';
            return (
              <tr key={s.id}>
                <td data-staff-id={s.id} style={{ width: '50%' }}>
                  {s.name}{s.homeWeeks > 0 && <span title={`Дома ещё ${s.homeWeeks} нед.`}> 🏠</span>}{(s.restDays ?? 0) > 0 && <span title={`В отпуске ещё ${s.restDays} дн.`}> 🧳</span>}
                  <div className="w95-row" style={{ gap: 4, marginTop: 2 }}>
                    <div
                      className="w95-staff-power"
                      style={{ width: 80, flex: 'none' }}
                      title={`Выработка: ${Math.round(fatigueMult(s.power) * 100)}% (полная — POWER ≥ 5, 70% — 2–4, 40% — меньше 2)`}
                    >
                      <div style={{ width: `${Math.round(pct * 100)}%`, background: powerColor }} />
                    </div>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      {Math.round(s.power)}/{s.maxPower}{(s.restDays ?? 0) > 0 ? ' · отпуск' : s.homeWeeks > 0 ? ' · дома' : ''}
                      {g.contribTotal ? ` · вклад: ${Math.round(g.contribTotal[s.id] ?? 0)}` : ''}
                    </span>
                  </div>
                </td>
                {/* фича (юзер, 13.10): узкая колонка с аватаркой — источник иконок вклада и мин багов */}
                <td data-staff-avatar={s.id} style={{ width: 36, textAlign: 'center', verticalAlign: 'middle' }}>
                  <StaffAvatar staff={s} variant={AV.desktop} />
                </td>
                <td>{role ? <b>{ROLE_LABELS[role]}</b> : <span className="w95-hint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {Object.values(game.boosterCharges ?? {}).some((n) => n > 0) && (
        <div className="w95-bevel-in" style={{ padding: 6, marginTop: 4 }}>
          <div className="w95-row">
            <b>🧪 Бустеры</b>
            <span className="w95-hint">(сотрудник)</span>
            <select className="w95-input" data-autopilot="booster-staff" value={boosterStaff} onChange={(e) => setBoosterStaff(e.target.value)}>
              {game.staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
          <div className="w95-row" style={{ flexWrap: 'wrap' }}>
            {(['fun', 'creativity', 'graphics', 'sound'] as const).filter((t) => (game.boosterCharges[t] ?? 0) > 0).map((t) => (
              <button
                key={t}
                className="w95-btn"
                data-autopilot={`booster-use-${t}`}
                disabled={!boosterStaff}
                onClick={() => boosterStaff && actionUseBooster(boosterStaff, t)}
              >
                {t === 'fun' ? 'Fun' : t === 'creativity' ? 'Creativity' : t === 'graphics' ? 'Graphics' : 'Sound'} +
              </button>
            ))}
          </div>
        </div>
      )}
      <ReleasePanel />
    </div>
  );
}

/** M3.8: prefers-reduced-motion без падения в окружениях без matchMedia (тесты). */
function safeReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
