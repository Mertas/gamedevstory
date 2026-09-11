// Автопилот (plan/14): валидация решения LLM + обёртка политики (не стартует проекты сама).
import { describe, expect, it, vi } from 'vitest';
import { newGame, startProjectAction, tick } from '../src/core/engine';
import { AutopilotController, buildDecisionContext, createAutopilotPolicy, fitDirection, policySteps, validateDecision } from '../src/server/autopilot';
import type { AutopilotHost } from '../src/server/autopilot';
import { ChatOrchestrator } from '../src/server/chatflow';
import type { ChatThread } from '../src/server/game';
import { autopilotProjectInput, sequelOpportunity, weakKey, type PolicyAction } from '../src/core/sim/policy';
import { STAFF } from '../src/core/data/db';
import { candidatePool, makeStaffFromData } from '../src/core/systems/staff';
import { resetChat } from '../src/shared/chat';
import { planDirClicks } from '../src/shared/autopilot';
import type { AutopilotPlan, AutopilotStep } from '../src/shared/autopilot';
import type { GameRecord, GameState } from '../src/core/types';

function fresh(): GameState {
  const g = newGame(11);
  tick(g); // PC «поступила в продажу»
  return g;
}

/** Фейковый хост автопилота: скорость/фазы/чат под наблюдением. */
function makeHost(g: GameState) {
  const speedLog: number[] = [];
  const phases: string[] = [];
  const systems: string[] = [];
  const discussions: { author: string; text: string }[][] = [];
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
    pushSystem(t: string) { systems.push(t); },
    publishDiscussion(lines: { author: string; text: string }[]) { discussions.push(lines); },
    generatePhase: async (p: string) => { phases.push(p); },
  };
  return { host: host as AutopilotHost, speedLog, phases, systems, discussions };
}

function hostWithGame() {
  const g = fresh();
  expect(startProjectAction(g, autopilotProjectInput(g)!).ok).toBe(true); // активная игра — обсуждение не побежит
  return makeHost(g);
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

describe('автопилот: решение чата (16) — обсуждение и план из одного ответа', () => {
  it('реплики публикуются, план с названием ждёт клика; «Почему так» больше нет', async () => {
    const g = fresh();
    const h = makeHost(g);
    const base = autopilotProjectInput(g)!;
    const decision = {
      genreId: base.genreId, typeId: base.typeId, consoleId: base.consoleId, mode: base.mode,
      direction: base.direction, proposalStaffId: base.proposalStaffId, assignments: base.assignments,
      name: 'Космические коты', plot: 'Коты покоряют космос в пазлах.',
      messages: [
        { author: g.staff[0]!.name, text: 'Давайте сделаем про котов в космосе!' },
        { author: g.staff[1]!.name, text: 'Я запрограммирую, а графика — на тебе.' },
      ],
    };
    h.host.llm = async () => ({ text: JSON.stringify(decision), model: 'test' });
    const pilot = new AutopilotController(h.host);
    h.host.autopilotOn = true;
    await (pilot as unknown as { runDecision(): Promise<void> }).runDecision();
    expect(h.discussions.length).toBe(1);
    expect(h.discussions[0]!.map((m) => m.author)).toEqual([g.staff[0]!.name, g.staff[1]!.name]);
    expect(h.host.pendingPlan?.name).toBe('Космические коты');
    const joined = h.systems.join('\n');
    expect(joined).toContain('Решено');
    expect(joined).toContain('Космические коты');
    expect(joined).not.toContain('Почему');
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

describe('Ф5: сиквелы (AP-05)', () => {
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

describe('AP-12: автопилот не разгоняет темп (темп задаёт игрок)', () => {
  it('на 1× остаётся 1×; с паузы поднимает только до 1×; 8× не сбавляет', () => {
    const h1 = makeHost(fresh());
    h1.host.speed = 1;
    new AutopilotController(h1.host).startAutopilot();
    expect(h1.host.speed).toBe(1);
    expect(h1.speedLog).toEqual([]); // скорость не трогали вовсе
    const h2 = makeHost(fresh());
    h2.host.speed = 0; // босс на паузе
    new AutopilotController(h2.host).startAutopilot();
    expect(h2.host.speed).toBe(1); // паузу снимаем, разгон не включаем
    expect(h2.speedLog).toEqual([1]);
    const h3 = makeHost(fresh());
    h3.host.speed = 8;
    new AutopilotController(h3.host).startAutopilot();
    expect(h3.host.speed).toBe(8); // ставку не опускаем
    expect(h3.speedLog).toEqual([]);
  });

  it('событие — на 1×, после закрытия возвращается темп игрока (не 4×)', () => {
    const h = hostWithGame();
    h.host.speed = 2; // игрок поставил 2×
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    expect(h.host.speed).toBe(2);
    h.host.game.pendingEvent = { type: 'info', title: 'Тест', text: 'Событие' };
    ap.maybeAutopilot();
    expect(h.host.speed).toBe(1); // драматургия: попап смотрим на человеческой скорости
    h.host.game.pendingEvent = null;
    ap.maybeAutopilot();
    expect(h.host.speed).toBe(2); // назад к темпу игрока
    expect(h.speedLog).toEqual([1, 2]);
  });

  it('«Взять управление» возвращает темп, который был у босса', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    expect(h.host.speed).toBe(1); // не разгоняли
    ap.stopAutopilot(true);
    expect(h.host.speed).toBe(1);
    // если босс сам крутил скорость при автопилоте — его выбор не трогаем
    const h2 = hostWithGame();
    const ap2 = new AutopilotController(h2.host);
    ap2.startAutopilot();
    h2.host.speed = 2;
    ap2.stopAutopilot(true);
    expect(h2.host.speed).toBe(2);
  });
});

describe('AP-03: итоги автосессии', () => {
  function rec(name: string, score: number): GameRecord {
    return {
      name, genreId: 'rpg', typeId: 'rpg', consoleId: 'pc-game',
      score, units: 100, revenue: 1000, releaseWeek: 10, year: 1,
      attrs: { fun: 10, creativity: 10, graphics: 10, sound: 10 }, bugs: 0, awards: [],
    };
  }

  it('после «Взять управление»: экран с играми, средним счётом, деньгами и лучшей игрой', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    const moneyBefore = h.host.game.money;
    ap.startAutopilot();
    h.host.game.history.push(rec('Гонки', 28), rec('Рогалик', 36)); // команда успела выпустить две игры
    h.host.game.money = moneyBefore + 1500;
    ap.stopAutopilot(false);
    const ev = h.host.game.pendingEvent;
    expect(ev?.type).toBe('info');
    if (ev?.type !== 'info') throw new Error('ожидался info-попап с итогами');
    expect(ev.title).toContain('Итоги автосессии');
    expect(ev.text).toContain('Игр выпущено: 2');
    expect(ev.text).toContain('Средний счёт: 32/40');
    expect(ev.text).toContain('Лучшая: «Рогалик» — 36/40 — зал славы!');
    expect(ev.text).toContain('Деньги: +1500K');
  });

  it('тихий стоп (босс сам взялся за дело) экран итогов не показывает', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    h.host.game.history.push(rec('Гонки', 28));
    ap.stopAutopilot(true);
    expect(h.host.game.pendingEvent).toBeNull();
  });

  it('пустая сессия (включили и сразу выключили) экран не показывает — попап-пауза зря не встаёт', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    ap.stopAutopilot(false); // ничего не выпущено, деньги не двигались
    expect(h.host.game.pendingEvent).toBeNull();
  });

  it('открытый попап не перебивается — итоги ждут в очереди (lastPopup)', () => {
    const h = hostWithGame();
    const ap = new AutopilotController(h.host);
    ap.startAutopilot();
    h.host.game.history.push(rec('Гонки', 28));
    const open = { type: 'info', title: 'Важное', text: 'сначала это' } as const;
    h.host.game.pendingEvent = open;
    ap.stopAutopilot(false);
    expect(h.host.game.pendingEvent).toEqual(open);
    expect(h.host.game.lastPopup?.title).toContain('Итоги автосессии');
  });
});

describe('AP-08: idle-болтовня в затишье', () => {
  it('раз в ~90с затишья — реплика; чаще — нет', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
      const h = hostWithGame();
      h.host.game.pendingEvent = null; // театр не мешает: смотрим чистое затишье
      const ap = new AutopilotController(h.host);
      ap.startAutopilot();
      ap.maybeAutopilot();
      expect(h.phases).toEqual([]); // сразу после старта — тихо
      vi.setSystemTime(new Date('2026-09-10T12:01:31Z')); // +91с
      ap.maybeAutopilot();
      expect(h.phases).toEqual(['idle']);
      vi.setSystemTime(new Date('2026-09-10T12:02:01Z')); // ещё +30с — кулдаун держит
      ap.maybeAutopilot();
      expect(h.phases).toEqual(['idle']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('не перебивает живой чат, недоставленную очередь и открытое событие', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
      const h = hostWithGame();
      h.host.game.pendingEvent = null;
      const ap = new AutopilotController(h.host);
      ap.startAutopilot();
      vi.setSystemTime(new Date('2026-09-10T12:01:31Z'));
      h.host.chatThread = { phase: 'kickoff', extra: {}, left: 3, busy: false, nextAt: 0, errors: 0 }; // команда ещё говорит
      ap.maybeAutopilot();
      expect(h.phases).toEqual([]);
      h.host.chatThread = null;
      h.host.chat.queue.push({ week: 99, author: 'Кто-то', avatar: '', text: 'ещё не доставлено', trigger: 'week' });
      ap.maybeAutopilot();
      expect(h.phases).toEqual([]); // недоставленное сообщение — тоже не затишье
      h.host.chat.queue.length = 0;
      h.host.game.pendingEvent = { type: 'info', title: 'Событие', text: 'некогда болтать' };
      ap.maybeAutopilot();
      expect(h.phases).toEqual([]); // событие на экране
      h.host.game.pendingEvent = null;
      ap.maybeAutopilot();
      expect(h.phases).toEqual(['idle']); // всё стихло — можно перекинуться репликой
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AP-08: idle-серия — одна короткая реплика, тред сразу закрывается', () => {
  it('generatePhase("idle") кладёт ровно одно сообщение и не тянет серию', async () => {
    const g = fresh();
    const chat = resetChat();
    const host = {
      game: g,
      chat,
      llm: async () => ({ text: JSON.stringify({ message: { author: g.staff[0]!.name, text: 'Сижу, рефакторю потихоньку.' } }), model: 'fake' }),
      chatThread: null as ChatThread | null,
      pendingPlayers: [] as string[],
      pendingPhases: [] as { phase: string }[],
      emit() {},
    };
    const orc = new ChatOrchestrator(host);
    void orc.generatePhase('idle');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(chat.queue.length).toBe(1);
    orc.pumpThread(); // если бы серия была многоместной — здесь появилась бы вторая реплика
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(chat.queue.length).toBe(1);
    expect(chat.queue[0]!.text).toContain('рефакторю');
  });
});

describe('AP-04: письма фанатов влияют на решения', () => {
  function rec(name: string, genreId: string, score: number): GameRecord {
    return {
      name, genreId, typeId: 'rpg', consoleId: 'pc-game',
      score, units: 10, revenue: 100, releaseWeek: 5, year: 1,
      attrs: { fun: 1, creativity: 1, graphics: 1, sound: 1 }, bugs: 0, awards: [],
    };
  }

  function letter(gameName: string, sentiment: 'love' | 'hate' | 'neutral', week: number): GameState['mail'][number] {
    return {
      id: 1, week, year: 1, gameName,
      score: sentiment === 'love' ? 30 : sentiment === 'hate' ? 10 : 22,
      fanName: 'Алексей', gender: 'M', sentiment, fansDelta: 0, text: 'письмо', llm: true,
    };
  }

  it('свежий разгром: жанр уходит из следующего выбора автопилота', () => {
    const g = fresh();
    const before = autopilotProjectInput(g)!;
    g.history.push(rec('Провал', before.genreId, 10));
    g.mail.push(letter('Провал', 'hate', g.week));
    const after = autopilotProjectInput(g)!;
    expect(after.genreId).not.toBe(before.genreId); // фанаты разнесли игру — жанр сменили
  });

  it('остывший разгром (год назад) жанр больше не блокирует', () => {
    const g = fresh();
    const before = autopilotProjectInput(g)!;
    g.history.push(rec('Старый провал', before.genreId, 10));
    g.mail.push(letter('Старый провал', 'hate', g.week - 50)); // старше HATE_MEMORY_WEEKS (48)
    const after = autopilotProjectInput(g)!;
    expect(after.genreId).toBe(before.genreId); // память о разгроме не вечная
  });

  it('восторг и нейтральные письма жанр не отменяют', () => {
    const g = fresh();
    const before = autopilotProjectInput(g)!;
    g.mail.push(letter('Хорошая игра', 'love', g.week));
    expect(autopilotProjectInput(g)!.genreId).toBe(before.genreId);
  });

  it('buildDecisionContext: свежие письма попадают в контекст решения', () => {
    const g = fresh();
    expect(buildDecisionContext(g).fans).toBeUndefined(); // без писем строки нет
    g.mail.push(letter('Гонки', 'hate', g.week));
    const ctx = buildDecisionContext(g);
    expect(ctx.fans).toContain('разгром');
    expect(ctx.fans).toContain('Гонки');
  });
});


describe('видимость автопилота: журнал политики → шаги мыши', () => {
  const busy = (g: GameState): void => { g.pendingEvent = { type: 'info', title: 'Тест', text: 'Событие' }; };

  it('тренировка: журнал фиксирует её, шаги ведут в «Найм» → «Обучение» → карточка → тренинг', () => {
    const g = fresh();
    g.officeLevel = 3;
    g.week = 28; // неделя обучения
    g.money = 500;
    g.research = 0;
    g.staff[0]!.power = 5;
    busy(g);
    const pol = createAutopilotPolicy();
    const journal: PolicyAction[] = [];
    pol.turn(g, journal);
    const train = journal.find((a) => a.type === 'train');
    expect(train).toBeTruthy(); // тренировка реально применена
    expect(g.pendingEvent).toBeNull(); // событие резолвнуто заодно
    const steps = policySteps(journal, g);
    expect(steps[0]).toEqual({ kind: 'open', app: 'hire' });
    expect(steps.some((s) => s.kind === 'click' && s.target === 'hire-tab-training')).toBe(true);
    const card = steps.find((s) => s.kind === 'card');
    expect(card && card.kind === 'card' ? card.staffId : null).toBe(train && train.type === 'train' ? train.staffId : null);
    const press = steps.find((s) => s.kind === 'click' && s.target.startsWith('train-'));
    expect(press && press.kind === 'click' ? press.cosmetic : null).toBe(true);
  });

  it('левел-ап: в журнале только реально случившееся (нет ложного «office», нет найма без денег)', () => {
    const g = fresh();
    g.money = 0;
    g.research = 90;
    for (const s of g.staff) s.careers[s.activeCareer] = 1; // всем lv1: доступная цена апгрейда (15–55 PR)
    busy(g);
    const pol = createAutopilotPolicy();
    const journal: PolicyAction[] = [];
    pol.turn(g, journal);
    const lvl = journal.find((a) => a.type === 'levelup'); // апгрейд у лучшего по скиллам — не обязательно staff[0]
    expect(lvl).toBeTruthy();
    expect(journal.some((a) => a.type === 'office')).toBe(false);
    expect(journal.some((a) => a.type === 'hire')).toBe(false);
    const steps = policySteps(journal, g);
    const staffId = lvl && lvl.type === 'levelup' ? lvl.staffId : '';
    const press = steps.find((s) => s.kind === 'click' && s.target === `lvl-${staffId}`);
    expect(press && press.kind === 'click' ? press.cosmetic : null).toBe(true);
  });

  it('бустер: покупка у продавца + применение в окне «Код» (select + нажатие)', () => {
    const g = fresh();
    const sid = g.staff[0]!.id;
    const steps = policySteps([{ type: 'booster', boosterType: 'fun', staffId: sid }], g);
    expect(steps.map((s) => (s.kind === 'click' ? s.target : s.kind === 'select' ? `select:${s.target}` : s.kind))).toEqual([
      'open', 'hire-tab-salesman', 'booster-fun', 'open', 'select:booster-staff', 'booster-use-fun',
    ]);
    const sel = steps.find((s) => s.kind === 'select');
    expect(sel && sel.kind === 'select' ? sel.value : null).toBe(sid);
  });

  it('финальные нажатия действий политики — «витринные» (действие уже применено)', () => {
    const g = fresh();
    const steps = policySteps([
      { type: 'ad', adId: 1 }, { type: 'license', consoleId: 'microx-sx' }, { type: 'office' },
    ], g);
    expect(steps.some((s) => s.kind === 'open' && s.app === 'marketing')).toBe(true);
    expect(steps.some((s) => s.kind === 'open' && s.app === 'hardware')).toBe(true);
    const finals = steps.filter((s) => s.kind === 'click' && !s.target.startsWith('hire-tab-'));
    expect(finals.length).toBe(3);
    expect(finals.every((s) => s.kind === 'click' && s.cosmetic === true)).toBe(true);
  });

  it('по таймауту события шаги политики уходят в emitStep (мышь сыграет их вживую)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-10T12:00:00Z'));
      const g = fresh();
      g.officeLevel = 3;
      g.week = 28;
      g.money = 500;
      g.staff[0]!.power = 5;
      const base = makeHost(g);
      const steps: AutopilotStep[] = [];
      const host = { ...base.host, emitStep: (s: AutopilotStep) => { steps.push(s); } } as AutopilotHost;
      const ap = new AutopilotController(host);
      ap.startAutopilot();
      host.autopilotOn = true;
      g.pendingEvent = { type: 'info', title: 'Тест', text: 'Событие' };
      ap.maybeAutopilot(); // начало «театра»: клик по попапу
      vi.setSystemTime(new Date('2026-09-10T12:00:03Z')); // +3с — таймаут политики
      ap.maybeAutopilot();
      expect(g.pendingEvent).toBeNull();
      expect(steps.some((s) => s.kind === 'open' && s.app === 'hire')).toBe(true);
      expect(steps.some((s) => s.kind === 'click' && s.target === 'hire-tab-training')).toBe(true);
      expect(steps.some((s) => s.kind === 'click' && s.target.startsWith('train-'))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// AP-09: найм и увольнения автопилота (решения пользователя 11.09): лучшие по статам
// с приоритетом слабой специализации, метод — дороже по деньгам, увольнение — на замену.
describe('AP-09: найм и увольнения', () => {
  const busy = (g: GameState): void => { g.pendingEvent = { type: 'info', title: 'Тест', text: 'Событие' }; };

  it('нанимает лучшего кандидата по статам (а не случайного) — приоритет слабой специализации', () => {
    const g = fresh();
    g.officeLevel = 1; // методы по деньгам: online 550K — самый дорогой доступный
    g.money = 5000;
    const weak = weakKey(g); // слабая специализация ДО найма — та же, что видит политика
    const pool = candidatePool(g, 'online');
    expect(pool.length).toBeGreaterThan(1);
    busy(g);
    const pol = createAutopilotPolicy();
    const journal: PolicyAction[] = [];
    pol.turn(g, journal);
    const hire = journal.find((a) => a.type === 'hire');
    expect(hire).toBeTruthy();
    const hiredId = hire && hire.type === 'hire' ? hire.staffId : undefined;
    expect(pool).toContain(hiredId); // нанят из пула выбранного метода
    const scoreOf = (st: { program: number; scenario: number; graphics: number; sound: number }): number =>
      st.program + st.scenario + st.graphics + st.sound + 1.5 * st[weak];
    const hired = STAFF.find((d) => d.id === hiredId)!;
    for (const id of pool.filter((x) => x !== hiredId)) {
      const other = STAFF.find((d) => d.id === id)!;
      expect(scoreOf(hired.stats) >= scoreOf(other.stats)).toBe(true);
    }
  });

  it('офис полон: слабейшего меняет на сильного кандидата (увольнение только на замену)', () => {
    const g = fresh();
    g.officeLevel = 1; // вместимость 4
    g.money = 5000;
    const weakIds: string[] = [];
    for (const d of STAFF) {
      if (g.staff.length >= 4) break;
      if (g.hiredIds.includes(d.id)) continue;
      const w = makeStaffFromData(d.id);
      if (!w) continue;
      w.stats = { program: 1, scenario: 1, graphics: 1, sound: 1 }; // заведомо слабое звено
      g.staff.push(w);
      g.hiredIds.push(w.id);
      weakIds.push(w.id);
    }
    expect(g.staff.length).toBe(4);
    busy(g);
    const pol = createAutopilotPolicy();
    const journal: PolicyAction[] = [];
    pol.turn(g, journal);
    const fire = journal.find((a) => a.type === 'fire');
    expect(fire).toBeTruthy();
    const fireId = fire && fire.type === 'fire' ? fire.staffId : '';
    expect(weakIds).toContain(fireId);
    expect(g.staff.some((s) => s.id === fireId)).toBe(false); // уволен
    expect(journal.some((a) => a.type === 'hire')).toBe(true); // и замена пришла
    expect(g.staff.length).toBe(4); // состав не просел
    expect(pol.stats.fires).toBe(1);
  });

  it('если есть свободные места — увольнений нет, только найм', () => {
    const g = fresh();
    g.officeLevel = 1;
    g.money = 5000;
    busy(g);
    const pol = createAutopilotPolicy();
    const journal: PolicyAction[] = [];
    pol.turn(g, journal);
    expect(journal.some((a) => a.type === 'hire')).toBe(true);
    expect(journal.some((a) => a.type === 'fire')).toBe(false);
  });

  it('увольнение видно: мышь идёт «Найм» → «Команда» → «Уволить» (витринное нажатие)', () => {
    const g = fresh();
    const sid = g.staff[0]!.id;
    const steps = policySteps([{ type: 'fire', staffId: sid, name: 'Тестовый Сотрудник' }], g);
    expect(steps[0]).toEqual({ kind: 'open', app: 'hire' });
    expect(steps.some((s) => s.kind === 'click' && s.target === 'hire-tab-team')).toBe(true);
    const press = steps.find((s) => s.kind === 'click' && s.target === `fire-${sid}`);
    expect(press && press.kind === 'click' ? press.cosmetic : null).toBe(true);
    expect(press && press.kind === 'click' ? press.label : '').toContain('Тестовый Сотрудник');
  });

  it('не нанимает, если касса меньше годового фонда зарплат (иначе студия обнулится)', () => {
    const g = fresh();
    g.officeLevel = 1;
    for (const s of g.staff) s.salary = 2000; // фонд зарплат 4M
    g.money = 3000; // меньше фонда — найм запрещён (ни с методом, ни с кандидатом)
    busy(g);
    const pol = createAutopilotPolicy();
    const j1: PolicyAction[] = [];
    pol.turn(g, j1);
    expect(j1.some((a) => a.type === 'hire')).toBe(false);
    g.money = 9000; // касса с запасом — нанять можно
    busy(g); // первый ход резолвнул событие, а политика ходит только «по событию»
    const j2: PolicyAction[] = [];
    pol.turn(g, j2);
    expect(j2.some((a) => a.type === 'hire')).toBe(true);
  });
});
