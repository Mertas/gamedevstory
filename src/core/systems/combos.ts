// PLAN-54: скрытые комбо команды (v-team) — открываются на релизе готовой игры.
// Комбо — это НЕ боевые баффы: состав команды, доделавшей игру, проверяется после завершения
// разработки и даёт бонус к готовой игре; открытые комбо остаются в витрине навсегда.
import { CONFIG } from '../config';
import { STAT_KEYS } from '../../shared/train';
import type { ActiveGame, GameState, Staff } from '../types';
import { effectiveStats, type StatBlock } from './hierarchy';

export interface ComboBonus {
  score: number; // к итоговой оценке (0..100)
  money: number; // K, разово на релизе
  fans: number;
  brand: number; // к бренду франшизы после релиза (если она есть)
}

export interface ComboContext {
  state: GameState;
  game: ActiveGame;
  members: Staff[]; // команда, доделавшая игру
  eff: Map<string, StatBlock>;
}

export interface TeamComboDef {
  id: string;
  name: string;
  /** условие — показывается только после открытия */
  condition: string;
  /** эффект — показывается только после открытия */
  effect: string;
  check: (ctx: ComboContext) => boolean;
  bonus: (ctx: ComboContext) => Partial<ComboBonus>;
}

const ROLES = ['proposal', 'program', 'graphics', 'sound'] as const;
const VETERAN_DAYS = 10 * CONFIG.YEAR_LENGTH;

/** неделя найма сотрудника (первая запись истории «hire»); null — неизвестно (старый сейв) */
function hiredWeek(s: Staff): number | null {
  const h = (s.history ?? []).find((x) => x.kind === 'hire');
  return h ? h.week : null;
}

/** «команда, доделавшая игру»: все, кто внёс вклад; запасной путь — назначенные на роли. */
export function teamMembers(state: GameState, game: ActiveGame): Staff[] {
  const ids = new Set(Object.keys(game.contribTotal ?? {}));
  if (ids.size === 0) {
    for (const list of Object.values(game.assignments ?? {})) for (const id of list ?? []) ids.add(id);
  }
  return state.staff.filter((s) => ids.has(s.id));
}

function allOf(members: Staff[], career: string, min = 3): boolean {
  return members.length >= min && members.every((s) => s.activeCareer === career);
}

export const TEAM_COMBOS: TeamComboDef[] = [
  {
    id: 'full',
    name: 'Полный состав',
    condition: 'Все четыре роли в проекте заняты своими людьми',
    effect: '+3 к итоговой оценке',
    check: ({ game }) => ROLES.every((r) => (game.assignments[r] ?? []).length > 0),
    bonus: () => ({ score: 3 }),
  },
  {
    id: 'coders',
    name: 'Все программисты',
    condition: '3+ человека в команде, и все — программисты',
    effect: '60K за каждого в команде',
    check: ({ members }) => allOf(members, 'coder'),
    bonus: ({ members }) => ({ money: 60 * members.length }),
  },
  {
    id: 'writers',
    name: 'Все сценаристы',
    condition: '3+ человека в команде, и все — сценаристы',
    effect: '+2 к оценке и 250 фанатов за каждого',
    check: ({ members }) => allOf(members, 'writer'),
    bonus: ({ members }) => ({ score: 2, fans: 250 * members.length }),
  },
  {
    id: 'designers',
    name: 'Все художники',
    condition: '3+ человека в команде, и все — художники',
    effect: '300 фанатов за каждого и +1 к бренду',
    check: ({ members }) => allOf(members, 'designer'),
    bonus: ({ members }) => ({ fans: 300 * members.length, brand: 1 }),
  },
  {
    id: 'sound',
    name: 'Все звуковики',
    condition: '3+ человека в команде, и все — звуковики',
    effect: '+1 к оценке и +1 к бренду',
    check: ({ members }) => allOf(members, 'sound'),
    bonus: () => ({ score: 1, brand: 1 }),
  },
  {
    id: 'stars',
    name: 'Звёздный состав',
    condition: '3+ человека, у каждого есть эффективный стат 100+',
    effect: '+4 к оценке и +2 к бренду',
    check: ({ members, eff }) =>
      members.length >= 3 &&
      members.every((s) => {
        const e = eff.get(s.id) ?? s.stats;
        return STAT_KEYS.some((k) => e[k] >= CONFIG.GAME_STAT_CAP);
      }),
    bonus: () => ({ score: 4, brand: 2 }),
  },
  {
    id: 'veterans',
    name: 'Ветераны',
    condition: '3+ человека, все наняты 10+ лет назад',
    effect: '80K за каждого и +1 к бренду',
    check: ({ state, members }) =>
      members.length >= 3 &&
      members.every((s) => {
        const w = hiredWeek(s);
        return w !== null && state.week - w >= VETERAN_DAYS;
      }),
    bonus: ({ members }) => ({ money: 80 * members.length, brand: 1 }),
  },
  {
    id: 'studio',
    name: 'Вся студия — одна семья',
    condition: 'Все сотрудники студии (5+) работали над игрой',
    effect: '+2 к оценке, 500 фанатов и +1 к бренду',
    check: ({ state, members }) => members.length >= 5 && members.length === state.staff.length,
    bonus: () => ({ score: 2, fans: 500, brand: 1 }),
  },
  {
    id: 'young',
    name: 'Молодёжь',
    condition: '3+ человека, все наняты меньше 3 лет назад',
    effect: '50K и 150 фанатов за каждого',
    check: ({ state, members }) =>
      members.length >= 3 &&
      members.every((s) => {
        const w = hiredWeek(s);
        return w !== null && state.week - w < 3 * CONFIG.YEAR_LENGTH;
      }),
    bonus: ({ members }) => ({ money: 50 * members.length, fans: 150 * members.length }),
  },
  {
    id: 'same-sex',
    name: 'Своя компания',
    condition: '3+ человека, все одного пола',
    effect: '+1 к оценке и 200 фанатов за каждого',
    check: ({ members }) =>
      members.length >= 3 && (members.every((s) => s.gender === 'M') || members.every((s) => s.gender === 'F')),
    bonus: ({ members }) => ({ score: 1, fans: 200 * members.length }),
  },
];

export interface ComboAwardDef {
  at: number;
  money?: number;
  fans?: number;
  brandAll?: number; // ко всем существующим франшизам
  text: string;
}

/** Награды за коллекцию: выдаются в момент пересечения порога (один раз). */
export const COMBO_AWARDS: ComboAwardDef[] = [
  { at: 3, money: 150, fans: 500, text: '3 комбо: 150K и 500 фанатов' },
  { at: 5, money: 300, brandAll: 2, text: '5 комбо: 300K и +2 бренда всем франшизам' },
  { at: 7, money: 600, fans: 1200, text: '7 комбо: 600K и 1200 фанатов' },
  { at: 10, money: 1000, fans: 3000, brandAll: 3, text: '10 комбо: 1000K, 3000 фанатов и +3 бренда' },
];

/** Бренд всем франшизам (награда за коллекцию). */
export function addBrandAll(state: GameState, amount: number): void {
  if (!amount) return;
  for (const f of Object.values(state.franchises ?? {})) {
    f.brand = Math.max(0, Math.min(100, f.brand + amount));
  }
}

export function comboCtx(state: GameState, game: ActiveGame): ComboContext {
  return { state, game, members: teamMembers(state, game), eff: effectiveStats(state) };
}

/** Подходящие комбо — проверяются на готовой игре (после завершения разработки). */
export function matchingCombos(state: GameState, game: ActiveGame): TeamComboDef[] {
  const ctx = comboCtx(state, game);
  return TEAM_COMBOS.filter((c) => {
    try {
      return c.check(ctx);
    } catch {
      return false;
    }
  });
}

/**
 * Применить комбо на релизе: суммарный бонус + открытие новых в `state.combos` (навсегда).
 * Эффекты срабатывают на каждом релизе подходящего состава; «открытие» фиксируется один раз.
 */
export function applyCombos(
  state: GameState, game: ActiveGame,
): ComboBonus & { matched: TeamComboDef[]; opened: TeamComboDef[]; awards: ComboAwardDef[]; count: number } {
  const matched = matchingCombos(state, game);
  const ctx = comboCtx(state, game);
  const bonus: ComboBonus = { score: 0, money: 0, fans: 0, brand: 0 };
  for (const c of matched) {
    const b = c.bonus(ctx);
    bonus.score += b.score ?? 0;
    bonus.money += b.money ?? 0;
    bonus.fans += b.fans ?? 0;
    bonus.brand += b.brand ?? 0;
  }
  state.combos ??= {};
  const prevCount = Object.keys(state.combos).length;
  const opened: TeamComboDef[] = [];
  for (const c of matched) {
    if (!state.combos[c.id]) {
      state.combos[c.id] = state.week;
      opened.push(c);
    }
  }
  const count = Object.keys(state.combos).length;
  const awards = COMBO_AWARDS.filter((a) => prevCount < a.at && count >= a.at);
  for (const a of awards) {
    bonus.money += a.money ?? 0;
    bonus.fans += a.fans ?? 0;
  }
  return { ...bonus, matched, opened, awards, count };
}

/** Бренд франшизы этого жанра|типа (если уже родилась) — бонус комбо после релиза. */
export function addComboBrand(state: GameState, game: ActiveGame, amount: number): void {
  if (!amount) return;
  const f = Object.values(state.franchises ?? {}).find(
    (x) => x.genreId === game.genreId && x.typeId === game.typeId,
  );
  if (f) f.brand = Math.max(0, Math.min(100, f.brand + amount));
}
