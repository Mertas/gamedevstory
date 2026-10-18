// PLAN-53: иерархия сотрудников — дерево подчинения, эффективные статы, места в офисе.
import { CONFIG } from '../config';
import { log } from '../log';
import { STAT_KEYS, type StatKey } from '../../shared/train';
import type { ActionResult, GameState, Staff } from '../types';

export type StatBlock = Record<StatKey, number>;

/** ГГ — владелец студии (вершина дерева). */
export function ownerOf(state: GameState): Staff | undefined {
  return state.staff.find((s) => s.hero);
}

/** Дети узла: bossId = null → прямые подчинённые владельца. */
export function childrenOf(state: GameState, bossId: string | null): Staff[] {
  return state.staff.filter((s) => !s.hero && (s.bossId ?? null) === bossId);
}

/** Является ли maybeAncestor предком staffId (защита от циклов при перетаскивании). */
export function isAncestor(state: GameState, staffId: string, maybeAncestor: string): boolean {
  let cur = state.staff.find((s) => s.id === staffId)?.bossId ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (cur === maybeAncestor) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = state.staff.find((s) => s.id === cur)?.bossId ?? null;
  }
  return false;
}

/** Назначить руководителя: bossId = null (или ГГ) — вернуть в корень к владельцу. */
export function assignBoss(state: GameState, staffId: string, bossId: string | null): ActionResult {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  if (s.hero) return { ok: false, error: 'Владелец студии — вершина дерева' };
  const owner = ownerOf(state);
  const target = bossId && bossId === owner?.id ? null : bossId;
  if (target === s.id) return { ok: false, error: 'Нельзя подчинить сотрудника самому себе' };
  if (target) {
    const boss = state.staff.find((x) => x.id === target);
    if (!boss) return { ok: false, error: 'Нет такого руководителя' };
    if (isAncestor(state, target, s.id)) return { ok: false, error: 'Нельзя: получится кольцо подчинения' };
  }
  s.bossId = target;
  const bossName = target ? state.staff.find((x) => x.id === target)?.name ?? target : owner?.name ?? 'владельцу';
  log(state, `${s.name}: руководитель — ${bossName}`);
  return { ok: true };
}

/** Уволили руководителя — его прямые подчинённые переходят к его руководителю. */
export function detachChildren(state: GameState, removedId: string): void {
  const removed = state.staff.find((s) => s.id === removedId);
  if (!removed) return;
  const newBoss = removed.bossId ?? null;
  for (const s of state.staff) {
    if ((s.bossId ?? null) === removedId) s.bossId = newBoss;
  }
}

/**
 * Эффективные статы: базовые + излишек предков (выше GAME_STAT_CAP).
 * Каждый предок раздаёт свой излишек по каждому стату отдельно:
 * прямому подчинённому — ×HIERARCHY_EXCESS, второму уровню — ещё ×0.5, и т.д.
 * Излишек считается от ЭФФЕКТИВНОГО стата предка — «башни» растут.
 */
export function effectiveStats(state: GameState): Map<string, StatBlock> {
  const out = new Map<string, StatBlock>();
  const memo = new Map<string, StatBlock>();
  const byId = new Map(state.staff.map((s) => [s.id, s] as const));
  const cap = CONFIG.GAME_STAT_CAP;

  const calc = (s: Staff, guard: Set<string>): StatBlock => {
    const cached = memo.get(s.id);
    if (cached) return cached;
    if (guard.has(s.id)) return { ...s.stats }; // битый сейв с циклом — без бонусов
    guard.add(s.id);
    const eff: StatBlock = { program: s.stats.program, scenario: s.stats.scenario, graphics: s.stats.graphics, sound: s.stats.sound };
    let cur = s.bossId ?? null;
    let dist = 1;
    const seen = new Set<string>([s.id]);
    while (cur && dist <= 16) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const p = byId.get(cur);
      if (!p) break;
      const pe = calc(p, guard);
      const k = CONFIG.HIERARCHY_EXCESS * Math.pow(CONFIG.HIERARCHY_DEPTH_FALLOFF, dist - 1);
      for (const key of STAT_KEYS) {
        const excess = Math.max(0, pe[key] - cap);
        if (excess > 0) eff[key] += excess * k;
      }
      cur = p.bossId ?? null;
      dist += 1;
    }
    guard.delete(s.id);
    memo.set(s.id, eff);
    return eff;
  };

  for (const s of state.staff) out.set(s.id, calc(s, new Set()));
  return out;
}

/** Вклад в игру: эффективные статы, но не выше 100 за каждый стат. */
export function cappedStats(eff: StatBlock): StatBlock {
  const cap = CONFIG.GAME_STAT_CAP;
  return {
    program: Math.min(eff.program, cap),
    scenario: Math.min(eff.scenario, cap),
    graphics: Math.min(eff.graphics, cap),
    sound: Math.min(eff.sound, cap),
  };
}

// ─── PLAN-53: места в офисе (кап убран, места покупаются по одному) ───

export function seatsOf(state: GameState): number {
  return Math.max(CONFIG.STAFF_SEATS_BASE, state.seats ?? CONFIG.STAFF_SEATS_BASE);
}

export function nextSeatPrice(state: GameState): number {
  const bought = seatsOf(state) - CONFIG.STAFF_SEATS_BASE;
  return Math.round(CONFIG.SEAT_PRICE_BASE * Math.pow(CONFIG.SEAT_PRICE_MULT, bought));
}

export function buySeat(state: GameState): ActionResult & { price?: number } {
  const price = nextSeatPrice(state);
  if (state.money < price) return { ok: false, error: `Нужно ${price}K на место` };
  state.money -= price;
  state.seats = seatsOf(state) + 1;
  log(state, `💺 Куплено место в офисе (−${price}K) — теперь мест: ${state.seats}`);
  return { ok: true, price };
}

/** Уровень «условий офиса» растёт с командой: 2-й — с 5 сотрудников, 3-й — с 8 (не падает). */
export function syncOfficeLevel(state: GameState): void {
  const n = state.staff.length;
  const lvl3 = CONFIG.OFFICE_LEVEL_AT[3] ?? 8;
  const lvl2 = CONFIG.OFFICE_LEVEL_AT[2] ?? 5;
  const target = n >= lvl3 ? 3 : n >= lvl2 ? 2 : 1;
  if (target > state.officeLevel) {
    state.officeLevel = target as 1 | 2 | 3;
    log(state, `🏢 Условия офиса ${target} включены: команда — ${n} чел.`);
  }
}
