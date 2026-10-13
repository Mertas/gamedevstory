// Метаданные игры для клиента (сервер шлёт один раз при подключении) + чистые хелперы.
import type { CareerId } from '../core/data/schema';
import type { ConsoleState } from '../core/types';
import { comboGradeFrom } from './rules';
import { ownConsoleMult, MONTH_OFFSETS } from './consoles';
import { CONFIG } from '../core/config';

export interface MetaData {
  genres: { id: string; name: string; ru: string; popularity: string; costWan: number; unlockJob: string | null; unlockLevel: number | null }[];
  types: { id: string; name: string; nameRu: string | null; popularity: string; unlockJob: string | null; unlockLevel: number | null; unlockTraining: string | null }[];
  consoles: {
    id: string; name: string; company: string;
    licenseCost: number; installBase: number; costMult: number;
    unlock: [number, number, number] | string | null;
    removed: [number, number, number] | null;
  }[];
  staff: {
    id: string; name: string; gender: string; salary: number; hireFee: number;
    maxPower: number; stats: { program: number; scenario: number; graphics: number; sound: number };
    careers: Record<CareerId, number>; activeCareer: CareerId; unlock: string;
    persona: string | null; // PLAN-41: характер — показывается в окне сотрудника
  }[];
  comboGrades: Record<string, string>;
  genreOrder: string[];
  trainings: { id: number; name: string; nameRu: string | null; costWan: number | null; power: number | null; program: number | null; scenario: number | null; graphics: number | null; sound: number | null; office: number | null }[];
  ads: { id: number; name: string; nameRu: string | null; costWan: number | null; office: number | null }[];
  contracts: {
    id: number; name: string; nameRu: string | null; rewardMin: number | null; rewardMax: number | null;
    prMin: number | null; prMax: number | null; weeks: number | null;
    reqProgram: number | null; reqScenario: number | null; reqGraphics: number | null; reqSound: number | null;
    office: number | null;
  }[];
  boosterPrices: { office: number; purchaseNo: number; price: number }[];
  consumablePrices: { name: string; office: number; price: number }[];
}

export function genreById(meta: MetaData, id: string) {
  return meta.genres.find((g) => g.id === id);
}

export function typeById(meta: MetaData, id: string) {
  return meta.types.find((t) => t.id === id);
}

export function consoleById(meta: MetaData, id: string) {
  return meta.consoles.find((c) => c.id === id);
}

/**
 * Общий список платформ партии: рыночные из меты + готовые свои консоли (own-*).
 * Своя консоль появляется в мастере разработки и окне «Железо» через этот хелпер.
 */
export function allConsoles(
  meta: MetaData,
  game: { consoles: Record<string, ConsoleState>; studioName: string },
): MetaData['consoles'] {
  const list: MetaData['consoles'] = [...meta.consoles];
  for (const [id, cs] of Object.entries(game.consoles)) {
    if (!id.startsWith('own-') || !cs.licensed) continue;
    list.push({
      id,
      name: cs.name ?? 'Своя консоль',
      company: game.studioName,
      licenseCost: 0,
      installBase: cs.base,
      costMult: ownConsoleMult(cs.cpu, cs.media),
      unlock: null,
      removed: null,
    });
  }
  return list;
}

export function comboGrade(meta: MetaData, genreId: string, typeId: string): string {
  return comboGradeFrom(meta.comboGrades, meta.genreOrder, genreId, typeId);
}

// isUnlocked / consoleAvailable — единый источник: shared/rules.ts (CORE-04)
export { isUnlocked, consoleAvailable } from './rules';

// ─── даты ───
const MONTHS_RU = ['апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря', 'января', 'февраля', 'марта'];
const MONTH_DAYS = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31]; // MONTH_OFFSETS — единый источник: shared/consoles.ts (аудит-51 04-P3-3)

export function dayInYear(week: number): number {
  return ((week - 1) % CONFIG.YEAR_LENGTH) + 1;
}

// «15 июня 1986» (week = игровой день, старт 1 апреля 1985).
// ВАЖНО: январь–март = конец игрового года → календарный год на 1 больше (4 января игрового
// года 1 = 4 января 1986, не 1985).
export function dateLabel(week: number): string {
  const gameYear = Math.floor((week - 1) / CONFIG.YEAR_LENGTH);
  const d = dayInYear(week);
  for (let m = 0; m < 12; m++) {
    if (d <= (MONTH_OFFSETS[m] ?? 0) + (MONTH_DAYS[m] ?? 0)) {
      const year = 1985 + gameYear + (m >= 9 ? 1 : 0); // январь–март (индекс 9–11) — уже следующий год
      return `${d - (MONTH_OFFSETS[m] ?? 0)} ${MONTHS_RU[m]} ${year}`;
    }
  }
  return `31 марта ${1985 + gameYear + 1}`;
}

// M7: пул кандидатов метода больше не считается на клиенте — список приходит с сервера
// (платный поиск, `game.activeSearch`); см. `shared/hire.ts` и `core/systems/staff.ts`.
