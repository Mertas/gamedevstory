// PLAN-48: главный герой (игрок) и партнёр — старт, защита от увольнения, два варианта расставания.
import { describe, expect, it } from 'vitest';
import { fireAction, newGame, partnerBuyoutAction, partnerRentAction } from '../src/core/engine';
import { dailySales } from '../src/core/systems/market';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { STAFF } from '../src/core/data/db';
import { HERO_CHARACTERS, sanitizeHeroStats } from '../src/shared/hero';
import type { ActiveGame, GameState } from '../src/core/types';

const HERO = {
  name: 'Марк',
  avatarId: 'player-03',
  stats: { program: 20, scenario: 10, graphics: 5, sound: 5 },
  career: 'coder' as const,
  persona: HERO_CHARACTERS[4]!.persona,
};

/** минимальная выпущенная игра с продажами на текущей неделе — для проверки ренты */
function releasedGame(g: GameState, revenue: number): ActiveGame {
  const consoleId = Object.keys(g.consoles)[0]!;
  return {
    consoleId, genreId: 'x', typeId: 'y', mode: 'normal', comboGrade: 'A',
    direction: {}, points: { fun: 0, creativity: 0, graphics: 0, sound: 0 }, totalCost: 0, progress: 1,
    bugs: 0, weekStarted: 1, phase: 'released', proposalStaffId: null, assignments: {},
    contribTotal: {}, boostOffered: false, boostUsed: false, fame: 0, hype: 0, name: 'Тест',
    score: 80, judgeScores: [], reviewMessages: [], releaseWeek: 1,
    sales: [{ week: g.week, units: 100, revenue }],
    totalUnits: 100, totalRevenue: revenue, ended: false,
  } as unknown as ActiveGame;
}

describe('PLAN-48: главный герой (игрок)', () => {
  it('новый старт: ГГ + партнёр; статы партнёра +D ко всем четырём', () => {
    const g = newGame(1, { hero: HERO, partnerId: 's-presso', partnerPct: 12 });
    expect(g.staff.length).toBe(2);
    const h = g.staff[0]!;
    expect(h.hero).toBe(true);
    expect(h.id).toBe('hero');
    expect(h.name).toBe('Марк');
    expect(h.avatarId).toBe('player-03');
    expect(h.stats).toEqual({ program: 20, scenario: 10, graphics: 5, sound: 5 });
    expect(h.careers.coder).toBe(1); // профессия — 1 lvl
    expect(h.activeCareer).toBe('coder');
    expect(h.persona).toBe(HERO.persona); // характер уходит в LLM-чат
    expect(h.salary).toBe(20); // стандартный оклад — и у ГГ тоже
    expect(h.hireFee).toBe(0);
    const d = STAFF.find((x) => x.id === 's-presso')!;
    const p = g.staff[1]!;
    expect(p.partnerPct).toBe(12);
    for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
      expect(p.stats[k]).toBe(d.stats[k] + 12);
      expect(p.caps[k]).toBeGreaterThanOrEqual(p.stats[k]);
    }
    expect(p.hireFee).toBe(0); // со-основатель — без взноса
    expect(g.hiredIds).toEqual(['hero', 's-presso']);
  });

  it('ГГ нельзя уволить — даже прямым действием', () => {
    const g = newGame(1, { hero: HERO, partnerId: 'dee-coder', partnerPct: 5 });
    const res = fireAction(g, 'hero');
    expect(res.ok).toBe(false);
    expect(g.staff.some((s) => s.hero)).toBe(true);
  });

  it('партнёра нельзя уволить обычным способом — только два варианта', () => {
    const g = newGame(1, { hero: HERO, partnerId: 'dee-coder', partnerPct: 5 });
    const res = fireAction(g, 'dee-coder');
    expect(res.ok).toBe(false);
    expect(g.staff.length).toBe(2);
  });

  it('выкуп доли: списывает D% кассы и убирает партнёра из команды', () => {
    const g = newGame(1, { hero: HERO, partnerId: 'dee-coder', partnerPct: 20 });
    const p = g.staff.find((s) => s.partnerPct === 20)!;
    const before = g.money;
    const res = partnerBuyoutAction(g);
    expect(res.ok).toBe(true);
    expect(g.money).toBe(before - Math.round(before * 0.2)); // 20% кассы разом
    expect(g.staff.some((s) => s.partnerPct !== undefined)).toBe(false);
    expect(g.hiredIds).not.toContain(p.id);
  });

  it('рента: ставит D/4 % (при D=20 → 5) и убирает партнёра', () => {
    const g = newGame(1, { hero: HERO, partnerId: 'dee-coder', partnerPct: 20 });
    const res = partnerRentAction(g);
    expect(res.ok).toBe(true);
    expect(g.partnerRentPct).toBe(5);
    expect(g.staff.some((s) => s.partnerPct !== undefined)).toBe(false);
  });

  it('рента режет дневные продажи игр (тихо, без попапов)', () => {
    const rent = newGame(1, { hero: HERO, partnerId: 'dee-coder', partnerPct: 20 });
    expect(partnerRentAction(rent).ok).toBe(true);
    rent.released.push(releasedGame(rent, 100));
    const before = rent.money;
    dailySales(rent);
    expect(rent.money - before).toBeCloseTo(95, 5); // 100 − 5%

    const free = newGame(1); // без ренты — полная сумма
    free.released.push(releasedGame(free, 100));
    const beforeFree = free.money;
    dailySales(free);
    expect(free.money - beforeFree).toBeCloseTo(100, 5);
  });

  it('санитайз статов: кап 30 на стат и сумма ≤ 40 очков', () => {
    const s = sanitizeHeroStats({ program: 99, scenario: 99, graphics: 99, sound: 99 });
    expect(Object.values(s).every((v) => v <= 30)).toBe(true);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(40);
    expect(sanitizeHeroStats({ program: -5, scenario: 10, graphics: 0, sound: 0 })).toEqual({ program: 0, scenario: 10, graphics: 0, sound: 0 });
  });

  it('битый partnerId не ломает старт: партнёр берётся из пула, доля сохраняется', () => {
    const g = newGame(5, { hero: HERO, partnerId: 'no-such', partnerPct: 3 });
    expect(g.staff.length).toBe(2);
    expect(g.staff[1]!.partnerPct).toBe(3);
  });

  it('легаси-старт без героя не изменился (двое из пула)', () => {
    const g = newGame(3, { staffIds: ['dee-coder', 's-presso'] });
    expect(g.staff.map((s) => s.id)).toEqual(['dee-coder', 's-presso']);
    expect(g.staff.every((s) => !s.hero && s.partnerPct === undefined)).toBe(true);
    expect(g.partnerRentPct).toBeUndefined(); // у новых партий без ренты поле пустое
  });

  it('миграция v13: старый сейв без героя живёт, рента = 0', () => {
    const g = newGame(1);
    g.saveVersion = 12;
    delete (g as Partial<GameState>).partnerRentPct;
    const m = migrateSave(g);
    expect(m.saveVersion).toBe(SAVE_VERSION);
    expect(m.partnerRentPct).toBe(0);
    expect(m.staff.map((s) => s.id)).toEqual(['newb-ownerton', 'john-gameson']);
  });
});
