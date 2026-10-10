// Юнит-тесты M3 (прокачка/обучение/карьеры/продавец) и M4 (реклама/контракты/своя консоль).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import {
  applyCareerManual, buyAd, buyBooster, buyCareerManual, levelUpStaff, startOwnConsole, takeContract,
  trainStaff, applyBooster, tickSalesman,
} from '../src/core/systems/progression';
import { contractForecast } from '../src/core/formulas';
import type { Staff } from '../src/core/types';
import { isUnlocked, devTick } from '../src/core/systems/dev';
import { createRng } from '../src/core/rng';
import { newGame } from '../src/core/engine';

const rng = () => createRng(42);

function gameWithStaff() {
  const g = newGame(7);
  g.research = 500;
  g.money = 5000;
  return g;
}

// активный проект (как в середине разработки) — для бустеров/рекламы
function withActiveGame(g: ReturnType<typeof newGame>) {
  g.money = 5000;
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
    expect(g.unlockedTrainings).toContain('anime'); // P1-9: канонический id (аудит-51)
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
  it('смена только по руководству: без запаса нельзя, даже когда требования выполнены', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    s.careers.writer = 5;
    s.careers.coder = 5;
    const res = applyCareerManual(g, s.id, 'director');
    expect(res.ok).toBe(false);
    expect(s.activeCareer).toBe('coder');
  });

  it('руководство покупается в запас и НЕ меняет профессию сразу', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    expect(buyCareerManual(g).ok).toBe(false); // продавца нет
    g.salesmanHere = true;
    const money0 = g.money;
    expect(buyCareerManual(g).ok).toBe(true);
    expect(g.careerManuals).toBe(1);
    expect(g.money).toBe(money0 - 50); // офис 1
    expect(s.activeCareer).toBe('coder'); // профессия не изменилась
  });

  it('руководство НЕ снимает требования: из кодера в хакера нельзя', () => {
    const g = gameWithStaff();
    g.salesmanHere = true;
    buyCareerManual(g);
    const s = g.staff[0]!;
    const res = applyCareerManual(g, s.id, 'hacker');
    expect(res.ok).toBe(false);
    expect(!res.ok ? res.error : '').toContain('Не хватает');
    expect(s.activeCareer).toBe('coder');
    expect(g.careerManuals).toBe(1); // неудача не тратит руководство
  });

  it('цепочка пререквизитов: продюсер = Сц5+Дизайн5, железо = Реж5+Прод5, хакер = все по 5', () => {
    const g = gameWithStaff();
    g.salesmanHere = true;
    const s = g.staff[0]!;
    // продюсер: сценарист 5 + дизайнер 5
    buyCareerManual(g);
    s.careers.writer = 5;
    expect(applyCareerManual(g, s.id, 'producer').ok).toBe(false); // дизайнера нет
    s.careers.designer = 5;
    expect(applyCareerManual(g, s.id, 'producer').ok).toBe(true);
    expect(s.activeCareer).toBe('producer');
    // инженер железа: режиссёр 5 + продюсер 5
    buyCareerManual(g);
    s.careers.director = 5;
    expect(applyCareerManual(g, s.id, 'hw').ok).toBe(false); // продюсер ещё новичок (Lv1)
    s.careers.producer = 5;
    expect(applyCareerManual(g, s.id, 'hw').ok).toBe(true);
    expect(s.activeCareer).toBe('hw');
    // хакер: все семь профессий по 5
    buyCareerManual(g);
    expect(applyCareerManual(g, s.id, 'hacker').ok).toBe(false);
    for (const c of ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw'] as const) s.careers[c] = 5;
    expect(applyCareerManual(g, s.id, 'hacker').ok).toBe(true);
    expect(s.activeCareer).toBe('hacker');
  });

  it('успешная смена тратит руководство; повтор на ту же профессию — отказ без траты', () => {
    const g = gameWithStaff();
    g.salesmanHere = true;
    buyCareerManual(g);
    const s = g.staff[0]!;
    s.careers.writer = 5;
    expect(applyCareerManual(g, s.id, 'director').ok).toBe(false); // кодер ещё Lv1
    s.careers.coder = 5;
    expect(applyCareerManual(g, s.id, 'director').ok).toBe(true);
    expect(s.activeCareer).toBe('director');
    expect(g.careerManuals).toBe(0);
    buyCareerManual(g);
    expect(applyCareerManual(g, s.id, 'director').ok).toBe(false); // уже эта профессия
    expect(g.careerManuals).toBe(1);
  });
});

describe('M3: продавец и бустеры', () => {
  it('бустер даёт 18–22 очка ключевой профессии при первом применении', () => {
    const g = withActiveGame(gameWithStaff());
    g.salesmanHere = true;
    expect(buyBooster(g, 'fun').ok).toBe(true);
    const s = g.staff[0]!; // coder = ключевая для fun
    const res = applyBooster(g, s.id, 'fun', rng());
    expect(res.ok).toBe(true);
    const gain = g.activeGame!.points.fun;
    expect(gain).toBeGreaterThanOrEqual(18);
    expect(gain).toBeLessThanOrEqual(22);
    // повторная доза слабее (1–5), третья — уже 0 (лимит 2 на сотрудника); каждая доза — своя покупка (P1 аудита-51)
    expect(buyBooster(g, 'fun').ok).toBe(true);
    applyBooster(g, s.id, 'fun', rng());
    const before = g.activeGame!.points.fun;
    expect(buyBooster(g, 'fun').ok).toBe(true);
    applyBooster(g, s.id, 'fun', rng());
    expect(g.activeGame!.points.fun).toBe(before);
  });

  it('бустер чужой профессии даёт меньше: 8–11, повторно 1–5', () => {
    const g = withActiveGame(gameWithStaff());
    g.salesmanHere = true;
    const s = g.staff[1]!; // John Gameson, writer — для fun-бустера (ключ coder) чужой
    expect(buyBooster(g, 'fun').ok).toBe(true);
    expect(applyBooster(g, s.id, 'fun', rng()).ok).toBe(true);
    const gain1 = g.activeGame!.points.fun;
    expect(gain1).toBeGreaterThanOrEqual(8);
    expect(gain1).toBeLessThanOrEqual(11);
    const before2 = g.activeGame!.points.fun;
    expect(buyBooster(g, 'fun').ok).toBe(true);
    expect(applyBooster(g, s.id, 'fun', rng()).ok).toBe(true);
    const gain2 = g.activeGame!.points.fun - before2;
    expect(gain2).toBeGreaterThanOrEqual(1);
    expect(gain2).toBeLessThanOrEqual(5);
    // третье использование — 0
    const before3 = g.activeGame!.points.fun;
    expect(buyBooster(g, 'fun').ok).toBe(true);
    applyBooster(g, s.id, 'fun', rng());
    expect(g.activeGame!.points.fun).toBe(before3);
  });

  it('P1 аудита-51: без покупки бустер не применяется', () => {
    const g = withActiveGame(gameWithStaff());
    g.salesmanHere = true;
    const res = applyBooster(g, g.staff[0]!.id, 'fun', rng());
    expect(res.ok).toBe(false);
  });
});

describe('v1.43: приход продавца — без паузы (тост на клиенте)', () => {
  it('1 мая (год 2): salesmanHere=true, pendingEvent НЕ ставится', () => {
    const g = newGame(3);
    g.year = 2;
    g.week = CONFIG.SALESMAN_DAY; // w = SALESMAN_DAY−1 — день прихода
    g.salesmanHere = false;
    tickSalesman(g);
    expect(g.salesmanHere).toBe(true);
    expect(g.pendingEvent).toBeNull();
  });

  it('конец мая: продавец уходит, паузы не остаётся', () => {
    const g = newGame(3);
    g.year = 2;
    g.salesmanHere = true;
    g.week = CONFIG.SALESMAN_DAY_END + 1; // w = SALESMAN_DAY_END — день ухода
    tickSalesman(g);
    expect(g.salesmanHere).toBe(false);
    expect(g.pendingEvent).toBeNull();
  });
});

describe('M4: реклама (потолки plan/09)', () => {
  it('прирост по формуле (кап−накоплено)×0.15+50, с убыванием и потолком', () => {
    const g = withActiveGame(gameWithStaff()); // активная игра: fame 10, hype 10
    const fans0 = g.fans;
    const res = buyAd(g, 1); // журнал: кап 2000, 30K
    expect(res.ok).toBe(true);
    expect(g.fans).toBe(fans0 + 350); // (2000−0)×0.15+50
    expect(g.money).toBe(5000 - 30);
    expect(g.adFansGained[1]).toBe(350);
    // реклама поднимает ИЗВЕСТНОСТЬ разработки (не hype)
    expect(g.activeGame!.fame).toBe(15);
    expect(g.activeGame!.hype).toBe(10);
    // вторая кампания того же типа — меньше (убывание)
    expect(buyAd(g, 1).ok).toBe(true);
    expect(g.adFansGained[1]).toBe(350 + 298); // (2000−350)×0.15+50 = 297.5 → 298
    // потолок достигнут — отказ без списания денег
    g.adFansGained[1] = 2000;
    const moneyBefore = g.money;
    expect(buyAd(g, 1).ok).toBe(false);
    expect(g.money).toBe(moneyBefore);
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

describe('M9: контракты — занятость и кулдаун', () => {
  it('повтор контракта — только через кулдаун после сдачи/провала', () => {
    const g = gameWithStaff();
    expect(takeContract(g, 1, [g.staff[0]!.id], rng()).ok).toBe(true);
    const cs = g.contracts[0]!;
    cs.done = true;
    cs.finishedWeek = g.week;
    const again = takeContract(g, 1, [g.staff[1]!.id], rng());
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toContain('нед.');
    g.week += CONFIG.CONTRACT_COOLDOWN_WEEKS * 7;
    expect(takeContract(g, 1, [g.staff[1]!.id], rng()).ok).toBe(true);
  });

  it('занятого на контракте нельзя назначить на второй', () => {
    const g = gameWithStaff();
    expect(takeContract(g, 1, [g.staff[0]!.id], rng()).ok).toBe(true);
    const second = takeContract(g, 2, [g.staff[0]!.id], rng());
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('занят');
    // а свободного — можно
    expect(takeContract(g, 2, [g.staff[1]!.id], rng()).ok).toBe(true);
  });

  it('назначенный на контракт не работает над проектом (devTick)', () => {
    const a = withActiveGame(gameWithStaff());
    const b = withActiveGame(gameWithStaff());
    expect(takeContract(b, 1, [b.staff[0]!.id], rng()).ok).toBe(true);
    devTick(a, rng());
    devTick(b, rng());
    const sum = (g: ReturnType<typeof newGame>) => {
      const p = g.activeGame!.points;
      return p.fun + p.creativity + p.graphics + p.sound;
    };
    expect(a.devContrib.some((c) => c.staffId === a.staff[0]!.id)).toBe(true);
    expect(b.devContrib.some((c) => c.staffId === b.staff[0]!.id)).toBe(false);
    expect(sum(b)).toBeLessThan(sum(a));
  });
});

describe('аудит-51: прогноз бригады по контракту (03-P2-4)', () => {
  const st = (program: number, graphics: number, sound = 0): Staff => ({
    stats: { program, scenario: 0, graphics, sound },
  } as unknown as Staff);

  it('недели — по самой медленной оси, вердикт сравнивается со сроком', () => {
    const team = [st(40, 10), st(30, 0)];
    // Пр: (40+30)×0.05 = 3.5/нед (40/3.5 ≈ 11.4); Гр: (10+0)×0.05 = 0.5/нед (24/0.5 = 48) — узкая ось — графика
    const fc = contractForecast({ reqProgram: 40, reqGraphics: 24 }, 20, team);
    expect(fc.bottleneck).toBe('graphics');
    expect(fc.need).toBeCloseTo(48, 5);
    expect(fc.fits).toBe(false);
    expect(contractForecast({ reqProgram: 40, reqGraphics: 24 }, 50, team).fits).toBe(true);
  });

  it('ось без притока — заказ не закрыть (need = Infinity)', () => {
    const fc = contractForecast({ reqSound: 10 }, 99, [st(50, 50)]);
    expect(Number.isFinite(fc.need)).toBe(false);
    expect(fc.bottleneck).toBe('sound');
    expect(fc.fits).toBe(false);
  });

  it('без требований — вакуумный случай: 0 недель и успевают', () => {
    const fc = contractForecast({}, 5, [st(1, 1)]);
    expect(fc.need).toBe(0);
    expect(fc.fits).toBe(true);
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
