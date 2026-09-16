// Юнит-тесты формул (09_Формулы_и_данные.md) — якоря из research.
import { describe, expect, it } from 'vitest';
import {
  comboMult, debugRate, distributePoints, fanMult, judgeScore, pricePerCopy, projectCost,
  reviewTotal, salesPlan, spreadScores, totalBugs, weeklyPoints, hypeMult, weekFactor, baseWeekShares,
} from '../src/core/formulas';
import { createRng, type Rng } from '../src/core/rng';
import { CONFIG } from '../src/core/config';
import { comboGrade } from '../src/core/systems/dev';
import { CRITICS } from '../src/core/data/critics'; // PLAN-30: 10 журналов

const CRITIC_WEIGHTS = CRITICS.map((c) => c.weights);

describe('комбо (данные из research)', () => {
  it('RPG×Fantasy = S (Amazing)', () => {
    expect(comboGrade('rpg', 'fantasy')).toBe('S');
  });
  it('Puzzle×Reversi = S — дешёвый хит первого года', () => {
    expect(comboGrade('puzzle', 'reversi')).toBe('S');
  });
  it('Table×Mahjong = S', () => {
    expect(comboGrade('table', 'mahjong')).toBe('S');
  });
  it('Action×Fantasy = C', () => {
    expect(comboGrade('action', 'fantasy')).toBe('C');
  });
  it('Sim RPG (жанр-исключение) всегда C', () => {
    expect(comboGrade('sim-rpg', 'fantasy')).toBe('C');
    expect(comboGrade('sim-rpg', 'robot')).toBe('C');
  });
  it('Harbor (тип-исключение) всегда C', () => {
    expect(comboGrade('rpg', 'harbor')).toBe('C');
    expect(comboGrade('motion', 'harbor')).toBe('C');
  });
  it('множители градаций упорядочены', () => {
    expect(comboMult('S')).toBeGreaterThan(comboMult('A'));
    expect(comboMult('A')).toBeGreaterThan(comboMult('B'));
    expect(comboMult('C')).toBe(1);
    expect(comboMult('F')).toBe(0.5);
  });
});

describe('стоимость проекта', () => {
  it('Пазл+Реверси на PC (normal) ≈ 150K (60K × DEV_COST_SCALE 2.5)', () => {
    const cost = projectCost(300, 0, 0, 1, 'normal'); // 300万 → 30K + тип 30K
    expect(cost).toBeGreaterThan(140);
    expect(cost).toBeLessThan(160);
  });
  it('множители режимов: speed +20%, quality +30%, budget ×2', () => {
    const base = projectCost(300, 0, 0, 1, 'normal');
    expect(projectCost(300, 0, 0, 1, 'speed')).toBeCloseTo(base * 1.2);
    expect(projectCost(300, 0, 0, 1, 'quality')).toBeCloseTo(base * 1.3);
    expect(projectCost(300, 0, 0, 1, 'budget')).toBeCloseTo(base * 2);
  });
  it('консольный множитель масштабирует стоимость', () => {
    const pc = projectCost(300, 0, 0, 1, 'normal');
    expect(projectCost(300, 0, 0, 8, 'normal')).toBeCloseTo(pc * 8);
  });
});

describe('рецензии', () => {
  it('атрибуты ~100 → низ шкалы (не Зал Славы)', () => {
    const attrs = { fun: 100, creativity: 100, graphics: 100, sound: 100 };
    for (let noise = -1; noise <= 1; noise++) {
      const total = reviewTotal(judgeScore(attrs, CRITIC_WEIGHTS, 0, noise).scores);
      expect(total).toBeGreaterThanOrEqual(30);
      expect(total).toBeLessThan(50);
    }
  });
  it('PLAN-30: по 2000 в каждом направлении, шум 0 → все десять ставят 10 = 100/100', () => {
    const attrs = { fun: 2000, creativity: 2000, graphics: 2000, sound: 2000 };
    const { scores } = judgeScore(attrs, CRITIC_WEIGHTS, 0, 0);
    expect(scores).toHaveLength(10);
    expect(scores.every((x) => x === 10)).toBe(true);
    expect(reviewTotal(scores)).toBe(100);
  });
  it('Зал Славы (≥80) — примерно с 1550 во всём', () => {
    const attrs = { fun: 1550, creativity: 1550, graphics: 1550, sound: 1550 };
    expect(reviewTotal(judgeScore(attrs, CRITIC_WEIGHTS, 0, 0).scores)).toBeGreaterThanOrEqual(80);
  });
  it('баги на релизе снижают оценку', () => {
    const attrs = { fun: 1600, creativity: 1600, graphics: 1600, sound: 1600 };
    const clean = reviewTotal(judgeScore(attrs, CRITIC_WEIGHTS, 0, 0).scores);
    const buggy = reviewTotal(judgeScore(attrs, CRITIC_WEIGHTS, 40, 0).scores);
    expect(buggy).toBeLessThan(clean);
  });
  it('разные журналы дают разные оценки (веса)', () => {
    const attrs = { fun: 2000, creativity: 40, graphics: 40, sound: 40 };
    const { scores } = judgeScore(attrs, CRITIC_WEIGHTS, 0, 0);
    expect(scores[3]!).toBeGreaterThan(scores[7]!); // «ПыСы Игры» (fun 1.2) против «Краешка» (fun 0.6)
  });
});

describe('баги', () => {
  it('≈66 багов на игру 3000K (чемпион лаборатории M6) — порог антипремии ~60', () => {
    expect(totalBugs(3000, 'normal', 'C')).toBe(Math.round(3000 * CONFIG.BUGS_PER_COST));
  });
  it('speed даёт больше багов, quality меньше', () => {
    expect(totalBugs(1000, 'speed', 'C')).toBeGreaterThan(totalBugs(1000, 'normal', 'C'));
    expect(totalBugs(1000, 'quality', 'C')).toBeLessThan(totalBugs(1000, 'normal', 'C'));
  });
  it('комбо F добавляет баги', () => {
    expect(totalBugs(1000, 'normal', 'F')).toBe(totalBugs(1000, 'normal', 'C') + 10);
  });
  it('скорость отладки = Σ Program × DEBUG_RATE (в день)', () => {
    expect(debugRate([{ program: 40 }, { program: 60 }])).toBeCloseTo(100 * CONFIG.DEBUG_RATE);
  });
});

describe('продажи', () => {
  it('PC: нейтральная игра → ~16K копий (16 в тыс.), ~320K дохода', () => {
    const plan = salesPlan({
      installBase: 500, score: 20, combo: 'C', pop: 'B',
      fans: 0, fame: 10, hype: 10, sequel: false, consoleMult: 1, releaseWeek: 1,
    });
    // единицы: installBase и totalUnits — в тысячах
    expect(plan.totalUnits).toBeGreaterThan(10);
    expect(plan.totalUnits).toBeLessThan(25);
    expect(plan.totalRevenue).toBeGreaterThan(200);
  });
  it('PLAN-32: неделя с 1 мая (день года 30) продаёт в 1.5–2 раза сильнее', () => {
    // релиз 24: 1 мая попадает в первую неделю (дни 24…30)
    const plan = salesPlan({
      installBase: 1000, score: 20, combo: 'C', pop: 'B',
      fans: 0, fame: 10, hype: 10, sequel: false, consoleMult: 1, releaseWeek: 24,
    });
    const wk = (n: number) => plan.weeks.slice(n * 7, n * 7 + 7).reduce((a, w) => a + (w.unitsF ?? w.units), 0);
    expect(weekFactor(24, 0).high).toBe(true);
    // у праздничной недели надбавка ×1.5+ сверх базы, у соседней — разброс максимум +15%
    expect(wk(0)).toBeGreaterThan(wk(1) * 1.2);
  });
  it('хит (36+, S, A-популярность) на 6M-консоли → ~1M копий (1000 в тыс.)', () => {
    const plan = salesPlan({
      installBase: 6000, score: 36, combo: 'S', pop: 'A',
      fans: 500, fame: 40, hype: 60, sequel: true, consoleMult: 8, releaseWeek: 100,
    });
    expect(plan.totalUnits).toBeGreaterThan(500);
    expect(plan.totalUnits).toBeLessThan(5000);
  });
  it('цена копии растёт с множителем консоли мягко', () => {
    expect(pricePerCopy(1)).toBeCloseTo(CONFIG.PRICE_BASE);
    expect(pricePerCopy(30)).toBeCloseTo(CONFIG.PRICE_BASE * (1 + 29 * 0.15));
  });
  it('фанаты и хайп усиливают продажи', () => {
    const base = salesPlan({ installBase: 500, score: 20, combo: 'C', pop: 'B', fans: 0, fame: 10, hype: 10, sequel: false, consoleMult: 1, releaseWeek: 1 });
    const fans = salesPlan({ installBase: 500, score: 20, combo: 'C', pop: 'B', fans: 5000, fame: 90, hype: 90, sequel: false, consoleMult: 1, releaseWeek: 1 });
    expect(fans.totalUnits).toBeGreaterThan(base.totalUnits * 2);
  });
});

describe('персонал и время', () => {
  it('недельные очки: 2 сотрудника × стат 20 → ~20/нед', () => {
    const pts = weeklyPoints([{ stat: 20, power: 8 }, { stat: 20, power: 8 }], 'normal', 0);
    expect(pts).toBeCloseTo(20);
  });
  it('усталость снижает вклад', () => {
    const full = weeklyPoints([{ stat: 40, power: 8 }], 'normal', 0);
    const tired = weeklyPoints([{ stat: 40, power: 1 }], 'normal', 0);
    expect(tired).toBeLessThan(full);
  });
  it('fanMult: 0 фанатов → 1.0, растёт логарифмически с капом', () => {
    expect(fanMult(0)).toBeCloseTo(1);
    expect(fanMult(9900)).toBeLessThanOrEqual(3.0);
    expect(hypeMult(10, 10)).toBeCloseTo(0.9);
    expect(hypeMult(100, 100)).toBeCloseTo(1.8);
  });
});

describe('направление (09 §2.3: 10 очков = норма)', () => {
  // свои веса, чтобы тест не зависел от баланса данных: ось x → Fun, ось y → Creativity
  const W = {
    x: { fun: 1, creativity: 0, graphics: 0, sound: 0 },
    y: { fun: 0, creativity: 1, graphics: 0, sound: 0 },
  };

  it('пустое направление — только база (70%)', () => {
    const p = distributePoints(100, {}, W);
    expect(p.fun).toBeCloseTo(28); // 70 × 0.4
    expect(p.creativity).toBeCloseTo(21); // 70 × 0.3
  });

  it('10 распределённых очков = полный бонус (норма)', () => {
    const p = distributePoints(100, { x: 10 }, W);
    expect(p.fun).toBeCloseTo(28 + 30); // база + норма × вес
  });

  it('сумма усиливает эффект: 5 очков — половина, 20 — вдвое', () => {
    expect(distributePoints(100, { x: 5 }, W).fun).toBeCloseTo(28 + 15);
    expect(distributePoints(100, { x: 20 }, W).fun).toBeCloseTo(28 + 60);
  });

  it('две оси складываются по своим весам', () => {
    const p = distributePoints(100, { x: 6, y: 4 }, W);
    expect(p.fun).toBeCloseTo(28 + 18);
    expect(p.creativity).toBeCloseTo(21 + 12);
  });

  it('ось без известных весов игнорируется', () => {
    expect(distributePoints(100, { vibes: 10 }, W).fun).toBeCloseTo(28);
  });
});

describe('PLAN-32: распределение продаж (обратный easeOutCubic, праздники, разброс)', () => {
  it('база: ранние недели заметно различимы, хвост к нулю, сумма = 1', () => {
    const bw = baseWeekShares();
    expect(bw[0]!).toBeGreaterThan(bw[1]! * 1.08);
    expect(bw[1]!).toBeGreaterThan(bw[2]! * 1.08);
    expect(bw[15]!).toBeLessThan(bw[0]! * 0.15);
    expect(bw.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });

  it('множители недель: праздник ×1.5–2, иначе ±15%; в окне апреля праздники есть', () => {
    for (let w = 0; w < 24; w++) {
      const f = weekFactor(1, w);
      if (f.high) {
        expect(f.factor).toBeGreaterThanOrEqual(1.5);
        expect(f.factor).toBeLessThanOrEqual(2);
      } else {
        expect(f.factor).toBeGreaterThanOrEqual(0.85);
        expect(f.factor).toBeLessThanOrEqual(1.15);
      }
    }
    expect(Array.from({ length: 24 }, (_, w) => weekFactor(1, w).high).some(Boolean)).toBe(true);
  });

  it('сумма за жизнь держится в прежних пределах (разброс нормирован, праздники — сверху)', () => {
    const plan = salesPlan({
      installBase: 1000, score: 20, combo: 'C', pop: 'B',
      fans: 0, fame: 10, hype: 10, sequel: false, consoleMult: 1, releaseWeek: 1,
    });
    const total = plan.weeks.reduce((a, w) => a + (w.unitsF ?? w.units), 0);
    expect(total).toBeGreaterThan(plan.totalUnits * 0.95);
    expect(total).toBeLessThan(plan.totalUnits * 1.3);
  });
});

describe('v1.18.0: разброс оценок критиков (±2, итог гуляет, 100 — удача)', () => {
  const stub = (v: number): Rng => ({ next: () => 0.5, int: () => v, chance: () => false, state: 0 });
  const TEN = Array(10).fill(10);
  const THREE = Array(10).fill(3);

  it('каждая оценка — в пределах ±2 от базы (с учётом клампов 3…10)', () => {
    const base = [3, 4, 6, 10, 10, 7, 5, 8, 9, 10];
    const r = spreadScores(base, stub(2));
    expect(r).toEqual([5, 6, 8, 10, 10, 9, 7, 10, 10, 10]);
    const r2 = spreadScores(base, stub(-2));
    expect(r2).toEqual([3, 3, 4, 8, 8, 5, 3, 6, 7, 8]);
  });

  it('потолок: +2 не пробивает 10; сотня достижима (все «не ниже потолка»)', () => {
    expect(reviewTotal(spreadScores(TEN, stub(2)))).toBe(100);
    expect(reviewTotal(spreadScores(TEN, stub(0)))).toBe(100);
    const down = spreadScores(TEN, stub(-2));
    expect(down.every((v) => v === 8)).toBe(true);
    expect(reviewTotal(down)).toBe(80);
  });

  it('пол: −2 держит 3, ниже 30 сумма не падает', () => {
    expect(reviewTotal(spreadScores(THREE, stub(-2)))).toBe(30);
    expect(reviewTotal(spreadScores(THREE, stub(0)))).toBe(30);
    expect(reviewTotal(spreadScores(THREE, stub(2)))).toBe(50);
  });

  it('середина: разброс есть почти всегда, средняя сумма держится у базы', () => {
    const base = Array(10).fill(6);
    const rng = createRng(42);
    let sum = 0;
    let varied = 0;
    for (let k = 0; k < 200; k++) {
      const r = spreadScores(base, rng);
      sum += reviewTotal(r);
      if (new Set(r).size > 1) varied++;
    }
    expect(varied).toBeGreaterThan(190);
    expect(Math.abs(sum / 200 - 60)).toBeLessThan(2);
  });

  it('крутая игра: типичный итог меньше 100, сотня — редкость (сотни прогонов)', () => {
    const rng = createRng(7);
    let sum = 0;
    let n100 = 0;
    for (let k = 0; k < 500; k++) {
      const t = reviewTotal(spreadScores(TEN, rng));
      sum += t;
      if (t === 100) n100++;
    }
    const avg = sum / 500;
    expect(avg).toBeGreaterThan(85);
    expect(avg).toBeLessThan(99);
    expect(n100).toBeGreaterThanOrEqual(0);
    expect(n100).toBeLessThanOrEqual(25); // ожидаемо ~0.6% (≈3 из 500)
  });
});
