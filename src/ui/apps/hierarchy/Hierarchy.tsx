// PLAN-55: «поле иерархии» — свободное поле с перетаскиванием, подразделениями и начальниками.
// Дерево раскладывается по координатам (field.ts), карточки плавно переезжают после drop.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../../../core/config';
import { effectiveStats, nextSeatPrice, seatsOf, type StatBlock } from '../../../core/systems/hierarchy';
import { COMBO_AWARDS, TEAM_COMBOS } from '../../../core/systems/combos';
import { STAT_SHORT } from '../../../shared/train';
import { fmtK } from '../../../shared/nums';
import { StaffAvatar, AV } from '../../StaffAvatar';
import { actionBuySeat, actionSetBoss, useGame } from '../../store';
import {
  FIELD, buildField, canDrop, hitCard, hitUnit, type FieldCard,
} from './field';

const EDGE = 26;

export function HierarchyApp() {
  const game = useGame();
  const eff = useMemo(() => effectiveStats(game), [game]);
  const model = useMemo(() => buildField(game.staff), [game.staff]);

  const wrap = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [hotUnit, setHotUnit] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const seats = seatsOf(game);
  const price = nextSeatPrice(game);
  const bosses = model.cards.filter((c) => c.direct > 0).length;
  const dropOk = !!(drag && over && canDrop(model, drag, over));

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const say = (text: string) => {
    setFlash(text);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 2600);
  };

  const point = (clientX: number, clientY: number) => {
    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    return { px: clientX - r.left + el.scrollLeft, py: clientY - r.top + el.scrollTop };
  };

  const start = (e: React.PointerEvent, c: FieldCard) => {
    if (c.isOwner) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const { px, py } = point(e.clientX, e.clientY);
    setDrag(c.id);
    setGhost({ x: e.clientX, y: e.clientY, ox: e.clientX - (px - c.x), oy: e.clientY - (py - c.y) });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    const { px, py } = point(e.clientX, e.clientY);
    const card = hitCard(model, px, py);
    setOver(card && card.id !== drag ? card.id : null);
    setHotUnit(hitUnit(model, px, py)?.id ?? null);

    const el = wrap.current!;
    const r = el.getBoundingClientRect();
    if (e.clientX - r.left < EDGE) el.scrollLeft -= 14;
    else if (r.right - e.clientX < EDGE) el.scrollLeft += 14;
    if (e.clientY - r.top < EDGE) el.scrollTop -= 12;
    else if (r.bottom - e.clientY < EDGE) el.scrollTop += 12;
  };

  const end = () => {
    const id = drag;
    const target = over;
    setDrag(null);
    setGhost(null);
    setOver(null);
    setHotUnit(null);
    if (!id) return;
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
          ? 'Владелец студии — вершина дерева'
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
            {(['program', 'scenario', 'graphics', 'sound'] as const).map((k) => (
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

  return (
    <div className="w95-panel hierfield-panel">
      <div className="w95-row hierfield-top">
        <b>Иерархия студии</b>
        <span className="w95-hint">начальников: {bosses} · подразделений: {model.units.length}</span>
        <span className="hierfield-legend">
          👥 {model.units.filter((u) => u.level === 'group').length} ·
          🛡 {model.units.filter((u) => u.level === 'service').length} ·
          🏛 {model.units.filter((u) => u.level === 'department').length}
        </span>
        <span className="w95-hint" style={{ marginLeft: 'auto' }}>мест: {game.staff.length}/{seats}</span>
        <button className="w95-btn" onClick={() => actionBuySeat()} disabled={game.money < price} data-autopilot="buy-seat">
          💺 Купить место ({fmtK(price)})
        </button>
      </div>

      <div className="hierfield-wrap" ref={wrap}>
        <div className="hierfield-canvas" style={{ width: model.width, height: model.height }}>
          {model.units.map((u) => (
            <div
              key={`u-${u.id}`}
              className={`hierfield-unit ${u.level}${hotUnit === u.id && drag ? ' hot' : ''}`}
              style={{ left: u.x, top: u.y, width: u.w, height: u.h }}
            >
              <span className="hierfield-unit-label">
                {u.icon} {u.label} · {u.count}
              </span>
            </div>
          ))}

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
      </div>

      <div className="w95-hint hierfield-tip">
        Тяните сотрудника за карточку на другого — он станет его подчинённым. На владельца — вернуть в корень.
        Начальник с подчинёнными образует группу; уровень глубже — службу; ещё глубже — отдел.
        Излишек статов сверх {CONFIG.GAME_STAT_CAP} он раздаёт подчинённым (×{CONFIG.HIERARCHY_EXCESS},
        дальше ×{CONFIG.HIERARCHY_DEPTH_FALLOFF}). В игру идут первые {CONFIG.GAME_STAT_CAP} каждого стата.
      </div>

      {flash && <div className="hierfield-toast">{flash}</div>}

      <h4 className="w95-help-sub" style={{ marginTop: 4 }}>
        Комбо команды ({Object.keys(game.combos ?? {}).length}/{TEAM_COMBOS.length})
      </h4>
      <div className="w95-hint">
        Скрытые комбинации открываются, когда команда доводит игру до релиза. Бонус срабатывает
        на готовой игре. За коллекцию — награды на {COMBO_AWARDS.map((a) => a.at).join(', ')} комбо.
      </div>
      <div className="hier-combos">
        {TEAM_COMBOS.map((c) => {
          const opened = !!game.combos?.[c.id];
          return (
            <div
              key={c.id}
              className={`hier-combo${opened ? ' on' : ''}`}
              title={opened ? `${c.condition} → ${c.effect}` : 'Скрытая комбинация — доведите игру до релиза этим составом'}
            >
              <b>{opened ? c.name : '???'}</b>
              {opened && <span>{c.effect}</span>}
            </div>
          );
        })}
      </div>

      {drag && ghost && (
        <div
          className="hierfield-ghost"
          style={{ left: ghost.x - ghost.ox, top: ghost.y - ghost.oy, width: FIELD.CARD_W, height: FIELD.CARD_H }}
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
  );
}
