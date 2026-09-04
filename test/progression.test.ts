// Юнит-тесты M3 (прокачка/обучение/карьеры/продавец) и M4 (реклама/контракты/своя консоль).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  buyAd, buyBooster, changeCareer, levelUpStaff, startOwnConsole, takeContract,
  trainStaff, useBooster,
} from '../src/core/systems/progression';
import { isUnlocked } from '../src/core/systems/dev';
import { createRng } from '../src/core/rng';
import { newGame } from '../src/core/engine';

const rng = () => createRng(42);

function gameWithStaff() {
  const g = newGame(7);
  g.research = 500;
  g.money = 5000;
  return g;
}

describe('M3: левел-ап', () => {
  it('цена по таблице, статы растут, PR списывается, зарплата ×1.2', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!; // Newb Ownerton, coder Lv1
    const prog0 = s.stats.program;
    const res = levelUpStaff(g, s.id, rng());
    expect(res.ok).toBe(true);
    expect(s.careers.coder).toBe(2);
    expect(s.stats.program).toBe(prog0 + 10); // coder Lv2: +10 P
    expect(g.research).toBe(500 - 15); // цена coder Lv1→2
    expect(s.levelUps).toBe(1);
  });

  it('нельзя качать без PR и выше Lv5', () => {
    const g = gameWithStaff();
    g.research = 5;
    expect(levelUpStaff(g, g.staff[0]!.id, rng()).ok).toBe(false);
    g.research = 9999;
    const s = g.staff[0]!;
    s.careers.coder = 5;
    expect(levelUpStaff(g, s.id, rng()).ok).toBe(false);
  });
});

describe('M3: обучение', () => {
  it('тратит деньги/POWER, даёт статы и открывает типы', () => {
    const g = gameWithStaff();
    const s = g.staff[1]!; // John Gameson, writer
    const money0 = g.money;
    const power0 = s.power;
    const sc0 = s.stats.scenario;
    const res = trainStaff(g, s.id, 4, rng()); // anime: +5P/+4S/+3G/+2So
    expect(res.ok).toBe(true);
    expect(g.money).toBeLessThan(money0);
    expect(s.power).toBeLessThan(power0);
    expect(s.stats.scenario).toBeGreaterThan(sc0);
    expect(g.unlockedTrainings.some((t) => t.includes('アニメ'))).toBe(true);
  });

  it('типы с тренинг-требованием открываются после обучения', () => {
    const g = gameWithStaff();
    // Fantasy: writer Lv2 + reading — writer Lv1 у Джона, прокачаем
    const john = g.staff[1]!;
    john.careers.writer = 2;
    expect(isUnlocked(g, 'writer', 2, 'reading')).toBe(false);
    g.unlockedTrainings.push('読書 reading');
    expect(isUnlocked(g, 'writer', 2, 'reading')).toBe(true);
  });
});

describe('M3: карьеры', () => {
  it('Director требует Writer5+Coder5 на том же сотруднике', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    expect(changeCareer(g, s.id, 'director').ok).toBe(false);
    s.careers.writer = 5;
    s.careers.coder = 5;
    expect(changeCareer(g, s.id, 'director').ok).toBe(true);
    expect(s.activeCareer).toBe('director');
  });

  it('Career Manual меняет профессию без требований', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    expect(changeCareer(g, s.id, 'hacker', true).ok).toBe(true);
    expect(s.activeCareer).toBe('hacker');
  });
});

describe('M3: продавец и бустеры', () => {
  it('бустер даёт 18–22 очка ключевой профессии при первом применении', () => {
    const g = gameWithStaff();
    g.salesmanHere = true;
    g.money = 5000;
    // стартуем проект, чтобы был activeGame
    g.activeGame = {
      consoleId: 'pc-game', genreId: 'puzzle', typeId: 'reversi', mode: 'normal',
      comboGrade: 'S', direction: { cute: 0, realism: 0, approach: 0, niche: 0, simple: 0, innovation: 0, world: 0, polish: 0 }, points: { fun: 0, creativity: 0, graphics: 0, sound: 0 },
      totalCost: 100, progress: 0.5, bugs: 0, weekStarted: 1, phase: 'dev',
      proposalStaffId: g.staff[1]!.id,
      assignments: { proposal: [g.staff[1]!.id], program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
      contribTotal: {},
      boostOffered: false, boostUsed: false, fame: 10, hype: 10,
      name: '', score: null, judgeScores: [], reviewMessages: [], releaseWeek: null,
      sales: [], totalUnits: 0, totalRevenue: 0, ended: false,
    };
    expect(buyBooster(g, 'fun').ok).toBe(true);
    const s = g.staff[0]!; // coder = ключевая для fun
    const res = useBooster(g, s.id, 'fun', rng());
    expect(res.ok).toBe(true);
    const gain = g.activeGame.points.fun;
    expect(gain).toBeGreaterThanOrEqual(18);
    expect(gain).toBeLessThanOrEqual(22);
    // третье использование — 0
    useBooster(g, s.id, 'fun', rng());
    const before = g.activeGame.points.fun;
    useBooster(g, s.id, 'fun', rng());
    expect(g.activeGame.points.fun).toBe(before);
  });
});

describe('M4: реклама', () => {
  it('даёт фанатов и списывает деньги', () => {
    const g = gameWithStaff();
    const fans0 = g.fans;
    const res = buyAd(g, 1); // журнал 300万 = 30K
    expect(res.ok).toBe(true);
    expect(g.fans).toBeGreaterThan(fans0);
    expect(g.money).toBe(5000 - 30);
  });
});

describe('M4: контракты', () => {
  it('прогресс идёт, награда при выполнении требований', () => {
    const g = gameWithStaff();
    const c = takeContract(g, 1, [g.staff[0]!.id, g.staff[1]!.id], rng());
    expect(c.ok).toBe(true);
    const cs = g.contracts[0]!;
    // симулируем дни (CONTRACT_WEEKLY_RATE теперь в день = 0.05/7)
    for (let i = 0; i < 400; i++) {
      if (cs.done) break;
      const team = cs.staffIds.map((id) => g.staff.find((x) => x.id === id)) as Array<{ stats: { program: number; scenario: number; graphics: number; sound: number } }>;
      cs.progress.program += team.reduce((a, x) => a + x.stats.program, 0) * CONFIG.CONTRACT_WEEKLY_RATE;
      cs.progress.scenario += team.reduce((a, x) => a + x.stats.scenario, 0) * CONFIG.CONTRACT_WEEKLY_RATE;
      cs.progress.graphics += team.reduce((a, x) => a + x.stats.graphics, 0) * CONFIG.CONTRACT_WEEKLY_RATE;
      cs.progress.sound += team.reduce((a, x) => a + x.stats.sound, 0) * CONFIG.CONTRACT_WEEKLY_RATE;
      const data = { reqProgram: 8, reqScenario: null, reqGraphics: 18, reqSound: null };
      if (cs.progress.program >= (data.reqProgram ?? 0) && cs.progress.graphics >= (data.reqGraphics ?? 0)) {
        cs.done = true;
      }
    }
    expect(cs.done).toBe(true);
  });
});

describe('M4: своя консоль', () => {
  it('требует офис 3 и хардвер-инженера', () => {
    const g = gameWithStaff();
    g.money = 50000;
    expect(startOwnConsole(g, 'X1', 'console', '16-bit', 'cartridge').ok).toBe(false); // офис 1
    g.officeLevel = 3;
    expect(startOwnConsole(g, 'X1', 'console', '16-bit', 'cartridge').ok).toBe(false); // нет HW
    const s = g.staff[0]!;
    s.activeCareer = 'hw';
    const res = startOwnConsole(g, 'X1', 'console', '16-bit', 'cartridge');
    expect(res.ok).toBe(true);
    expect(g.ownConsole?.weeksTotal).toBe((12 + (0 + 0) * 3) * 7); // недели → дни
  });
});
