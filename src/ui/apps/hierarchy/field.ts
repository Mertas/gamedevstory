// PLAN-55: «поле иерархии» — раскладка дерева по координатам, подразделения и хит-тесты.
// Чистая геометрия без React: её проверяют тесты, а компонент только рисует.
import type { CareerId } from '../../../core/data/schema';
import type { Staff } from '../../../core/types';

export const FIELD = {
  CARD_W: 200,
  CARD_H: 58,
  GAP_X: 18,
  GAP_Y: 58,
  PAD: 20,
  /** Рамка подразделения: сверху место под бейдж, по бокам/снизу — воздух. */
  UNIT_TOP: 20,
  UNIT_SIDE: 10,
  UNIT_BOTTOM: 8,
} as const;

export type UnitLevel = 'group' | 'service' | 'department';
export const UNIT_RANK: Record<UnitLevel, number> = { group: 1, service: 2, department: 3 };

export const UNIT_META: Record<UnitLevel, { icon: string; word: string }> = {
  group: { icon: '👥', word: 'Группа' },
  service: { icon: '🛡', word: 'Служба' },
  department: { icon: '🏛', word: 'Отдел' },
};

/** Профессия → основа названия подразделения (женский/мужской род подобран вручную). */
const UNIT_TEAM: Record<string, string> = {
  coder: 'разработки',
  writer: 'сценария',
  designer: 'дизайна',
  sound: 'звука',
  director: 'режиссуры',
  producer: 'продюсирования',
  hw: 'инженерии',
  hacker: 'хакеров',
};
const UNIT_FEM: Record<string, string> = {
  coder: 'Группа разработки',
  writer: 'Сценарная группа',
  designer: 'Группа дизайна',
  sound: 'Звуковая группа',
  director: 'Режиссёрская группа',
  producer: 'Продюсерская группа',
  hw: 'Инженерная группа',
  hacker: 'Хакерская группа',
};
const UNIT_SERVICE: Record<string, string> = {
  coder: 'Служба разработки',
  writer: 'Сценарная служба',
  designer: 'Служба дизайна',
  sound: 'Звуковая служба',
  director: 'Режиссёрская служба',
  producer: 'Продюсерская служба',
  hw: 'Инженерная служба',
  hacker: 'Хакерская служба',
};
const UNIT_DEPT: Record<string, string> = {
  coder: 'Отдел разработки',
  writer: 'Сценарный отдел',
  designer: 'Отдел дизайна',
  sound: 'Звуковой отдел',
  director: 'Режиссёрский отдел',
  producer: 'Продюсерский отдел',
  hw: 'Инженерный отдел',
  hacker: 'Хакерский отдел',
};

/** Уровень подразделения по высоте подчинённого дерева: 1 → группа, 2 → служба, 3+ → отдел. */
export function unitLevelByHeight(height: number): UnitLevel | null {
  if (height <= 0) return null;
  if (height === 1) return 'group';
  if (height === 2) return 'service';
  return 'department';
}

export function unitName(level: UnitLevel, career: CareerId | 'mixed'): string {
  const map = level === 'group' ? UNIT_FEM : level === 'service' ? UNIT_SERVICE : UNIT_DEPT;
  if (career === 'mixed') return `${UNIT_META[level].word} студии`;
  return map[career] ?? `${UNIT_META[level].word} ${UNIT_TEAM[career] ?? ''}`.trim();
}

export interface FieldCard {
  id: string;
  staff: Staff;
  x: number;
  y: number;
  depth: number;
  isOwner: boolean;
  /** Есть ли прямые подчинённые (значит, сотрудник — начальник). */
  direct: number;
  /** Высота подчинённого поддерева: 0 — лист, 1.. — уровней вниз. */
  height: number;
  unitLevel: UnitLevel | null;
  unitLabel: string | null;
}

export interface FieldUnit {
  id: string;
  bossId: string;
  bossName: string;
  level: UnitLevel;
  label: string;
  icon: string;
  count: number;
  /** Все сотрудники подразделения: начальник и всё поддерево (для сумм статов). */
  memberIds: string[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FieldEdge {
  from: string;
  to: string;
  d: string;
}

export interface FieldModel {
  cards: FieldCard[];
  units: FieldUnit[];
  edges: FieldEdge[];
  byId: Map<string, FieldCard>;
  width: number;
  height: number;
  ownerId: string | null;
}

function careerOf(s: Staff): CareerId {
  return s.activeCareer;
}

/** Доминирующая профессия подразделения; mixed — если явного большинства нет. */
function dominantCareer(members: Staff[]): CareerId | 'mixed' {
  const counts = new Map<string, number>();
  for (const s of members) counts.set(careerOf(s), (counts.get(careerOf(s)) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [c, k] of counts) if (k > n) { n = k; best = c; }
  if (!best || n * 2 <= members.length) return 'mixed';
  return best as CareerId;
}

/**
 * Разложить дерево сотрудников по полю.
 * Листья идут в ряд слева направо, руководитель центрируется над своими детьми.
 */
export function buildField(staff: Staff[]): FieldModel {
  const byStaff = new Map(staff.map((s) => [s.id, s] as const));
  const owner = staff.find((s) => s.hero) ?? staff[0];
  const ownerId = owner?.id ?? null;

  const children = new Map<string, Staff[]>();
  const rootKids: Staff[] = [];
  for (const s of staff) {
    if (!owner || s.id === owner.id) continue;
    let boss = s.bossId ?? null;
    if (boss && (boss === owner.id || !byStaff.has(boss) || boss === s.id)) boss = null;
    if (boss) {
      const arr = children.get(boss) ?? [];
      arr.push(s);
      children.set(boss, arr);
    } else {
      rootKids.push(s);
    }
  }

  const pos = new Map<string, { x: number; y: number; depth: number }>();
  const seen = new Set<string>();
  let cursor = FIELD.PAD;

  const place = (s: Staff, depth: number): void => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    const kids = (children.get(s.id) ?? []).filter((k) => !seen.has(k.id));
    if (kids.length === 0) {
      pos.set(s.id, { x: cursor, y: FIELD.PAD + depth * (FIELD.CARD_H + FIELD.GAP_Y), depth });
      cursor += FIELD.CARD_W + FIELD.GAP_X;
      return;
    }
    const before = cursor;
    for (const k of kids) place(k, depth + 1);
    const ys = kids.map((k) => pos.get(k.id)).filter(Boolean) as { x: number; y: number }[];
    const first = ys.reduce((a, b) => (a.x <= b.x ? a : b));
    const last = ys.reduce((a, b) => (a.x >= b.x ? a : b));
    const x = Math.round((first.x + last.x) / 2);
    pos.set(s.id, { x, y: FIELD.PAD + depth * (FIELD.CARD_H + FIELD.GAP_Y), depth });
    // Поддерево могло не продвинуть курсор (единственный ребёнок) — сдвигаем на его ширину.
    if (cursor === before) cursor += FIELD.CARD_W + FIELD.GAP_X;
  };

  const cards: FieldCard[] = [];
  const pushCard = (s: Staff, depth: number, isOwner: boolean) => {
    const p = pos.get(s.id);
    if (!p) return;
    const kids = (children.get(s.id) ?? []).filter((k) => pos.has(k.id));
    // высота поддерева
    let height = 0;
    const stack = kids.map((k) => ({ id: k.id, d: 1 }));
    const guard = new Set<string>();
    while (stack.length) {
      const cur = stack.pop()!;
      if (guard.has(cur.id)) continue;
      guard.add(cur.id);
      height = Math.max(height, cur.d);
      for (const k of children.get(cur.id) ?? []) stack.push({ id: k.id, d: cur.d + 1 });
    }
    const members = [s, ...collect(s.id, children, new Set())];
    const lvl = unitLevelByHeight(height);
    cards.push({
      id: s.id,
      staff: s,
      x: p.x,
      y: p.y,
      depth,
      isOwner,
      direct: kids.length,
      height,
      unitLevel: lvl,
      unitLabel: lvl && kids.length ? unitName(lvl, dominantCareer(members)) : null,
    });
  };

  if (owner) {
    place(owner, 0);
    // Прямые подчинённые владельца — со своими поддеревьями.
    for (const s of rootKids) if (!seen.has(s.id)) place(s, 1);
    // Недостижимые (битые bossId / циклы) — плоским рядом, чтобы не терять людей.
    for (const s of staff) {
      if (!seen.has(s.id)) {
        pos.set(s.id, { x: cursor, y: FIELD.PAD + (FIELD.CARD_H + FIELD.GAP_Y), depth: 1 });
        cursor += FIELD.CARD_W + FIELD.GAP_X;
        seen.add(s.id);
      }
    }
    pushCard(owner, 0, true);
    for (const s of staff) if (s.id !== owner.id) pushCard(s, pos.get(s.id)!.depth, false);
  }

  const cardById = new Map(cards.map((c) => [c.id, c] as const));
  // Владелец — по центру над первым уровнем.
  const ownerCard = cards.find((c) => c.isOwner);
  const row = cards.filter((c) => c.depth === 1);
  if (ownerCard && row.length) {
    const left = Math.min(...row.map((c) => c.x));
    const right = Math.max(...row.map((c) => c.x + FIELD.CARD_W));
    ownerCard.x = Math.round((left + right) / 2 - FIELD.CARD_W / 2);
  }
  const minX = cards.reduce((m, c) => Math.min(m, c.x), Infinity);
  const shift = Number.isFinite(minX) ? FIELD.PAD - minX : 0;
  for (const c of cards) c.x += shift;
  const width = cards.reduce((m, c) => Math.max(m, c.x + FIELD.CARD_W), 0) + FIELD.PAD;
  const height = cards.reduce((m, c) => Math.max(m, c.y + FIELD.CARD_H), 0) + FIELD.PAD;

  // Рамки подразделений: у всех, у кого есть подчинённые.
  const units: FieldUnit[] = [];
  for (const c of cards) {
    const kids = (children.get(c.id) ?? []).filter((k) => cardById.has(k.id));
    if (!kids.length || !c.unitLevel || !c.unitLabel) continue;
    let x1 = c.x;
    let x2 = c.x + FIELD.CARD_W;
    let y2 = c.y + FIELD.CARD_H;
    const stack = [...kids];
    const guard = new Set<string>();
    while (stack.length) {
      const k = stack.pop()!;
      if (guard.has(k.id)) continue;
      guard.add(k.id);
      const kc = cardById.get(k.id);
      if (!kc) continue;
      x1 = Math.min(x1, kc.x);
      x2 = Math.max(x2, kc.x + FIELD.CARD_W);
      y2 = Math.max(y2, kc.y + FIELD.CARD_H);
      for (const g of children.get(k.id) ?? []) stack.push(g);
    }
    units.push({
      id: c.id,
      bossId: c.id,
      bossName: c.staff.name,
      level: c.unitLevel,
      label: c.unitLabel,
      icon: UNIT_META[c.unitLevel].icon,
      count: countSubtree(c.id, children, new Set()) + 1,
      memberIds: [c.id, ...collect(c.id, children, new Set()).map((k) => k.id)],
      x: x1 - FIELD.UNIT_SIDE,
      y: c.y - FIELD.UNIT_TOP,
      w: x2 - x1 + FIELD.UNIT_SIDE * 2,
      h: y2 - c.y + FIELD.UNIT_TOP + FIELD.UNIT_BOTTOM,
    });
  }
  // Большие рамки — под маленькими, чтобы вложенные были видны.
  units.sort((a, b) => b.w * b.h - a.w * a.h);

  const edges: FieldEdge[] = [];
  for (const c of cards) {
    if (c.id === ownerId) continue;
    const s = byStaff.get(c.id);
    let bossId = s?.bossId ?? null;
    if (!bossId || !cardById.has(bossId)) bossId = ownerId;
    if (!bossId || bossId === c.id) continue;
    const p = cardById.get(bossId);
    if (!p) continue;
    const x1 = p.x + FIELD.CARD_W / 2;
    const y1 = p.y + FIELD.CARD_H;
    const x2 = c.x + FIELD.CARD_W / 2;
    const y2 = c.y;
    const dy = Math.max(16, (y2 - y1) / 2);
    edges.push({ from: bossId, to: c.id, d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}` });
  }

  return { cards, units, edges, byId: cardById, width: Math.max(width, FIELD.CARD_W + FIELD.PAD * 2), height, ownerId };
}

function collect(id: string, children: Map<string, Staff[]>, guard: Set<string>): Staff[] {
  const out: Staff[] = [];
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const s = stack.pop()!;
    if (guard.has(s.id)) continue;
    guard.add(s.id);
    out.push(s);
    for (const k of children.get(s.id) ?? []) stack.push(k);
  }
  return out;
}

function countSubtree(id: string, children: Map<string, Staff[]>, guard: Set<string>): number {
  return collect(id, children, guard).length;
}

/** Карточка под точкой (координаты поля). */
export function hitCard(model: FieldModel, px: number, py: number): FieldCard | null {
  for (const c of model.cards) {
    if (px >= c.x && px <= c.x + FIELD.CARD_W && py >= c.y && py <= c.y + FIELD.CARD_H) return c;
  }
  return null;
}

/** Подразделение под точкой: сначала самое маленькое (вложенное). */
export function hitUnit(model: FieldModel, px: number, py: number): FieldUnit | null {
  const sorted = [...model.units].sort((a, b) => a.w * a.h - b.w * b.h);
  for (const u of sorted) {
    if (px >= u.x && px <= u.x + u.w && py >= u.y && py <= u.y + u.h) return u;
  }
  return null;
}

/** Является ли id потомком ancestorId (по дереву поля). */
export function isDescendant(model: FieldModel, ancestorId: string, id: string): boolean {
  const seen = new Set<string>();
  let cur = model.byId.get(id)?.staff.bossId ?? null;
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true;
    seen.add(cur);
    cur = model.byId.get(cur)?.staff.bossId ?? null;
  }
  return false;
}

/** Можно ли бросить dragId на targetId (targetId = владелец разрешён). */
export function canDrop(model: FieldModel, dragId: string, targetId: string): boolean {
  if (dragId === targetId) return false;
  const target = model.byId.get(targetId);
  if (!target) return false;
  if (target.isOwner) return true;
  return !isDescendant(model, dragId, targetId);
}
