// аудит-51 01-P2-10: нельзя остаться без сотрудников (легаси-партия без ГГ).
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { fireStaff } from '../src/core/systems/staff';

describe('fireStaff: защита от пустой студии (аудит-51 01-P2-10)', () => {
  it('последнего сотрудника уволить нельзя; при двух — можно, дальше снова нет', () => {
    const g = newGame(7);
    const lone = g.staff[0]!;
    lone.hero = false; // легаси-партия без ГГ и партнёра
    delete lone.partnerPct;
    g.staff = [lone];
    expect(fireStaff(g, lone.id).ok).toBe(false);
    expect(g.staff.length).toBe(1);

    const copy = { ...lone, id: `${lone.id}-x` };
    g.staff.push(copy);
    expect(fireStaff(g, copy.id).ok).toBe(true);
    expect(fireStaff(g, lone.id).ok).toBe(false); // снова последний
    expect(g.staff.length).toBe(1);
  });
});
