// Система разработки: старт проекта, недельный прогресс, баги, отладка, релиз, сиквелы.
import { CONFIG } from '../config';
import { CRITICS, PRESS_FALLBACK_RU } from '../data/critics'; // PLAN-30: пресса — 10 журналов
import { COMBO_GRADES, CONSOLES, GENRES, GENRE_ORDER, MESSAGES, TYPES } from '../data/db';
import { log } from '../log';
import {
  debugRate, distributePoints, judgeScore, projectCost, reviewTotal, spreadScores,
  salesPlan, totalBugs, weeklyPoints,
} from '../formulas';
import type { Rng } from '../rng';
import type {
  ActiveGame, ActionResult, ComboGrade, GameState, Role, Staff, StartProjectInput, Stats,
} from '../types';
import { DIRECTION_WEIGHTS, EMPTY_STATS } from '../types';
import { comboGradeFrom, consoleReleased as consoleAvailable, isUnlocked, score100 } from '../../shared/rules';
import { busyStaffIds } from './staff';

export function genreById(id: string) {
  return GENRES.find((g) => g.id === id)!;
}

export function typeById(id: string) {
  return TYPES.find((t) => t.id === id)!;
}

export function consoleById(id: string) {
  return CONSOLES.find((c) => c.id === id)!;
}

export function comboGrade(genreId: string, typeId: string): ComboGrade {
  return comboGradeFrom(COMBO_GRADES, GENRE_ORDER, genreId, typeId) as ComboGrade;
}

import { comboKey } from '../../shared/rank';

// открыт ли жанр/тип — общее правило (shared/rules.ts, CORE-04)
export { isUnlocked };

// consoleAvailable на сервере = «в продаже по датам»; лицензия проверяется отдельно (startProject)
export { consoleAvailable };

function isSequel(state: GameState, genreId: string, typeId: string): boolean {
  return state.history.some(
    (h) => h.genreId === genreId && h.typeId === typeId && h.score >= CONFIG.HALL_OF_FAME,
  );
}

export function startProject(state: GameState, input: StartProjectInput): ActionResult {
  const genre = genreById(input.genreId);
  const type = typeById(input.typeId);
  const consoleData = consoleById(input.consoleId);
  const cs = state.consoles[input.consoleId];
  if (!genre || !type || !consoleData || !cs) return { ok: false, error: 'Неизвестный выбор' };
  if (state.activeGame) return { ok: false, error: 'Идёт другой проект' };
  if (state.bankrupt) return { ok: false, error: 'Компания банкрот' };
  if (!consoleAvailable(state, input.consoleId)) return { ok: false, error: 'Консоль недоступна' };
  if (!cs.licensed) return { ok: false, error: 'Нужна лицензия на консоль' };
  const pair = comboKey(input.genreId, input.typeId); // PLAN-22: открытые пары доступны всегда
  if (!isUnlocked(state, genre.unlockJob, genre.unlockLevel, null, pair)) return { ok: false, error: `Жанр «${genre.name}» не открыт` };
  if (!isUnlocked(state, type.unlockJob, type.unlockLevel, type.unlockTraining, pair)) {
    return { ok: false, error: `Тип «${type.name}» не открыт${type.unlockTraining ? ' (нужен тренинг)' : ''}` };
  }
  if (!state.staff.some((s) => s.id === input.proposalStaffId)) return { ok: false, error: 'Нет сценариста' };

  // SRV-23: значения направления проверяются на входе — NaN/отрицательные/чужие оси не должны
  // попадать в очки проекта (NaN проходил guard суммы и ломал экономику необратимо)
  const direction: Record<string, number> = { ...EMPTY_DIRECTION };
  for (const [axis, v] of Object.entries(input.direction ?? {})) {
    if (axis in direction && typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      direction[axis] = Math.round(v);
    }
  }
  const spent = Object.values(direction).reduce((a, b) => a + b, 0);
  // очки направления — перераспределяемый пул (не списываются; растут с уровнями жанров)
  if (spent > state.directionPoints) return { ok: false, error: 'Не хватает очков направления' };

  const cost = projectCost(
    genre.costWan, state.genreLevels[genre.id] ?? 0,
    state.typeLevels[type.id] ?? 0,
    consoleData.costMult, input.mode,
  );
  if (state.money < cost) return { ok: false, error: `Не хватает денег (нужно ${Math.round(cost)}K)` };
  state.money -= cost;

  const game: ActiveGame = {
    consoleId: input.consoleId,
    genreId: genre.id,
    typeId: type.id,
    mode: input.mode,
    comboGrade: comboGrade(genre.id, type.id),
    direction,
    points: { ...EMPTY_STATS },
    totalCost: cost,
    progress: 0,
    bugs: 0,
    bugsTotal: 0, // PLAN-30: счётчик всех багов за разработку
    weekStarted: state.week,
    phase: 'proposal',
    proposalStaffId: input.proposalStaffId,
    assignments: { proposal: [input.proposalStaffId], ...input.assignments },
    contribTotal: {},
    boostOffered: false,
    boostUsed: false,
    // известность компании (Gamedex и т.п.) уходит на первый же следующий проект
    fame: CONFIG.PROJECT_FAME_BASE + state.gamedexFame,
    hype: 10,
    name: input.name?.trim() ?? '',
    plot: input.plot?.trim() ?? '',
    score: null,
    judgeScores: [],
    reviewMessages: [],
    releaseWeek: null,
    sales: [],
    totalUnits: 0,
    totalRevenue: 0,
    ended: false,
  };
  state.activeGame = game;
  state.gamedexFame = 0; // известность списана на этот проект
  log(state, `Старт разработки: ${genre.name} × ${type.name} (${consoleData.name}, ${input.mode}, ${Math.round(cost)}K, комбо ${game.comboGrade})`);
  return { ok: true };
}

const EMPTY_DIRECTION: Record<string, number> = {
  cute: 0, realism: 0, approach: 0, niche: 0,
  simple: 0, innovation: 0, world: 0, polish: 0,
};

// предложение: стартовые Fun/Creativity от сценариста
function doProposal(state: GameState, game: ActiveGame): void {
  const st = state.staff.find((s) => s.id === game.proposalStaffId);
  if (!st) return;
  game.points.fun += st.stats.scenario * CONFIG.PROPOSAL_SCENARIO_FUN;
  game.points.creativity += st.stats.scenario * CONFIG.PROPOSAL_SCENARIO_CREATIVITY;
}

const ROLE_STAT = {
  proposal: 'scenario', program: 'program', graphics: 'graphics', sound: 'sound', debug: 'program',
} as const;

function roleContributors(state: GameState, game: ActiveGame, role: Role, busy: Set<string>): { stat: number; power: number }[] {
  const ids = game.assignments[role] ?? [];
  return ids
    .map((id) => state.staff.find((s) => s.id === id))
    .filter((s): s is Staff => !!s && s.homeWeeks === 0 && (s.restDays ?? 0) === 0 && !busy.has(s.id)) // PLAN-41: в отпуске — вклада нет
    .map((s) => ({ stat: s.stats[ROLE_STAT[role]], power: s.power }));
}

// один тик разработки
export function devTick(state: GameState, rng: Rng): void {
  const game = state.activeGame;
  state.devContrib = [];
  if (!game || game.phase === 'released' || game.phase === 'debug') return;

  if (game.phase === 'proposal') {
    doProposal(state, game);
    game.phase = 'dev';
    log(state, `Предложение готово: Fun ${Math.round(game.points.fun)}, Creativity ${Math.round(game.points.creativity)}`);
    return;
  }

  // dev: работают ВСЕ сотрудники (не в отпуске). Роли дают профильный стат,
  // сотрудники без роли в проекте — средний по навыкам (универсалы).
  const genreLevel = state.genreLevels[game.genreId] ?? 0;
  const busy = busyStaffIds(state); // M9: занятые на контрактах над проектом не работают
  const byRole = (role: Role) => roleContributors(state, game, role, busy);
  const contributors = [
    ...byRole('proposal'), ...byRole('program'), ...byRole('graphics'), ...byRole('sound'),
    // универсалы (без роли в проекте)
    ...state.staff
      .filter((s) => s.homeWeeks === 0 && (s.restDays ?? 0) === 0 && !busy.has(s.id) && !Object.values(game.assignments).some((ids) => ids.includes(s.id)))
      .map((s) => {
        const st = s.stats;
        return { stat: (st.program + st.scenario + st.graphics + st.sound) / 4, power: s.power };
      }),
  ];
  const weekly = weeklyPoints(contributors, game.mode, genreLevel);
  const daily = weekly / 7; // тик = день
  const gain = distributePoints(daily, game.direction, DIRECTION_WEIGHTS);
  for (const k of ['fun', 'creativity', 'graphics', 'sound'] as const) {
    game.points[k] += gain[k];
  }

  // вклад по сотрудникам (для анимации в UI): доля каждого в приросте атрибута
  const totalStat = contributors.reduce((a, c) => a + c.stat, 0) || 1;
  for (const s of state.staff) {
    if (s.homeWeeks > 0) continue; // ушёл домой — вклада нет
    if ((s.restDays ?? 0) > 0) continue; // PLAN-41: в отпуске — вклада нет
    if (busy.has(s.id)) continue; // M9: на контракте — вклада в проект нет
    let stat = 0;
    for (const r of ['proposal', 'program', 'graphics', 'sound'] as const) {
      if ((game.assignments[r] ?? []).includes(s.id)) { stat += s.stats[ROLE_STAT[r]]; }
    }
    if (stat === 0) {
      const st = s.stats;
      stat = (st.program + st.scenario + st.graphics + st.sound) / 4; // универсал
    }
    if (stat <= 0) continue;
    const share = stat / totalStat; // доля сотрудника в общем котле
    for (const k of ['fun', 'creativity', 'graphics', 'sound'] as const) {
      const amount = gain[k] * share; // доля атрибута в приросте очков
      if (amount > 0) state.devContrib.push({ staffId: s.id, attr: k, amount });
    }
  }

  // накопленный вклад за проект (для отчёта после релиза)
  game.contribTotal ??= {};
  for (const c of state.devContrib) {
    game.contribTotal[c.staffId] = (game.contribTotal[c.staffId] ?? 0) + c.amount;
  }

  // баги пропорционально прогрессу
  const total = totalBugs(game.totalCost, game.mode, game.comboGrade);
  game.bugs += (total * daily) / game.totalCost;
    game.bugsTotal = (game.bugsTotal ?? 0) + (total * daily) / game.totalCost; // PLAN-30: всего за разработку

  // исследования
  const researchMult = game.mode === 'research' ? CONFIG.RESEARCH_MODE_MULT : 1;
  state.research += daily * CONFIG.RESEARCH_DEV_RATE * researchMult;

  // прогресс
  const before = game.points.fun + game.points.creativity + game.points.graphics + game.points.sound;
  // прогресс = ВРЕМЯ (100 дней × режим), не зависит от команды;
  // очки (points) копятся от команды и определяют качество/рейтинг
  game.progress = Math.min(1, (state.week - game.weekStarted) / (CONFIG.DEV_DAYS * CONFIG.MODE[game.mode].time));

  // события
  if (game.progress >= 0.25 && !game.boostOffered) {
    game.boostOffered = true;
    if (rng.chance(CONFIG.BOOST_CHANCE)) {
      const staff = state.staff.filter((s) => s.homeWeeks === 0);
      if (staff.length > 0) {
        const s = staff[rng.int(0, staff.length - 1)]!;
        const cost = Math.max(CONFIG.BOOST_COST_MIN, Math.round(state.research / CONFIG.BOOST_COST_DIV));
        state.pendingEvent = { type: 'boost', staffId: s.id, cost };
        log(state, `${s.name} предлагает улучшить игру (${cost} PR)`);
      }
    }
  }
  // PLAN-39: мини-игра на половине разработки — один раз за проект, без пропуска.
  // Если день занят другим событием — ждём свободного (флаг не выставляем, чтобы не потерять).
  if (game.progress >= 0.5 && !game.mg50 && !state.pendingEvent) {
    game.mg50 = true;
    state.pendingEvent = { type: 'minigame', gameId: '' };
    log(state, '🎮 Половина разработки — команда зовёт в мини-игру');
  }
  if (rng.chance(CONFIG.BLACKOUT_CHANCE)) {
    for (const k of ['fun', 'creativity', 'graphics', 'sound'] as const) {
      game.points[k] *= 1 - CONFIG.BLACKOUT_LOSS;
    }
    log(state, 'Отключение электричества! Потеряно 30% очков разработки');
    if (!state.pendingEvent) state.pendingEvent = { type: 'disaster', text: '⚡ Отключение электричества! Потеряно 30% накопленных очков разработки.' };
  }
  if (rng.chance(CONFIG.BREAKDOWN_CHANCE)) {
    const loss = rng.int(CONFIG.BREAKDOWN_LOSS[0], CONFIG.BREAKDOWN_LOSS[1]);
    game.points.fun = Math.max(0, game.points.fun - loss);
    log(state, `Поломка оборудования: −${loss} очков`);
    if (!state.pendingEvent) state.pendingEvent = { type: 'disaster', text: `🔧 Поломка оборудования! Потеряно ${loss} очков разработки.` };
  }

  // фазы
  if (before < game.totalCost * 0.4 && game.points.fun + game.points.creativity + game.points.graphics + game.points.sound >= game.totalCost * 0.4) {
    log(state, 'Начата работа над графикой (α-версия)');
  }
  if (before < game.totalCost * 0.8 && game.points.fun + game.points.creativity + game.points.graphics + game.points.sound >= game.totalCost * 0.8) {
    log(state, 'Начата работа над музыкой (β-версия)');
  }

  if (game.progress >= 1) {
    game.phase = 'debug';
    game.bugs = Math.round(game.bugs);
    log(state, `Разработка завершена! Багов в игре: ${game.bugs}`);
  }
}

// отладка: назначенные в debug-роль + все остальные сотрудники (Program стат)
export function debugTick(state: GameState, rng: Rng): void {
  const game = state.activeGame;
  if (!game || game.phase !== 'debug') return;
  const assigned = new Set(game.assignments.debug ?? []);
  const busy = busyStaffIds(state); // M9: занятые на контрактах не отлаживают
  const debuggers = state.staff
    .filter((s) => s.homeWeeks === 0 && !busy.has(s.id))
    .map((s) => ({ program: s.stats.program, weight: assigned.has(s.id) ? 1 : 0.7 }));
  const rate = debugRate(debuggers);
  // AP-13: копим дробную часть скорости между днями. Без этого команда со слабым Program
  // (Σ Program × 0.03 < 0.5 при весах 1/0.7) каждый день округлялась до нуля и не закрывала
  // НИ ОДНОГО бага — живой случай на проде: 35 багов, двое в офисе, отладка стоит вечно.
  const pool = (game.debugCarry ?? 0) + rate;
  const removed = Math.min(game.bugs, Math.max(0, Math.round(pool)));
  game.debugCarry = pool - removed;
  game.bugs -= removed;
  if (removed > 0) {
    const pr = rng.int(CONFIG.DEBUG_PR_MIN, CONFIG.DEBUG_PR_MAX) * removed;
    state.research += pr;
    log(state, `Отладка: −${removed} багов (+${pr} PR)`);
  }
  // все баги починены — попап «игра готова» (пауза, как у торговца)
  if (game.bugs <= 0 && !state.releasePopupShown && !state.pendingEvent) {
    state.releasePopupShown = true;
    const genre = genreById(game.genreId);
    const type = typeById(game.typeId);
    const top = topContributor(state, game);
    state.pendingEvent = {
      type: 'ready_to_release',
      text:
        `«${genre?.name ?? '?'} × ${type?.name ?? '?'}» готова к выпуску!\n` +
        `Fun: ${Math.round(game.points.fun)} · Creativity: ${Math.round(game.points.creativity)} · ` +
        `Графика: ${Math.round(game.points.graphics)} · Звук: ${Math.round(game.points.sound)} · Комбо: ${game.comboGrade}\n` +
        `Наибольший вклад: ${top ? `${top.name} (${top.activeCareer})` : '—'}`,
    };
  }
}

// кто внёс наибольший вклад в разработку (сумма статов по назначенным ролям)
function topContributor(state: GameState, game: ActiveGame): Staff | null {
  const roleStat: Record<Role, 'program' | 'scenario' | 'graphics' | 'sound'> = {
    proposal: 'scenario', program: 'program', graphics: 'graphics', sound: 'sound', debug: 'program',
  };
  const scores = new Map<string, number>();
  for (const r of ['proposal', 'program', 'graphics', 'sound', 'debug'] as Role[]) {
    for (const id of game.assignments[r] ?? []) {
      const s = state.staff.find((x) => x.id === id);
      if (s) scores.set(s.id, (scores.get(s.id) ?? 0) + s.stats[roleStat[r]]);
    }
  }
  let best: Staff | null = null;
  let bestScore = 0;
  for (const [id, sc] of Array.from(scores.entries())) {
    const s = state.staff.find((x) => x.id === id);
    if (s && sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

// релиз: рецензии, уровни жанров/типов, план продаж
export function releaseGame(state: GameState, rng: Rng, _name?: string): ActionResult {
  const game = state.activeGame;
  if (!game || game.phase !== 'debug') return { ok: false, error: 'Игра не готова к релизу' };

  const noise = rng.int(-CONFIG.REVIEW_NOISE, CONFIG.REVIEW_NOISE);
  // PLAN-30: 10 критиков из 10 журналов — итог сразу /100
  const { scores: baseScores } = judgeScore(game.points, CRITICS.map((c) => c.weights), game.bugs, noise);
  // v1.18.0: критики ставят по-разному — «база ±2»; сумма слегка гуляет, 100/100 — редкая удача
  const scores = spreadScores(baseScores, rng);
  const total = reviewTotal(scores);
  const genre = genreById(game.genreId);
  const type = typeById(game.typeId);

  game.name = game.name || generateName(genre.name, type.name, rng);
  game.score = total;
  game.judgeScores = scores;
  game.reviewMessages = scores.map((s) => pickMessage(s, rng));
  game.phase = 'released';
  game.releaseWeek = state.week;
  state.pendingEvent = null;

  // уровни жанра/типа
  const gl = Math.min(5, (state.genreLevels[game.genreId] ?? 0) + 1);
  state.genreLevels[game.genreId] = gl;
  const tl = Math.min(5, (state.typeLevels[game.typeId] ?? 0) + 1);
  state.typeLevels[game.typeId] = tl;
  if (CONFIG.DIRECTION_POINTS_GENRE_LV.some((lv) => lv === gl)) {
    state.directionPoints += 2;
    log(state, `Жанр «${genre.name}» достиг Lv${gl}: +2 очка направления`);
  }

  // план продаж
  const cs = state.consoles[game.consoleId];
  if (!cs) return { ok: false, error: 'Консоль не найдена' };
  const consoleData = consoleById(game.consoleId);
  const plan = salesPlan({
    installBase: cs.base,
    // PLAN-30: продажи считаются от старой шкалы рецензий (12–40) — приводим /100 обратно
    score: total / 2.5,
    combo: game.comboGrade,
    pop: genre.popularity,
    fans: state.fans,
    // известность/хайп накоплены за разработку: бустеры (+2), успешный буст (+10),
    // реклама (+5 за кампанию) — реально влияют на продажи через hypeMult
    // (раньше тут были литералы fame:10/hype:10 — поля писались, но не читались)
    fame: game.fame,
    hype: game.hype,
    sequel: isSequel(state, game.genreId, game.typeId),
    consoleMult: consoleData.costMult,
    releaseWeek: state.week,
  });
  game.sales = plan.weeks;
  game.totalUnits = plan.totalUnits;
  game.totalRevenue = plan.totalRevenue;

  // база консоли растёт
  cs.base += CONFIG.CONSOLE_BASE_GROWTH;

  // запись в историю
  state.history.push({
    name: game.name,
    plot: game.plot,
    // M8: отрывок чата о решении разрабатывать эту игру — в карточку архива
    decisionChat: game.decisionChat ? game.decisionChat.map((m) => ({ ...m })) : undefined,
    genreId: game.genreId,
    typeId: game.typeId,
    consoleId: game.consoleId,
    // вклад сотрудников в проект (накапливается с начала игры)
    contrib: Object.fromEntries(
      Object.entries(game.contribTotal ?? {})
        .map(([sid, v]) => [state.staff.find((s) => s.id === sid)?.name ?? sid, Math.round(v)])
        .sort((a, b) => (b[1] as number) - (a[1] as number))
    ),
    score: total,
    // PLAN-30: пресса сохраняется в записи — модалка читает её даже после смены проекта
    judgeScores: [...scores],
    reviewMessages: [...game.reviewMessages],
    units: plan.totalUnits,
    revenue: plan.totalRevenue,
    releaseWeek: state.week,
    year: state.year,
    attrs: { ...game.points },
    bugs: Math.round(game.bugs),
    bugsTotal: Math.round(game.bugsTotal ?? 0),
    awards: [],
    // PLAN-29: факт продаж копится, пока игра в продаже (заполнится в dailySales при снятии)
    paidUnits: 0,
    paidRevenue: 0,
  });
  // 25.09: история хранится ЦЕЛИКОМ и не режется — все игры навсегда остаются в архиве (босс).

  log(state, `РЕЛИЗ «${game.name}»: ${genre.name} × ${type.name} на ${consoleData.name}`);
  log(state, `Рецензии: ${scores.join('/')} = ${score100(total)}/100 ${total >= CONFIG.HALL_OF_FAME ? '— ЗАЛ СЛАВЫ!' : ''}`);
  state.released.push(game);
  state.activeGame = null;
  state.releasePopupShown = false;
  // попап с оценками (пауза, как у торговца)
  game.contribTotal ??= {};
  const topContrib = Object.entries(game.contribTotal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, v]) => `${state.staff.find((s) => s.id === id)?.name ?? id} ${Math.round(v)}`)
    .join(' · ');
  state.pendingEvent = {
    type: 'release_result',
    text:
      `🎉 «${game.name}» выпущена!\n` +
      `Оценки критиков: ${scores.join(' · ')} = ${score100(total)}/100\n` +
      `${total >= CONFIG.HALL_OF_FAME ? '🏆 ЗАЛ СЛАВЫ!' : total >= CONFIG.GRAND_PRIZE_SCORE ? 'Претендент на Гран-при!' : 'Удачи в следующий раз!'}` +
      (topContrib ? `\n\nВклад в разработку:\n${topContrib}` : ''),
  };
  return { ok: true };
}

// буст-событие от сотрудника; amount — сколько PR вложил игрок (от этого зависит шанс)
export function resolveBoost(state: GameState, rng: Rng, accept: boolean, amount?: number): ActionResult {
  const ev = state.pendingEvent;
  const game = state.activeGame;
  if (!ev || ev.type !== 'boost') return { ok: false, error: 'Нет события' };
  // отказ = ничего не произошло (раньше boostUsed ставился до проверки — отклонённый
  // буст давал +хайп при релизе)
  if (!accept) {
    state.pendingEvent = null;
    log(state, 'Предложение отклонено');
    return { ok: true };
  }
  // аудит 05.09: валидация ДО мутаций — при нехватке PR событие остаётся висеть,
  // boostUsed не выставляется (раньше событие терялось и игра помечалась «бустилась»)
  const spend = Math.max(1, Math.round(amount ?? ev.cost));
  if (state.research < spend) return { ok: false, error: 'Не хватает PR' };
  state.pendingEvent = null;
  if (!game) return { ok: true };
  game.boostUsed = true;
  state.research -= spend;
  const st = state.staff.find((s) => s.id === ev.staffId);
  const sum = st ? st.stats.program + st.stats.scenario + st.stats.graphics + st.stats.sound : 0;
  // шанс растёт с вложением: база 0.5 при ставке = предложению, +0.025 за каждый доп. PR
  const chance = Math.min(
    CONFIG.BOOST_SUCCESS_CAP,
    Math.max(0.15, CONFIG.BOOST_SUCCESS_BASE + (spend - ev.cost) * CONFIG.BOOST_RATE_PER_PR + sum / CONFIG.BOOST_SUCCESS_STAT_DIV),
  );
  if (rng.chance(chance)) {
    const gain = rng.int(CONFIG.BOOST_GAIN[0], CONFIG.BOOST_GAIN[1]);
    const key = st ? bestAttr(st) : 'fun';
    game.points[key] += gain;
    game.hype += CONFIG.BOOST_HYPE_GAIN; // успех повышает ожидания — продажи при релизе
    log(state, `${st?.name ?? 'Сотрудник'} улучшил игру: +${gain} ${key}`);
    state.pendingEvent = {
      type: 'boost_result',
      outcome: 'success',
      text: `💪 Улучшение удалось! ${st?.name ?? 'Сотрудник'} добавил +${gain} очков к «${ATTR_RU[key]}».`,
    };
  } else {
    const bugs = rng.int(CONFIG.BOOST_FAIL_BUGS[0], CONFIG.BOOST_FAIL_BUGS[1]);
    game.bugs += bugs;
    game.bugsTotal = (game.bugsTotal ?? 0) + bugs;
    log(state, `Улучшение провалилось: +${bugs} багов!`);
    state.pendingEvent = {
      type: 'boost_result',
      outcome: 'fail',
      text: `💥 Улучшение провалилось! В игре появилось ${bugs} новых багов.`,
    };
  }
  return { ok: true };
}

const ATTR_RU: Record<string, string> = {
  fun: 'Fun', creativity: 'Creativity', graphics: 'Графику', sound: 'Звук',
};

function bestAttr(st: Staff): keyof Stats {
  const m = Math.max(st.stats.program, st.stats.scenario, st.stats.graphics, st.stats.sound);
  if (m === st.stats.program) return 'fun';
  if (m === st.stats.scenario) return 'creativity';
  if (m === st.stats.graphics) return 'graphics';
  return 'sound';
}

const NAME_SUFFIXES = ['Story', 'Tales', 'Quest', 'World', 'Heroes', 'Rush', 'Chronicles', 'Simulator', 'Adventure', 'Masters'];

function generateName(genreName: string, typeName: string, rng: Rng): string {
  const suffix = NAME_SUFFIXES[rng.int(0, NAME_SUFFIXES.length - 1)]!;
  return `${typeName} ${suffix}: ${genreName}`;
}

function pickMessage(score: number, rng: Rng): string {
  // PLAN-30: сначала русские тексты (в контенте — английские легаси-строки)
  const ru = PRESS_FALLBACK_RU[score];
  if (ru && ru.length > 0) return ru[rng.int(0, ru.length - 1)]!;
  const pool = MESSAGES.filter((m) => m.points === score);
  if (pool.length === 0) return '';
  return pool[rng.int(0, pool.length - 1)]!.message;
}
