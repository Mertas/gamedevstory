// Автопилот (plan/14): валидация решения LLM + обёртка политики (не стартует проекты сама).
import { describe, expect, it } from 'vitest';
import { newGame, startProjectAction, tick } from '../src/core/engine';
import { AutopilotController, createAutopilotPolicy, decisionReason, fitDirection, validateDecision } from '../src/server/autopilot';
import type { AutopilotHost } from '../src/server/autopilot';
import { autopilotProjectInput, sequelOpportunity } from '../src/core/sim/policy';
import { resetChat } from '../src/shared/chat';
import { planDirClicks } from '../src/shared/autopilot';
import type { AutopilotPlan } from '../src/shared/autopilot';
import type { GameState } from '../src/core/types';

function fresh(): GameState {
  const g = newGame(11);
  tick(g); // PC «поступила в продажу»
  return g;
}

function validPlan(g: GameState): AutopilotPlan {
  const input = autopilotProjectInput(g)!;
  return {
    genreId: input.genreId,
    typeId: input.typeId,
    consoleId: input.consoleId,
    mode: input.mode,
    direction: input.direction,
    proposalStaffId: input.proposalStaffId,
    assignments: input.assignments,
  };
}

describe('автопилот: validateDecision', () => {
  it('валидное решение (из политики) проходит', () => {
    const g = fresh();
    const err = validateDecision(validPlan(g), g);
    expect(err).toBeNull();
  });

  it('неизвестный жанр отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.genreId = 'no-such-genre';
    expect(validateDecision(plan, g)).toContain('жанр');
  });

  it('не купленная консоль отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.consoleId = 'microx-sx'; // лицензия не куплена
    expect(validateDecision(plan, g)).toContain('не куплена');
  });

  it('неизвестный сотрудник в ролях отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.assignments.program = ['ghost-id'];
    expect(validateDecision(plan, g)).toContain('ghost-id');
  });

  it('не хватает денег — отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g); // план строим ДО обнуления денег
    g.money = 1;
    expect(validateDecision(plan, g)).toContain('денег');
  });

  it('сотрудник в двух ролях отклоняется (одна роль на человека)', () => {
    const g = fresh();
    const plan = validPlan(g);
    const dup = g.staff[0]!.id;
    plan.assignments.program = [dup];
    plan.assignments.graphics = [dup];
    expect(validateDecision(plan, g)).toContain('двух ролях');
  });

  it('сценарист в другой роли отклоняется (движок добавит его в proposal сам)', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.assignments.program = [plan.proposalStaffId];
    expect(validateDecision(plan, g)).toContain('сценарист');
  });
});

describe('автопилот: назначение ролей — одна роль на человека', () => {
  it('assignRoles не повторяет сотрудника и не трогает сценариста (маленькая команда)', () => {
    const g = fresh();
    // команда из двух: у Newb высокие и program, и graphics — до фикса он попадал в обе роли
    const newb = g.staff.find((s) => s.id === 'newb-ownerton')!;
    newb.stats.program = 30;
    newb.stats.graphics = 30;
    const input = autopilotProjectInput(g)!;
    const ids = [
      ...input.assignments.program,
      ...input.assignments.graphics,
      ...input.assignments.sound,
      ...input.assignments.debug,
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(input.proposalStaffId);
  });
});

describe('автопилот: упор направления (решает LLM/чат, бюджет — из партии)', () => {
  it('перерасход очков направления отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.direction = { niche: 8, innovation: 8 }; // 16 > бюджета (10)
    expect(validateDecision(plan, g)).toContain('перерасходованы');
  });

  it('ось вне диапазона 0..8 отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.direction = { niche: 9 };
    expect(validateDecision(plan, g)).toContain('0..8');
  });

  it('неизвестная ось отклоняется', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.direction = { vibes: 3 };
    expect(validateDecision(plan, g)).toContain('неизвестная ось');
  });

  it('свой упор (нишевость + инновация) проходит — не обязан копировать доступность/полировку', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.direction = { niche: 6, innovation: 4 };
    expect(validateDecision(plan, g)).toBeNull();
  });

  it('fitDirection ужимает перерасход до бюджета, сохраняя топ-оси упора', () => {
    const g = fresh();
    const plan = validPlan(g);
    plan.direction = { niche: 8, innovation: 8 };
    fitDirection(plan, g.directionPoints); // 10
    expect(Object.values(plan.direction).reduce((a, b) => a + b, 0)).toBe(g.directionPoints);
    expect(plan.direction.niche).toBe(5);
    expect(plan.direction.innovation).toBe(5);
    expect(validateDecision(plan, g)).toBeNull(); // после ужатия решение проходит целиком
  });

  it('fitDirection не трогает упор, когда бюджет распределён полностью', () => {
    const g = fresh();
    const plan = validPlan(g); // готовый план занимает весь пул (10)
    const before = { ...plan.direction };
    fitDirection(plan, g.directionPoints);
    expect(plan.direction).toEqual(before);
  });

  it('fitDirection добивает недобор до полного пула (свободных очков не остаётся)', () => {
    const g = fresh();
    g.directionPoints = 20;
    const plan = validPlan(g);
    plan.direction = { niche: 6, innovation: 4 }; // LLM пожадничала — остаток добиваем
    fitDirection(plan, g.directionPoints);
    expect(plan.direction).toEqual({ cute: 4, niche: 8, innovation: 8 });
    expect(Object.values(plan.direction).reduce((a, b) => a + b, 0)).toBe(20);
    expect(validateDecision(plan, g)).toBeNull();
  });
});

describe('фолбэк-политика: упор тратит весь бюджет партии', () => {
  it('при 10 очках — 5/5 (как раньше, свежая игра не меняется)', () => {
    const g = fresh();
    const plan = autopilotProjectInput(g)!;
    expect(plan.direction).toEqual({ approach: 5, polish: 5 });
  });

  it('при 12 очках — 6/6, а не 5/5 с двумя свободными', () => {
    const g = fresh();
    g.directionPoints = 12;
    const plan = autopilotProjectInput(g)!;
    expect(plan.direction).toEqual({ approach: 6, polish: 6 });
    expect(Object.values(plan.direction).reduce((a, b) => a + b, 0)).toBe(g.directionPoints);
    expect(validateDecision(plan, g)).toBeNull();
  });

  it('остаток сверх двух осей — пакетами в свободные оси: 18 → милота 2 + 8/8', () => {
    const g = fresh();
    g.directionPoints = 18;
    const plan = autopilotProjectInput(g)!;
    expect(plan.direction).toEqual({ cute: 2, approach: 8, polish: 8 });
    expect(validateDecision(plan, g)).toBeNull();
  });

  it('большой пул (36) распределяется весь: ось ≤ 8, свободных нет', () => {
    const g = fresh();
    g.directionPoints = 36;
    const plan = autopilotProjectInput(g)!;
    const values = Object.values(plan.direction);
    expect(values.reduce((a, b) => a + b, 0)).toBe(36);
    expect(Math.max(...values)).toBeLessThanOrEqual(8);
    expect(validateDecision(plan, g)).toBeNull();
  });
});

describe('Ф5: причина решения (AP-02) и сиквелы (AP-05)', () => {
  function withHit(score = 34): GameState {
    const g = fresh();
    const input = autopilotProjectInput(g)!;
    g.history.push({
      name: 'Хит', genreId: input.genreId, typeId: input.typeId, consoleId: input.consoleId,
      score, units: 100, revenue: 1000, releaseWeek: 10, year: 1,
      attrs: { fun: 10, creativity: 10, graphics: 10, sound: 10 }, bugs: 0, awards: [],
    });
    return g;
  }

  it('AP-02: причина решения проговаривает серию, градацию и бюджет', () => {
    const g = withHit(34);
    const plan = validPlan(g);
    const why = decisionReason(g, plan);
    expect(why).toContain('серия');
    expect(why).toContain('34/40');
    expect(why).toContain('K');
  });

  it('AP-02: без хита причина говорит о градации и бюджете, без «серии»', () => {
    const g = fresh();
    const why = decisionReason(g, validPlan(g));
    expect(why).not.toContain('серия');
    expect(why.toLowerCase()).toMatch(/комбо|бюджет/);
  });

  it('AP-05: sequelOpportunity видит только игры зала славы', () => {
    const g = withHit(31); // ниже порога (32)
    expect(sequelOpportunity(g)).toBeNull();
    g.history[0]!.score = 33;
    expect(sequelOpportunity(g)).toEqual({ genreId: g.history[0]!.genreId, typeId: g.history[0]!.typeId, score: 33 });
  });

  it('AP-05: фолбэк предпочитает сиквел удачного комбо обычной «лучшей градации»', () => {
    const g = withHit(35);
    const seq = sequelOpportunity(g)!;
    const plan = autopilotProjectInput(g)!;
    expect(plan.genreId).toBe(seq.genreId);
    expect(plan.typeId).toBe(seq.typeId);
    expect(validateDecision({ ...plan, direction: plan.direction }, g)).toBeNull();
  });

  it('AP-05: сиквел не берём, если комбо снова не по деньгам — обычный выбор', () => {
    const g = withHit(35);
    const seq = sequelOpportunity(g)!;
    // обнуляем деньги так, чтобы только дёшевое комбо проходило
    g.money = 1;
    const plan = autopilotProjectInput(g);
    if (plan) expect([plan.genreId, plan.typeId]).not.toEqual([seq.genreId, seq.typeId]);
  });
});

describe('хореография направления (клиент): planDirClicks', () => {
  const AXES = ['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish'];

  it('план совпал с прошлым проектом — кликов НЕТ (жалоба «сброс до нуля и поднял те же»)', () => {
    expect(planDirClicks({ approach: 5, polish: 5 }, { approach: 5, polish: 5 }, AXES)).toEqual([]);
  });

  it('смена упора: сначала все «−» (освободить бюджет), потом «+» на новые оси', () => {
    const clicks = planDirClicks({ approach: 5, polish: 5 }, { niche: 6, innovation: 4 }, AXES);
    expect(clicks).toHaveLength(20);
    expect(clicks.slice(0, 10).every((c) => c.sign === -1)).toBe(true);
    expect(clicks.slice(10).every((c) => c.sign === 1)).toBe(true);
    expect(clicks.slice(0, 10).every((c) => c.axis === 'approach' || c.axis === 'polish')).toBe(true);
    expect(clicks.slice(10).map((c) => c.axis).join(',')).toBe('niche,niche,niche,niche,niche,niche,innovation,innovation,innovation,innovation');
  });

  it('ни одна ось не ходит «вниз и обратно вверх» за один проход', () => {
    const clicks = planDirClicks({ approach: 5, polish: 5, cute: 2 }, { niche: 6, cute: 4 }, AXES);
    const signs = new Map<string, Set<number>>();
    for (const c of clicks) {
      if (!signs.has(c.axis)) signs.set(c.axis, new Set());
      signs.get(c.axis)!.add(c.sign);
    }
    for (const set of signs.values()) expect(set.size).toBe(1);
    expect(clicks.filter((c) => c.axis === 'cute')).toEqual([{ axis: 'cute', sign: 1 }, { axis: 'cute', sign: 1 }]);
  });

  it('оси вне плана обнуляются, лишние ключи игнорируются', () => {
    const clicks = planDirClicks({ world: 3 }, { vibes: 4 }, AXES);
    expect(clicks).toEqual([{ axis: 'world', sign: -1 }, { axis: 'world', sign: -1 }, { axis: 'world', sign: -1 }]);
  });
});

describe('автопилот: политика-обёртка', () => {
  it('без события и без активной игры НЕ стартует проект', () => {
    const g = fresh();
    const ap = createAutopilotPolicy();
    ap.turn(g);
    expect(g.activeGame).toBeNull();
    expect(g.pendingEvent).toBeNull();
  });

  it('SRV-04: с висящим событием и без активной игры проект НЕ стартует (раньше стартовал мимо чата)', () => {
    const g = fresh();
    g.pendingEvent = { type: 'info', title: 'Тест', text: 'проверка SRV-04' };
    const ap = createAutopilotPolicy();
    ap.turn(g);
    expect(g.pendingEvent).toBeNull(); // событие зарезолвлено
    expect(g.activeGame).toBeNull(); // но проект политика сама не начала
  });

  it('резолвит буст-событие целиком за один ход (приём → результат → закрыт)', () => {
    const g = fresh();
    g.research = 50;
    g.pendingEvent = { type: 'boost', staffId: g.staff[0]!.id, cost: 10 };
    const ap = createAutopilotPolicy();
    ap.turn(g);
    // политика за один turn() проходит и приём буста, и закрытие boost_result
    expect(g.pendingEvent).toBeNull();
  });

  it('выпускает готовую игру (debug, баги ≤ 5)', () => {
    const g = fresh();
    // игра в отладке: запускаем проект политикой-фолбэком и сразу доводим до debug
    const input = autopilotProjectInput(g)!;
    g.pendingEvent = null;
    g.activeGame = {
      phase: 'debug',
      progress: 1,
      bugs: 3,
      weekStarted: g.week - 100,
      genreId: input.genreId,
      typeId: input.typeId,
      consoleId: input.consoleId,
      mode: input.mode,
      comboGrade: 'S',
      direction: input.direction,
      totalCost: 300,
      points: { fun: 80, creativity: 60, graphics: 50, sound: 40 },
      proposalStaffId: input.proposalStaffId,
      assignments: input.assignments,
      contribTotal: {},
      boostOffered: true,
      boostUsed: false,
      fame: 10,
      hype: 10,
      name: 'Autopilot Test',
      score: null,
      judgeScores: [],
      reviewMessages: [],
      releaseWeek: null,
      sales: [],
      totalUnits: 0,
      totalRevenue: 0,
      ended: false,
    } as unknown as GameState['activeGame'];
    const ap = createAutopilotPolicy();
    ap.turn(g);
    expect(g.history.length).toBe(1);
  });
});

describe('AP-07: адаптивный темп (скорость при автопилоте)', () => {
  function makeHost(g: GameState) {
    const speedLog: number[] = [];
    const host = {
      game: g,
      chat: resetChat(),
      llm: async () => ({ text: '', model: 'test' }),
      autopilotOn: false,
      speed: 1,
      setSpeed(v: number) { host.speed = v; speedLog.push(v); },
      decidedThisIdle: false,
      pendingPlan: null,
      chatThread: null,
      emit() {},
      emitStep() {},
      pushSystem() {},
      generatePhase: async () => {},
    };
    return { host: host as AutopilotHost, speedLog };
  }

  function hostWithGame() {
    const g = fresh();
    expect(startProjectAction(g, autopilotProjectInput(g)!).ok).toBe(true); // активная игра — обсуждение не побежит
    return makeHost(g);
  }

  it('старт ускоряет до 4×, уже разогнанные 8× не сбавляет', () => {
    const h1 = makeHost(fresh());
    new AutopilotController(h1.host).startAutopilot();
    expect(h1.host.speed).toBe(4);
    expect(h1.speedLog).toEqual([4]);
    const h2 = makeHost(fresh());
    h2.host.speed = 8;
    new AutopilotController(h2.host).startAutopilot();
    expect(h2.host.speed).toBe(8); // ставку не опускаем
    expect(h2.speedLog).toEqual([]);
  });

  it('событие — на 1×, после закрытия возвращается ускорение', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    expect(h.host.speed).toBe(4);
    h.host.game.pendingEvent = { type: 'info', title: 'Тест', text: 'Событие' };
    ap.maybeAutopilot();
    expect(h.host.speed).toBe(1); // драматургия: попап смотрим на человеческой скорости
    h.host.game.pendingEvent = null;
    ap.maybeAutopilot();
    expect(h.host.speed).toBe(4); // событие закрылось — команда снова гонит время
    expect(h.speedLog).toEqual([4, 1, 4]);
  });

  it('«Взять управление» возвращает темп, который был у босса', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    expect(h.host.speed).toBe(4);
    ap.stopAutopilot(true);
    expect(h.host.speed).toBe(1); // босс вернулся — время снова на его усмотрение
    // если босс сам крутил скорость при автопилоте — его выбор не трогаем
    const h2 = hostWithGame();
    const ap2 = new AutopilotController(h2.host);
    ap2.startAutopilot();
    h2.host.speed = 2;
    ap2.stopAutopilot(true);
    expect(h2.host.speed).toBe(2);
  });
});
