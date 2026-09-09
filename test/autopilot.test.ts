// Автопилот (plan/14): валидация решения LLM + обёртка политики (не стартует проекты сама).
import { describe, expect, it } from 'vitest';
import { newGame, tick } from '../src/core/engine';
import { createAutopilotPolicy, validateDecision } from '../src/server/autopilot';
import { autopilotProjectInput } from '../src/core/sim/policy';
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
