// Рантайм-доступ к контентной базе (data/gamedev.db, SQLite через node:sqlite).
// Игра живёт на сервере (Node) — клиент получает данные по WebSocket, БД в браузер не уходит.
// Единственный модуль, который знает про SQLite; движок импортирует только отсюда.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type {
  CareerId, ConsoleData, GenreData, ReviewMessage, StaffData, TypeData,
} from './schema';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const DB_PATH = fileURLToPath(new URL('../../../data/gamedev.db', import.meta.url));
const db = new DatabaseSync(DB_PATH, { readOnly: true });

type Row = Record<string, unknown>;

function all<T>(sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function get<T>(sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

// ---------------- жанры ----------------

export const GENRES: GenreData[] = all<Row>(
  `SELECT id, name, ru, popularity, cost_wan AS costWan,
          unlock_job AS unlockJob, unlock_level AS unlockLevel
   FROM genres ORDER BY rowid`,
).map((r) => ({
  id: r.id as string,
  name: r.name as string,
  ru: r.ru as string,
  popularity: r.popularity as GenreData['popularity'],
  costWan: r.costWan as number,
  unlockJob: r.unlockJob as CareerId | null,
  unlockLevel: r.unlockLevel as number | null,
}));

export const GENRE_ORDER: string[] = GENRES.map((g) => g.id);

export function genreById(id: string): GenreData | undefined {
  return GENRES.find((g) => g.id === id);
}

// ---------------- типы ----------------

export const TYPES: TypeData[] = all<Row>(
  `SELECT id, name, name_ru AS nameRu, popularity, unlock_job AS unlockJob,
          unlock_level AS unlockLevel, unlock_training AS unlockTraining
   FROM types ORDER BY rowid`,
).map((r) => ({
  id: r.id as string,
  name: r.name as string,
  nameRu: (r.nameRu as string) ?? null,
  popularity: r.popularity as TypeData['popularity'],
  unlockJob: r.unlockJob as CareerId | null,
  unlockLevel: r.unlockLevel as number | null,
  unlockTraining: r.unlockTraining as TypeData['unlockTraining'],
}));

export function typeById(id: string): TypeData | undefined {
  return TYPES.find((t) => t.id === id);
}

// ---------------- комбо (79 × 20, свёрнуто в строки градаций) ----------------

const comboRows = all<Row>(
  `SELECT c.type_id AS typeId, c.grade, g.rowid AS gord
   FROM combos c JOIN genres g ON g.id = c.genre_id
   ORDER BY c.type_id, gord`,
);
export const COMBO_GRADES: Record<string, string> = {};
for (const row of comboRows) {
  const tid = row.typeId as string;
  COMBO_GRADES[tid] = (COMBO_GRADES[tid] ?? '') + (row.grade as string);
}

// ---------------- консоли ----------------

export const CONSOLES: ConsoleData[] = all<Row>(
  `SELECT id, name, dev_cost AS devCost, license_cost AS licenseCost, company,
          unlock_y AS unlockY, unlock_m AS unlockM, unlock_w AS unlockW, unlock_text AS unlockText,
          removed_y AS removedY, removed_m AS removedM, removed_w AS removedW,
          install_base AS installBase, cost_mult AS costMult
   FROM consoles ORDER BY rowid`,
).map((r) => ({
  id: r.id as string,
  name: r.name as string,
  devCost: r.devCost as number,
  licenseCost: r.licenseCost as number,
  company: r.company as string,
  unlock: (r.unlockY as number | null) !== null
    ? [r.unlockY as number, r.unlockM as number, r.unlockW as number] as [number, number, number]
    : (r.unlockText as string | null),
  removed: (r.removedY as number | null) !== null
    ? [r.removedY as number, r.removedM as number, r.removedW as number] as [number, number, number]
    : null,
  installBase: r.installBase as number,
  costMult: r.costMult as number,
}));

export function consoleById(id: string): ConsoleData | undefined {
  return CONSOLES.find((c) => c.id === id);
}

// ---------------- сотрудники ----------------

const CAREER_KEYS = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'] as const;

export const STAFF: StaffData[] = all<Row>(
  `SELECT s.id, s.name, s.gender, s.salary, s.hire_fee AS hireFee, s.max_power AS maxPower,
          s.program, s.scenario, s.graphics, s.sound,
          s.career_coder, s.career_writer, s.career_designer, s.career_sound,
          s.career_director, s.career_producer, s.career_hw, s.career_hacker,
          s.active_career AS activeCareer, s.unlock,
          p.persona AS persona
   FROM staff s LEFT JOIN personalities p ON p.staff_id = s.id
   ORDER BY s.rowid`,
).map((r) => {
  const careers = {} as Record<CareerId, number>;
  for (const k of CAREER_KEYS) careers[k] = r[`career_${k}`] as number;
  return {
    id: r.id as string,
    name: r.name as string,
    gender: r.gender as string,
    salary: r.salary as number,
    hireFee: r.hireFee as number,
    maxPower: r.maxPower as number,
    stats: {
      program: r.program as number,
      scenario: r.scenario as number,
      graphics: r.graphics as number,
      sound: r.sound as number,
    },
    careers,
    activeCareer: r.activeCareer as CareerId,
    unlock: r.unlock as string,
    persona: (r.persona as string | null | undefined) ?? null,
  };
});

// ---------------- реплики рецензентов ----------------

export const MESSAGES: ReviewMessage[] = all<Row>(
  'SELECT points, message FROM review_messages ORDER BY points DESC, rowid',
).map((r) => ({ points: r.points as number, message: r.message as string }));

// ---------------- контракты / обучение / реклама / найм (M3–M4) ----------------

export interface ContractData {
  id: number; name: string; nameRu: string | null; nameEn: string | null;
  rewardMin: number | null; rewardMax: number | null;
  prMin: number | null; prMax: number | null;
  weeks: number | null;
  reqProgram: number | null; reqScenario: number | null;
  reqGraphics: number | null; reqSound: number | null;
  office: number | null;
}
export const CONTRACTS: ContractData[] = all<Row>(
  `SELECT id, name, name_ru AS nameRu, name_en AS nameEn, reward_min AS rewardMin, reward_max AS rewardMax,
          pr_min AS prMin, pr_max AS prMax, weeks,
          req_program AS reqProgram, req_scenario AS reqScenario,
          req_graphics AS reqGraphics, req_sound AS reqSound, office
   FROM contracts ORDER BY id`,
).map((r) => ({ ...r }) as unknown as ContractData);

export interface TrainingData {
  id: number; name: string; nameRu: string | null; nameEn: string | null;
  costWan: number | null; power: number | null;
  program: number | null; scenario: number | null;
  graphics: number | null; sound: number | null;
  office: number | null;
}
export const TRAININGS: TrainingData[] = all<Row>(
  `SELECT id, name, name_ru AS nameRu, name_en AS nameEn, cost_wan AS costWan, power,
          program, scenario, graphics, sound, office
   FROM trainings ORDER BY id`,
).map((r) => ({ ...r }) as unknown as TrainingData);

export interface AdData { id: number; name: string; nameRu: string | null; nameEn: string | null; costWan: number | null; office: number | null }
export const ADS: AdData[] = all<Row>(
  'SELECT id, name, name_ru AS nameRu, name_en AS nameEn, cost_wan AS costWan, office FROM ads ORDER BY id',
).map((r) => ({ ...r }) as unknown as AdData);

export interface HireMethodData { id: number; name: string; nameEn: string | null; costWan: number | null; office: number | null }
export const HIRE_METHODS: HireMethodData[] = all<Row>(
  'SELECT id, name, name_en AS nameEn, cost_wan AS costWan, office FROM hire_methods ORDER BY id',
).map((r) => ({ ...r }) as unknown as HireMethodData);

export interface OfficeData { level: number; capacity: number; moveCost: number; triggerText: string }
export const OFFICES: OfficeData[] = all<Row>(
  'SELECT level, capacity, move_cost AS moveCost, trigger_text AS triggerText FROM offices ORDER BY level',
).map((r) => ({ ...r }) as unknown as OfficeData);

export interface BoosterPrice { office: number; purchaseNo: number; price: number }
export const BOOSTER_PRICES: BoosterPrice[] = all<Row>(
  'SELECT office, purchase_no AS purchaseNo, price FROM item_boosters ORDER BY office, purchase_no',
).map((r) => ({ ...r }) as unknown as BoosterPrice);

export interface ConsumablePrice { name: string; nameEn: string | null; office: number; price: number }
export const CONSUMABLE_PRICES: ConsumablePrice[] = all<Row>(
  'SELECT name, name_en AS nameEn, office, price FROM item_consumables ORDER BY name, office',
).map((r) => ({ ...r }) as unknown as ConsumablePrice);

// ---------------- мета ----------------

export function dbInfo(): { version: number; tables: string[]; combos: number } {
  const version = (get<Row>('PRAGMA user_version') ?? { user_version: 0 }).user_version as number;
  const tables = all<Row>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name as string);
  const combos = (get<Row>('SELECT COUNT(*) AS c FROM combos') ?? { c: 0 }).c as number;
  return { version, tables, combos };
}
