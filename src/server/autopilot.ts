// Автопилот (plan/14): серверная логика — валидация решения LLM, контекст решения,
// политика авто-резолва событий. Оркестрация (таймеры, «театр») — в game.ts.
import { CONFIG } from '../core/config';
import { GENRES, TYPES, CONSOLES } from '../core/data/db';
import { comboGrade, consoleAvailable } from '../core/systems/dev';
import { autopilotProjectInput, comboCostK } from '../core/sim/policy';
import { createPlayer, type PolicyStats } from '../core/sim/policy';
import type { GameState } from '../core/types';
import type { AutopilotPlan } from '../shared/autopilot';

/** Проверка решения LLM по правилам игры; null = ок, иначе текст ошибки. */
export function validateDecision(plan: AutopilotPlan, state: GameState): string | null {
  const genre = GENRES.find((g) => g.id === plan.genreId);
  const type = TYPES.find((t) => t.id === plan.typeId);
  const consoleData = CONSOLES.find((c) => c.id === plan.consoleId);
  if (!genre) return `неизвестный жанр ${plan.genreId}`;
  if (!type) return `неизвестный тип ${plan.typeId}`;
  if (!consoleData) return `неизвестная консоль ${plan.consoleId}`;
  // анлоки жанра/типа — как в policy.pickBestCombo
  if (genre.unlockJob && genre.unlockLevel) {
    if (!state.staff.some((s) => (s.careers[genre.unlockJob as keyof typeof s.careers] ?? 0) >= genre.unlockLevel!)) {
      return `жанр ${plan.genreId} не открыт`;
    }
  }
  if (type.unlockJob && type.unlockLevel) {
    if (!state.staff.some((s) => (s.careers[type.unlockJob as keyof typeof s.careers] ?? 0) >= type.unlockLevel!)) {
      return `тип ${plan.typeId} не открыт`;
    }
  }
  if (type.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(type.unlockTraining!.toLowerCase()))) {
    return `тип ${plan.typeId} требует тренинг ${type.unlockTraining}`;
  }
  if (!state.consoles[plan.consoleId]?.licensed) return `консоль ${plan.consoleId} не куплена`;
  if (!consoleAvailable(state, plan.consoleId)) return `консоль ${plan.consoleId} недоступна`;
  if (!(plan.mode in CONFIG.MODE)) return `неизвестный режим ${plan.mode}`;
  if (!state.staff.some((s) => s.id === plan.proposalStaffId)) return `нет сотрудника ${plan.proposalStaffId}`;
  const known = new Set(state.staff.map((s) => s.id));
  for (const ids of Object.values(plan.assignments ?? {})) {
    for (const id of ids) if (!known.has(id)) return `неизвестный сотрудник в ролях: ${id}`;
  }
  const cost = comboCostK(state, plan.genreId, plan.typeId, plan.consoleId, plan.mode);
  if (cost > state.money) return `денег не хватает (нужно ${Math.round(cost)}K)`;
  return null;
}

/** Контекст для LLM-решения: команда, деньги, открытые жанры/типы, топ комбо, консоли. */
export function buildDecisionContext(state: GameState): {
  team: string;
  money: number;
  research: number;
  office: number;
  genres: string;
  types: string;
  combos: string;
  consoles: string;
} {
  const unlockedGenres = GENRES.filter((g) => {
    if (g.unlockJob && g.unlockLevel) {
      return state.staff.some((s) => (s.careers[g.unlockJob as keyof typeof s.careers] ?? 0) >= g.unlockLevel!);
    }
    return true;
  });
  const unlockedTypes = TYPES.filter((t) => {
    if (t.unlockJob && t.unlockLevel) {
      if (!state.staff.some((s) => (s.careers[t.unlockJob as keyof typeof s.careers] ?? 0) >= t.unlockLevel!)) return false;
    }
    if (t.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(t.unlockTraining!.toLowerCase()))) return false;
    return true;
  });
  const licensed = CONSOLES.filter((c) => state.consoles[c.id]?.licensed && consoleAvailable(state, c.id));
  // топ комбо по градации (S/A/B), до 10 штук
  const gradeRank: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
  const combos: { line: string; rank: number; cost: number }[] = [];
  for (const g of unlockedGenres.slice(0, 20)) {
    for (const t of unlockedTypes.slice(0, 79)) {
      const grade = comboGrade(g.id, t.id);
      if (grade === 'C') continue;
      const cost = comboCostK(state, g.id, t.id, licensed[0]?.id ?? 'pc-game', 'normal');
      combos.push({ line: `${g.ru ?? g.name} × ${t.nameRu ?? t.name} = ${grade} (~${Math.round(cost)}K)`, rank: gradeRank[grade] ?? 3, cost });
    }
  }
  combos.sort((a, b) => a.rank - b.rank || a.cost - b.cost);
  return {
    team: state.staff.map((s) => `${s.name} (${s.activeCareer} Lv${s.careers[s.activeCareer] ?? 0}, id:${s.id})`).join('; '),
    money: Math.round(state.money),
    research: Math.round(state.research),
    office: state.officeLevel,
    genres: unlockedGenres.map((g) => `${g.id}="${g.ru ?? g.name}"`).join(', '),
    types: unlockedTypes.map((t) => `${t.id}="${t.nameRu ?? t.name}"`).join(', '),
    combos: combos.slice(0, 12).map((c) => c.line).join('; '),
    consoles: licensed.map((c) => `${c.id}="${c.name}"`).join(', '),
  };
}

/** Политика автопилота: резолвит события и выпускает готовые игры, НО не стартует
 * проекты сам (решение — за чатом). Внутри — обычный «разумный игрок» из sim/policy. */
export function createAutopilotPolicy(): { turn(state: GameState): void; stats: PolicyStats } {
  const player = createPlayer();
  const stats: PolicyStats = { hires: 0, releases: 0, boostAccepts: 0, licenses: 0 };
  return {
    stats,
    turn(state: GameState): void {
      // вызываем только когда есть что резолвить (событие) или готово к релизу —
      // иначе политика сама стартовала бы свои проекты вместо решений чата
      const busy = !!state.pendingEvent || (state.activeGame?.phase === 'debug' && state.activeGame.bugs <= 5);
      if (!busy) return;
      player.turn(state, stats);
    },
  };
}

export { autopilotProjectInput };
