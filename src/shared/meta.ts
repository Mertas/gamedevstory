// Метаданные игры для клиента (сервер шлёт один раз при подключении) + чистые хелперы.
import type { CareerId } from '../core/data/schema';
import type { GameState } from '../core/types';

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

export function comboGrade(meta: MetaData, genreId: string, typeId: string): string {
  const row = meta.comboGrades[typeId];
  if (!row) return 'C';
  const idx = meta.genreOrder.indexOf(genreId);
  return idx >= 0 ? (row[idx] ?? 'C') : 'C';
}

export function isUnlocked(game: GameState, job: string | null, level: number | null, training?: string | null): boolean {
  if (job && level && !game.staff.some((s) => (s.careers[job as CareerId] ?? 0) >= level)) return false;
  if (training && !game.unlockedTrainings.some((x) => x.toLowerCase().includes(training.toLowerCase()))) return false;
  return true;
}

export function consoleAvailable(game: GameState, consoleId: string): boolean {
  const cs = game.consoles[consoleId];
  return !!cs && cs.licensed && cs.availableAtWeek !== null && cs.availableAtWeek <= game.week
    && (cs.removedAtWeek === null || cs.removedAtWeek > game.week);
}

// кандидаты для метода найма (логика как в движке, но на клиентских данных)
export function candidatePool(game: GameState, meta: MetaData, unlock: string[]): string[] {
  return meta.staff
    .filter((d) => !game.hiredIds.includes(d.id))
    .filter((d) => unlock.some((u) => d.unlock.includes(u)))
    .map((d) => d.id);
}
