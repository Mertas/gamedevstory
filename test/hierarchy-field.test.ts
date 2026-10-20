// PLAN-55: поле иерархии — раскладка, подразделения, хит-тесты, правила drop.
import { describe, expect, it } from 'vitest';
import type { CareerId } from '../src/core/data/schema';
import type { Staff } from '../src/core/types';
import {
  buildField, canDrop, FIELD, hitCard, hitUnit, isDescendant, unitLevelByHeight, unitName,
} from '../src/ui/apps/hierarchy/field';

function staff(id: string, bossId: string | null = null, career: CareerId = 'coder', hero = false): Staff {
  return {
    id, name: id, gender: 'M', salary: 10, hireFee: 0, maxPower: 10, power: 10,
    stats: { program: 10, scenario: 10, graphics: 10, sound: 10 },
    careers: { coder: 1, writer: 0, designer: 0, sound: 0, director: 0, producer: 0, hw: 0, hacker: 0 },
    activeCareer: career, levelUps: 0, boosterUses: {}, avatar: '', homeWeeks: 0, lastRole: null,
    caps: { program: 100, scenario: 100, graphics: 100, sound: 100 },
    history: [], trainCount: {}, restDays: 0, bossId, hero,
  } as Staff;
}

function chain() {
  return [
    staff('owner', null, 'coder', true),
    staff('a', 'owner'),
    staff('b', 'a'),
    staff('c', 'b'),
  ];
}

describe('PLAN-55: уровни подразделений', () => {
  it('высота дерева задаёт уровень', () => {
    expect(unitLevelByHeight(0)).toBeNull();
    expect(unitLevelByHeight(1)).toBe('group');
    expect(unitLevelByHeight(2)).toBe('service');
    expect(unitLevelByHeight(3)).toBe('department');
    expect(unitLevelByHeight(9)).toBe('department');
  });

  it('название зависит от уровня и профессии', () => {
    expect(unitName('group', 'coder')).toBe('Группа разработки');
    expect(unitName('service', 'writer')).toBe('Сценарная служба');
    expect(unitName('department', 'sound')).toBe('Звуковой отдел');
    expect(unitName('group', 'mixed')).toBe('Группа студии');
  });
});

describe('PLAN-55: раскладка поля', () => {
  it('цепочка выстраивается вертикально, без сдвигов по X', () => {
    const m = buildField(chain());
    const o = m.byId.get('owner')!, a = m.byId.get('a')!, b = m.byId.get('b')!, c = m.byId.get('c')!;
    expect(o.x).toBe(a.x);
    expect(a.x).toBe(b.x);
    expect(b.x).toBe(c.x);
    expect(o.y).toBe(FIELD.PAD);
    expect(a.y).toBeGreaterThan(o.y);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
  });

  it('руководитель центрируется над ветками, карточки не пересекаются', () => {
    const m = buildField([
      staff('owner', null, 'coder', true),
      staff('a', 'owner'),
      staff('b', 'owner'),
      staff('c', 'a'),
      staff('d', 'a'),
      staff('e', 'b'),
    ]);
    const a = m.byId.get('a')!;
    const c = m.byId.get('c')!;
    const d = m.byId.get('d')!;
    expect(a.x).toBe((c.x + d.x) / 2);

    for (let i = 0; i < m.cards.length; i++) {
      for (let j = i + 1; j < m.cards.length; j++) {
        const A = m.cards[i]!;
        const B = m.cards[j]!;
        const overlap = A.x < B.x + FIELD.CARD_W && B.x < A.x + FIELD.CARD_W
          && A.y < B.y + FIELD.CARD_H && B.y < A.y + FIELD.CARD_H;
        expect(overlap, `${A.id} и ${B.id} пересекаются`).toBe(false);
      }
    }
  });

  it('владелец стоит по центру над плоским рядом', () => {
    const m = buildField([
      staff('owner', null, 'coder', true),
      staff('a'),
      staff('b'),
      staff('c'),
    ]);
    const o = m.byId.get('owner')!;
    const xs = ['a', 'b', 'c'].map((id) => m.byId.get(id)!.x);
    const center = (Math.min(...xs) + Math.max(...xs) + FIELD.CARD_W) / 2;
    expect(Math.abs(o.x + FIELD.CARD_W / 2 - center)).toBeLessThanOrEqual(1);
  });

  it('битый bossId не теряет сотрудника', () => {
    const m = buildField([staff('owner', null, 'coder', true), staff('a', 'nobody')]);
    expect(m.byId.has('a')).toBe(true);
    expect(m.edges.some((e) => e.to === 'a' && e.from === 'owner')).toBe(true);
  });
});

describe('PLAN-55: подразделения и drop', () => {
  it('рамки: группа → служба → отдел и счётчик людей', () => {
    const m = buildField(chain());
    expect(m.units.find((u) => u.id === 'c')).toBeUndefined(); // лист
    expect(m.units.find((u) => u.id === 'b')!.level).toBe('group');
    expect(m.units.find((u) => u.id === 'b')!.count).toBe(2);
    expect(m.units.find((u) => u.id === 'a')!.level).toBe('service');
    expect(m.units.find((u) => u.id === 'a')!.count).toBe(3);
    expect(m.units.find((u) => u.id === 'owner')).toBeUndefined();
  });

  it('рамка охватывает подчинённых', () => {
    const m = buildField(chain());
    const u = m.units.find((x) => x.id === 'a')!;
    expect(u.x).toBeLessThanOrEqual(m.byId.get('b')!.x);
    expect(u.y).toBeLessThan(m.byId.get('a')!.y);
    expect(u.y + u.h).toBeGreaterThanOrEqual(m.byId.get('c')!.y + FIELD.CARD_H);
  });

  it('хит-тесты находят карточку и вложенную рамку', () => {
    const m = buildField(chain());
    const b = m.byId.get('b')!;
    expect(hitCard(m, b.x + 5, b.y + 5)!.id).toBe('b');
    expect(hitCard(m, -100, -100)).toBeNull();
    const hit = hitUnit(m, b.x + 5, b.y + 5)!;
    expect(hit.id).toBe('b'); // самая маленькая рамка
  });

  it('нельзя бросить на себя и на своего потомка, можно на владельца', () => {
    const m = buildField(chain());
    expect(canDrop(m, 'a', 'a')).toBe(false);
    expect(canDrop(m, 'a', 'c')).toBe(false);
    expect(canDrop(m, 'c', 'a')).toBe(true);
    expect(canDrop(m, 'a', 'owner')).toBe(true);
    expect(isDescendant(m, 'a', 'c')).toBe(true);
    expect(isDescendant(m, 'c', 'a')).toBe(false);
  });
});
