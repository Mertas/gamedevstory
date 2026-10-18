// PLAN-53: «Иерархия» — дерево подчинения с перетаскиванием аватарок.
// Владелец (ГГ) в корне; сотрудника можно перетащить на другого сотрудника или на владельца.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CONFIG } from '../../../core/config';
import { effectiveStats, nextSeatPrice, seatsOf, type StatBlock } from '../../../core/systems/hierarchy';
import { COMBO_AWARDS, TEAM_COMBOS } from '../../../core/systems/combos';
import { STAT_SHORT } from '../../../shared/train';
import { fmtK } from '../../../shared/nums';
import { StaffAvatar, AV } from '../../StaffAvatar';
import { actionBuySeat, actionSetBoss, useGame } from '../../store';
import type { Staff } from '../../../core/types';

export function HierarchyApp() {
  const game = useGame();
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const eff = useMemo(() => effectiveStats(game), [game]);
  const owner = game.staff.find((s) => s.hero);
  const seats = seatsOf(game);
  const price = nextSeatPrice(game);

  const childrenOf = (id: string | null) => game.staff.filter((s) => !s.hero && (s.bossId ?? null) === id);

  const drop = (bossId: string | null) => {
    if (drag) actionSetBoss(drag, bossId);
    setDrag(null);
    setOver(null);
  };

  const card = (s: Staff, isRoot = false) => {
    const e = eff.get(s.id) ?? s.stats;
    const bonus = (k: keyof StatBlock) => Math.round(e[k] - s.stats[k]);
    return (
      <div
        key={s.id}
        className={`hier-card${over === s.id ? ' over' : ''}${isRoot ? ' root' : ''}${drag === s.id ? ' drag' : ''}`}
        draggable={!isRoot}
        onDragStart={() => { if (!isRoot) setDrag(s.id); }}
        onDragOver={(ev) => { if (!isRoot && drag && drag !== s.id) { ev.preventDefault(); setOver(s.id); } }}
        onDrop={(ev) => { ev.preventDefault(); drop(isRoot ? null : s.id); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        title={isRoot ? 'Владелец студии — вершина дерева' : `${s.name}: перетащите на руководителя`}
      >
        <StaffAvatar staff={s} variant={AV.hireTeam} />
        <div className="hier-info">
          <div>
            <b>{s.name}</b>
            {isRoot ? ' — владелец' : ` · ${s.activeCareer} Lv${s.careers[s.activeCareer] ?? 1}`}
          </div>
          <div className="hier-stats">
            {(['program', 'scenario', 'graphics', 'sound'] as const).map((k) => (
              <span key={k}>
                {STAT_SHORT[k]} {Math.round(Math.min(e[k], CONFIG.GAME_STAT_CAP))}
                {bonus(k) > 0 && <span className="hier-bonus"> +{bonus(k)}</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const branch = (parentId: string | null, depth: number): ReactNode => (
    <div className="hier-children">
      {childrenOf(parentId).map((s) => (
        <div key={s.id} className="hier-node">
          {card(s)}
          {depth < 12 && branch(s.id, depth + 1)}
        </div>
      ))}
    </div>
  );

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%', gap: 4 }}>
      <div className="w95-row">
        <b>Иерархия студии</b>
        <span className="w95-hint" style={{ marginLeft: 'auto' }}>мест: {game.staff.length}/{seats}</span>
        <button className="w95-btn" onClick={() => actionBuySeat()} disabled={game.money < price} data-autopilot="buy-seat">
          💺 Купить место ({fmtK(price)})
        </button>
      </div>
      <div className="w95-hint">
        Перетащите сотрудника на другого — назначите руководителя. На владельца — вернуть в корень.
        Руководитель раздаёт излишек статов сверх {CONFIG.GAME_STAT_CAP} (×{CONFIG.HIERARCHY_EXCESS};
        каждый уровень глубже — ещё ×{CONFIG.HIERARCHY_DEPTH_FALLOFF}). В статы игры идут первые{' '}
        {CONFIG.GAME_STAT_CAP} каждого стата.
      </div>
      {owner ? card(owner, true) : <div className="w95-hint">Владелец не найден.</div>}
      {owner && branch(null, 0)}
      {game.staff.length <= 1 && (
        <div className="w95-hint">Пока в студии только вы — наймите команду в приложении «Найм».</div>
      )}

      <h4 className="w95-help-sub" style={{ marginTop: 8 }}>
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
    </div>
  );
}
