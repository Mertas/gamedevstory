// PLAN-55: «поле иерархии» — свободное поле с перетаскиванием, подразделениями и начальниками.
// PLAN-56: полноэкранная карта с пан/зумом, суммы статов по слоям и меню-справка под кнопками.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../../core/config';
import {
  cappedStats, effectiveStats, nextSeatPrice, seatsOf, type StatBlock,
} from '../../../core/systems/hierarchy';
import { COMBO_AWARDS, TEAM_COMBOS } from '../../../core/systems/combos';
import { STAT_SHORT } from '../../../shared/train';
import { fmtK } from '../../../shared/nums';
import { StaffAvatar, AV } from '../../StaffAvatar';
import { actionBuySeat, actionSetBoss, useGame } from '../../store';
import {
  FIELD, buildField, canDrop, hitCard, hitUnit, type FieldCard, type FieldUnit, type UnitLevel,
} from './field';

const EDGE = 26;
const STAT_KEYS = ['program', 'scenario', 'graphics', 'sound'] as const;
const STAT_FULL: Record<(typeof STAT_KEYS)[number], string> = {
  program: 'Код', scenario: 'Сценарий', graphics: 'Графика', sound: 'Звук',
};
const MIN_ZOOM = 0.28;
const MAX_ZOOM = 2;

type MenuKey = 'groups' | 'services' | 'departments' | 'combos' | 'help';
type Shown = { kind: 'card' | 'unit'; id: string } | null;
type View = { x: number; y: number; z: number };

const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
const statSum = (s: StatBlock) => STAT_KEYS.reduce((n, k) => n + s[k], 0);
const fmtStat = (n: number) => Math.round(n).toLocaleString('ru-RU');

/** Сумма статов участников: у каждого берём только то, что реально идёт в игру (кап). */
function totalsFor(ids: string[], eff: Map<string, StatBlock>): StatBlock {
  const t: StatBlock = { program: 0, scenario: 0, graphics: 0, sound: 0 };
  for (const id of ids) {
    const e = eff.get(id);
    if (!e) continue;
    const c = cappedStats(e);
    for (const k of STAT_KEYS) t[k] += c[k];
  }
  return t;
}

export function HierarchyApp() {
  const game = useGame();
  const eff = useMemo(() => effectiveStats(game), [game]);
  const model = useMemo(() => buildField(game.staff), [game.staff]);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const tap = useRef<{ x: number; y: number; moved: boolean; id: string } | null>(null);
  const touched = useRef(false);

  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const [panning, setPanning] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [hotUnit, setHotUnit] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [hover, setHover] = useState<Shown>(null);
  const [pinned, setPinned] = useState<Shown>(null);

  const seats = seatsOf(game);
  const price = nextSeatPrice(game);
  const bosses = model.cards.filter((c) => c.direct > 0).length;
  const dropOk = !!(drag && over && canDrop(model, drag, over));
  const shown = hover ?? pinned;
  const openedCombos = Object.keys(game.combos ?? {}).length;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const say = (text: string) => {
    setFlash(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 2600);
  };

  const fit = useCallback(() => {
    const el = mapEl.current;
    if (!el) return;
    const w = el.clientWidth || 1;
    const h = el.clientHeight || 1;
    const z = clampZoom(Math.min(1, (w - 48) / Math.max(1, model.width), (h - 48) / Math.max(1, model.height)));
    setView({ z, x: (w - model.width * z) / 2, y: (h - model.height * z) / 2 });
  }, [model.width, model.height]);

  useEffect(() => {
    touched.current = false;
    fit();
  }, [fit]);

  useEffect(() => {
    const el = mapEl.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!touched.current) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      touched.current = true;
      setView((v) => {
        const z = clampZoom(v.z * factor);
        const k = z / v.z;
        return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenu(null); setPinned(null); setHover(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const point = (clientX: number, clientY: number) => {
    const el = mapEl.current!;
    const r = el.getBoundingClientRect();
    return {
      px: (clientX - r.left - view.x) / view.z,
      py: (clientY - r.top - view.y) / view.z,
    };
  };

  const zoomAt = (factor: number) => {
    const el = mapEl.current;
    if (!el) return;
    const px = el.clientWidth / 2;
    const py = el.clientHeight / 2;
    touched.current = true;
    setView((v) => {
      const z = clampZoom(v.z * factor);
      const k = z / v.z;
      return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const focusUnit = (u: FieldUnit) => {
    const el = mapEl.current;
    if (!el) return;
    const z = Math.max(view.z, 0.9);
    touched.current = true;
    setView({
      z,
      x: el.clientWidth / 2 - (u.x + u.w / 2) * z,
      y: el.clientHeight / 2 - (u.y + u.h / 2) * z,
    });
    setPinned({ kind: 'unit', id: u.id });
    setMenu(null);
  };

  const start = (e: React.PointerEvent, c: FieldCard) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu(null);
    if (c.isOwner) {
      setPinned({ kind: 'card', id: c.id });
      setHover(null);
      return;
    }
    const { px, py } = point(e.clientX, e.clientY);
    tap.current = { x: e.clientX, y: e.clientY, moved: false, id: c.id };
    setDrag(c.id);
    setHover(null);
    setGhost({ x: e.clientX, y: e.clientY, ox: px - c.x, oy: py - c.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    if (tap.current && Math.hypot(e.clientX - tap.current.x, e.clientY - tap.current.y) > 4) {
      tap.current.moved = true;
    }
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const { px, py } = point(e.clientX, e.clientY);
    const card = hitCard(model, px, py);
    setOver(card && card.id !== drag ? card.id : null);
    setHotUnit(hitUnit(model, px, py)?.id ?? null);

    const el = mapEl.current!;
    const r = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (e.clientX - r.left < EDGE) dx = 14;
    else if (r.right - e.clientX < EDGE) dx = -14;
    if (e.clientY - r.top < EDGE) dy = 12;
    else if (r.bottom - e.clientY < EDGE) dy = -12;
    if (dx || dy) {
      touched.current = true;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };

  const end = () => {
    const id = drag;
    const target = over;
    const tapped = tap.current && !tap.current.moved ? tap.current.id : null;
    tap.current = null;
    setDrag(null);
    setGhost(null);
    setOver(null);
    setHotUnit(null);
    if (!id) return;
    if (tapped) {
      setPinned({ kind: 'card', id: tapped });
      return;
    }
    const name = model.byId.get(id)?.staff.name ?? 'Сотрудник';
    if (!target) return;
    if (!canDrop(model, id, target)) {
      say('Так получится петля — выберите другого руководителя');
      return;
    }
    const t = model.byId.get(target)!;
    const becameBoss = !t.isOwner && t.direct === 0;
    actionSetBoss(id, t.isOwner ? null : target);
    say(t.isOwner
      ? `${name} — снова в корне студии`
      : becameBoss
        ? `🎉 ${t.staff.name} — новый начальник`
        : `${name} теперь под началом: ${t.staff.name}`);
  };

  const bgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('.hierfield-hud') || t.closest('.hierfield-inspector') || t.closest('.hierfield-zoom')) return;
    setMenu(null);
    setHover(null);
    setPinned(null);
    const el = mapEl.current!;
    const r = el.getBoundingClientRect();
    pan.current = { x: e.clientX - r.left, y: e.clientY - r.top, vx: view.x, vy: view.y };
    setPanning(true);
    el.setPointerCapture(e.pointerId);
  };

  const bgMove = (e: React.PointerEvent) => {
    const p = pan.current;
    if (p) {
      touched.current = true;
      setView((v) => ({ ...v, x: p.vx + e.clientX - mapEl.current!.getBoundingClientRect().left - p.x, y: p.vy + e.clientY - mapEl.current!.getBoundingClientRect().top - p.y }));
      return;
    }
    if (drag) return;
    const el = mapEl.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    const { px, py } = point(e.clientX, e.clientY);
    const c = hitCard(model, px, py);
    if (c) {
      setHover((h) => (h?.kind === 'card' && h.id === c.id ? h : { kind: 'card', id: c.id }));
      return;
    }
    const u = hitUnit(model, px, py);
    if (u) {
      setHover((h) => (h?.kind === 'unit' && h.id === u.id ? h : { kind: 'unit', id: u.id }));
      return;
    }
    setHover(null);
  };

  const bgUp = () => {
    pan.current = null;
    setPanning(false);
  };

  const card = (c: FieldCard, i: number) => {
    const s = c.staff;
    const e = eff.get(s.id) ?? s.stats;
    const bonus = (k: keyof StatBlock) => Math.round(e[k] - s.stats[k]);
    const cls = [
      'hierfield-card',
      c.isOwner ? 'owner' : '',
      c.direct > 0 ? 'boss' : '',
      drag === c.id ? 'dragging' : '',
      over === c.id ? (dropOk ? 'over' : 'bad') : '',
    ].filter(Boolean).join(' ');
    return (
      <div
        key={c.id}
        className={cls}
        data-staff-id={c.id}
        style={{ left: c.x, top: c.y, animationDelay: `${Math.min(i, 14) * 18}ms` }}
        onPointerDown={(ev) => start(ev, c)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        title={c.isOwner
          ? 'Владелец студии — вершина дерева. Нажмите, чтобы посмотреть детали.'
          : `Перетащите на карточку руководителя. ${c.unitLabel ? `Начальник: ${c.unitLabel.toLowerCase()}` : 'Пока без подчинённых'}`}
      >
        <StaffAvatar staff={s} variant={AV.hireTeam} />
        <div className="hierfield-info">
          <div className="hierfield-name">
            {s.name}
            {c.isOwner && <span className="hierfield-owner">владелец</span>}
            {!c.isOwner && c.direct > 0 && <span className="hierfield-crown" aria-label="начальник">👑</span>}
          </div>
          <div className="hierfield-role">
            {s.activeCareer} · Lv{s.careers[s.activeCareer] ?? 1}
            {c.direct > 0 && <span className="hierfield-sub"> · {c.direct} в подчинении</span>}
          </div>
          <div className="hierfield-stats">
            {STAT_KEYS.map((k) => (
              <span key={k}>
                <i>{STAT_SHORT[k]}</i> {Math.round(Math.min(e[k], CONFIG.GAME_STAT_CAP))}
                {bonus(k) > 0 && <span className="hierfield-bonus"> +{bonus(k)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const statCells = (t: StatBlock) => (
    <div className="hierfield-insp-stats">
      {STAT_KEYS.map((k) => (
        <span key={k}><i>{STAT_FULL[k]}</i><b>{fmtStat(t[k])}</b></span>
      ))}
    </div>
  );

  const inspector = () => {
    if (!shown) return null;
    const close = () => { setPinned(null); setHover(null); };
    if (shown.kind === 'card') {
      const c = model.byId.get(shown.id);
      if (!c) return null;
      const s = c.staff;
      const own = model.units.find((u) => u.bossId === s.id);
      const inUnit = [...model.units]
        .filter((u) => u.memberIds.includes(s.id))
        .sort((a, b) => a.w * a.h - b.w * b.h)[0];
      const bossName = s.bossId ? model.byId.get(s.bossId)?.staff.name : null;
      const t = totalsFor([s.id], eff);
      return (
        <div className={`hierfield-inspector${pinned ? ' pinned' : ''}`}>
          <div className="hierfield-insp-head">
            <StaffAvatar staff={s} variant={AV.hireTeam} />
            <div>
              <b>{s.name}</b>
              <span>{s.activeCareer} · Lv{s.careers[s.activeCareer] ?? 1}</span>
            </div>
            <span className="hierfield-insp-pin" title={pinned ? 'Закреплено' : 'Наведение'}>{pinned ? '📌' : '👁'}</span>
            <button className="hierfield-insp-x" onClick={close} title="Закрыть">×</button>
          </div>
          <div className="hierfield-insp-lines">
            <span>Руководитель: <b>{bossName ?? (c.isOwner ? '—' : 'владелец студии')}</b></span>
            <span>Прямых подчинённых: <b>{c.direct}</b>{own ? ` · всего в ветке: ${own.count}` : ''}</span>
            {inUnit && <span>Слой: <b>{inUnit.icon} {inUnit.label}</b> ({inUnit.count} чел.)</span>}
          </div>
          <div className="hierfield-insp-sum">Σ {fmtStat(statSum(t))}</div>
          {statCells(t)}
        </div>
      );
    }
    const u = model.units.find((x) => x.id === shown.id);
    if (!u) return null;
    const t = totalsFor(u.memberIds, eff);
    return (
      <div className={`hierfield-inspector${pinned ? ' pinned' : ''}`}>
        <div className="hierfield-insp-head">
          <span className="hierfield-insp-icon">{u.icon}</span>
          <div>
            <b>{u.label}</b>
            <span>{u.bossName} · {u.count} чел.</span>
          </div>
          <span className="hierfield-insp-pin" title={pinned ? 'Закреплено' : 'Наведение'}>{pinned ? '📌' : '👁'}</span>
          <button className="hierfield-insp-x" onClick={close} title="Закрыть">×</button>
        </div>
        <div className="hierfield-insp-sum">Σ {fmtStat(statSum(t))}</div>
        {statCells(t)}
        <div className="hierfield-insp-names">
          {u.memberIds.map((id) => {
            const m = model.byId.get(id);
            if (!m) return null;
            return (
              <button
                key={id}
                className={m.staff.id === u.bossId ? 'boss' : ''}
                onClick={() => { setPinned({ kind: 'card', id }); setHover(null); }}
                title={`${m.staff.name} — карточка сотрудника`}
              >
                {m.staff.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const unitsOf = (level: UnitLevel) => model.units.filter((u) => u.level === level);

  const menuButton = (key: MenuKey, label: React.ReactNode, right = false) => (
    <div className="hierfield-menu-wrap">
      <button
        className={`w95-btn hierfield-menu-btn${menu === key ? ' on' : ''}`}
        onClick={() => setMenu((m) => (m === key ? null : key))}
        aria-expanded={menu === key}
      >
        {label}
      </button>
      {menu === key && (
        <div className={`hierfield-menu${right ? ' right' : ''}`} onClick={(e) => e.stopPropagation()}>
          {key === 'combos' ? (
            <>
              <div className="hierfield-menu-head">Комбо команды {openedCombos}/{TEAM_COMBOS.length}</div>
              <div className="hierfield-menu-note">Открываются на релизе готовой игры этим составом; бонус срабатывает на готовой игре.</div>
              {TEAM_COMBOS.map((c) => {
                const opened = !!game.combos?.[c.id];
                return (
                  <div key={c.id} className={`hierfield-menu-row combo${opened ? ' on' : ''}`} title={opened ? c.condition : 'Скрытая комбинация'}>
                    <b>{opened ? c.name : '???'}</b>
                    <span>{opened ? c.effect : 'Закрыто — соберите подходящий состав'}</span>
                  </div>
                );
              })}
              <div className="hierfield-menu-head">Награды</div>
              {COMBO_AWARDS.map((a) => (
                <div key={a.at} className={`hierfield-menu-row award${openedCombos >= a.at ? ' on' : ''}`}>
                  <b>{openedCombos >= a.at ? '✓' : '·'} {a.at} комбо</b>
                  <span>{a.text}</span>
                </div>
              ))}
            </>
          ) : key === 'help' ? (
            <>
              <div className="hierfield-menu-head">Как читать поле</div>
              <div className="hierfield-menu-row"><b>Карточка</b><span>сотрудник: профессия, уровень и четыре стата. Зелёный «+N» — надбавка от руководителя.</span></div>
              <div className="hierfield-menu-row"><b>Рамки</b><span>👥 группа → 🛡 служба → 🏛 отдел. В метке — название и число людей, в инспекторе — сумма статов.</span></div>
              <div className="hierfield-menu-row"><b>Σ</b><span>сумма по людям; у каждого стата в игру идут первые {CONFIG.GAME_STAT_CAP}.</span></div>
              <div className="hierfield-menu-row"><b>Драг</b><span>тяните карточку на другого сотрудника — он станет руководителем. На владельца — вернуть в корень.</span></div>
              <div className="hierfield-menu-row"><b>Мышь</b><span>колесо — зум к курсору, перетаскивание фона — сдвиг, двойной клик — приблизить.</span></div>
              <div className="hierfield-menu-note">Излишек сверх {CONFIG.GAME_STAT_CAP} начальник раздаёт подчинённым (×{CONFIG.HIERARCHY_EXCESS}, дальше ×{CONFIG.HIERARCHY_DEPTH_FALLOFF}). Нажмите на карточку или рамку, чтобы закрепить детали; Esc — снять.</div>
            </>
          ) : (
            <>
              <div className="hierfield-menu-head">
                {key === 'groups' ? 'Группы' : key === 'services' ? 'Службы' : 'Отделы'} · {unitsOf(key === 'groups' ? 'group' : key === 'services' ? 'service' : 'department').length}
              </div>
              {unitsOf(key === 'groups' ? 'group' : key === 'services' ? 'service' : 'department').length === 0 && (
                <div className="hierfield-menu-note">Пока пусто. Назначьте начальников перетаскиванием — слои вырастут сами.</div>
              )}
              {unitsOf(key === 'groups' ? 'group' : key === 'services' ? 'service' : 'department')
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((u) => {
                  const t = totalsFor(u.memberIds, eff);
                  return (
                    <button key={u.id} className="hierfield-menu-row unit" onClick={() => focusUnit(u)}>
                      <b>{u.icon} {u.label}</b>
                      <span>{u.count} чел. · Σ {fmtStat(statSum(t))} · {u.bossName}</span>
                    </button>
                  );
                })}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="w95-panel hierfield-panel">
      <div
        className={`hierfield-map${panning ? ' panning' : ''}`}
        ref={mapEl}
        onPointerDown={bgDown}
        onPointerMove={bgMove}
        onPointerUp={bgUp}
        onPointerCancel={bgUp}
        onPointerLeave={() => { setHover(null); bgUp(); }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('.hierfield-card, .hierfield-hud, .hierfield-inspector, .hierfield-zoom')) return;
          zoomAt(1.35);
        }}
      >
        <div
          className="hierfield-world"
          style={{
            width: model.width,
            height: model.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.z})`,
          }}
        >
          {model.units.map((u) => {
            const t = totalsFor(u.memberIds, eff);
            return (
              <div
                key={`u-${u.id}`}
                className={`hierfield-unit ${u.level}${hotUnit === u.id && drag ? ' hot' : ''}`}
                style={{ left: u.x, top: u.y, width: u.w, height: u.h }}
              >
                <span className="hierfield-unit-label">
                  {u.icon} {u.label} · {u.count} · Σ {fmtStat(statSum(t))}
                </span>
              </div>
            );
          })}

          <svg className="hierfield-links" width={model.width} height={model.height} aria-hidden="true">
            {model.edges.map((e) => (
              <path key={`${e.from}-${e.to}`} d={e.d} />
            ))}
          </svg>

          {model.cards.map(card)}

          {game.staff.length <= 1 && (
            <div className="hierfield-empty">
              В студии пока только вы. Наймите команду в «Найме» — и на поле появятся первые сотрудники.
            </div>
          )}
        </div>

        <div className="hierfield-hud">
          <div className="hierfield-hud-group">
            <span className="hierfield-chip" title="Начальников с подчинёнными">👑 {bosses}</span>
            <span className="hierfield-chip" title="Подразделений на поле">🏷 {model.units.length}</span>
          </div>
          <div className="hierfield-hud-group hierfield-hud-menus">
            {menuButton('groups', <>👥 Группы <i>{unitsOf('group').length}</i></>)}
            {menuButton('services', <>🛡 Службы <i>{unitsOf('service').length}</i></>)}
            {menuButton('departments', <>🏛 Отделы <i>{unitsOf('department').length}</i></>)}
            {menuButton('combos', <>⭐ Комбо <i>{openedCombos}/{TEAM_COMBOS.length}</i></>, true)}
            {menuButton('help', <>❓ Поле</>, true)}
          </div>
          <div className="hierfield-hud-group hierfield-hud-right">
            <span className="hierfield-chip">Мест {game.staff.length}/{seats}</span>
            <button className="w95-btn" onClick={() => actionBuySeat()} disabled={game.money < price} data-autopilot="buy-seat">
              💺 {fmtK(price)}
            </button>
          </div>
        </div>

        {inspector()}

        <div className="hierfield-zoom">
          <button className="w95-btn" onClick={() => zoomAt(1.25)} title="Приблизить">＋</button>
          <button className="w95-btn" onClick={() => zoomAt(0.8)} title="Отдалить">－</button>
          <button className="w95-btn" onClick={() => { touched.current = false; fit(); }} title="Вписать всё поле">⤢</button>
          <span>{Math.round(view.z * 100)}%</span>
        </div>

        {flash && <div className="hierfield-toast">{flash}</div>}

        {drag && ghost && (
          <div
            className="hierfield-ghost"
            style={{
              left: ghost.x - ghost.ox * view.z,
              top: ghost.y - ghost.oy * view.z,
              width: FIELD.CARD_W,
              height: FIELD.CARD_H,
              transform: `rotate(1.5deg) scale(${view.z})`,
              transformOrigin: '0 0',
            }}
          >
            <StaffAvatar staff={model.byId.get(drag)!.staff} variant={AV.hireTeam} />
            <div className="hierfield-info">
              <div className="hierfield-name">{model.byId.get(drag)!.staff.name}</div>
              <div className="hierfield-role">
                {drag === over ? 'отпустите, чтобы…' : dropOk ? `→ ${model.byId.get(over!)!.staff.name}` : 'ищем руководителя'}
              </div>
            </div>
          </div>
        )}

        {drag && (
          <div className="hierfield-dropbar">
            {over
              ? dropOk
                ? `Отпустите: ${model.byId.get(over)!.staff.name} станет руководителем`
                : 'Сюда нельзя — получится петля'
              : 'Наведите на карточку руководителя'}
          </div>
        )}

        <span className="hierfield-a11y" aria-live="polite">{flash ?? ''}</span>
      </div>
    </div>
  );
}
