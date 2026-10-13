// Сборка SQLite-базы данных игры из research/*.md (замена tools/extract_data.py).
// Запуск: pnpm db:build  →  создаёт data/gamedev.db
//
// Таблицы: genres, types, combos, consoles, staff, review_messages,
//          contracts, trainings, ads, hire_methods, offices,
//          item_boosters, item_consumables
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const R1 = `${ROOT}research/01_english_wiki_mechanics.md`;
const R2 = `${ROOT}research/02_formulas_and_numbers.md`;
const R3 = `${ROOT}research/03_japanese_sources.md`;
const R4 = `${ROOT}research/04_Личности_сотрудников.md`;
const DB_PATH = `${ROOT}data/gamedev.db`;

// ---------------- helpers ----------------

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

function section(text: string, startMarker: string, endMarker: string): string {
  const i = text.indexOf(startMarker);
  const j = text.indexOf(endMarker, i);
  return text.slice(i, j);
}

function tableRows(block: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return rows;
}

function clean(s: string | undefined): string {
  return (s ?? '').replace(/\*\*/g, '').trim();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** '$20.0K' -> 20.0; '99,999.9K' -> 99999.9; '$200.0k' -> 200; ''/'—'/'-'/'None' -> null */
function money(s: string | undefined): number | null {
  s = clean(s);
  if (!s || ['—', '-', '−', 'None', 'none'].includes(s)) return null;
  const v = Number(s.replace(/[$Kk,]/g, ''));
  return Number.isFinite(v) ? v : null;
}

function num(s: string | undefined): number | null {
  s = clean(s);
  if (!s || ['—', '-', '−'].includes(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? Math.trunc(v) : null;
}

interface DateParts { y: number; m: number; w: number }

/** 'Y6 M2 W1' -> {6,2,1}; 'Never' -> null; 'Day 1'/'start' -> {1,1,1}; иначе строка-условие */
function datev(s: string | undefined): DateParts | string | null {
  s = clean(s);
  if (!s || ['never', 'forever', '—', '-'].includes(s.toLowerCase())) return null;
  const m = s.match(/^Y(\d+)\s*M(\d+)(?:\s*W(\d+))?$/i);
  if (m) return { y: Number(m[1]), m: Number(m[2]), w: Number(m[3] ?? 1) };
  if (['day 1', 'start', 'initially available'].includes(s.toLowerCase())) return { y: 1, m: 1, w: 1 };
  return s;
}

const JOB: Record<string, string> = {
  writer: 'writer', coder: 'coder', designer: 'designer', 'design.': 'designer',
  'snd. eng.': 'sound', director: 'director', producer: 'producer',
  'hard. eng.': 'hw', hacker: 'hacker',
};
const TRAIN: Record<string, string> = {
  stroll: 'stroll', reading: 'reading', movie: 'movie', anime: 'anime',
  game: 'game', jogging: 'jogging', pinball: 'pinball', meditate: 'meditate',
  meditiate: 'meditate', concert: 'concert', 'net surf': 'netsurf',
  museum: 'museum', college: 'college', 'lab study': 'lab',
  'short trip': 'shorttrip', 'long trip': 'longtrip', retreat: 'retreat',
};

function unlockJob(s: string | undefined): string | null {
  s = clean(s).toLowerCase();
  if (!s || s === 'initially available') return null;
  return JOB[s] ?? null;
}

function officeOf(s: string | undefined): number | null {
  s = clean(s);
  if (!s || s === 'start') return 1;
  if (s.includes('中規模')) return 2;
  if (s.includes('大規模')) return 3;
  return null;
}

const JP_GENRE_EN: Record<string, string> = {
  'Table game': 'Table', 'Adventure': 'Adventure', 'Collection/Asset': 'Trivia',
  'Puzzle': 'Puzzle', 'Education': 'Educational', 'Simulation': 'Simulation',
  'Action game': 'Action', 'Shooting': 'Shooter', 'RPG': 'RPG',
  'Training/Raising': 'Life', 'Racing': 'Racing', 'Simulation RPG': 'Sim RPG',
  'Sound Novel': 'Audio Novel', 'Music': 'Music', 'Board game': 'Board',
  'Action RPG': 'Action RPG', 'Net RPG': 'Online RPG', 'Card game': 'Card Game',
  'Motion/Experience': 'Motion', 'Net SLG': 'Online Sim',
};
const GENRE_RU: Record<string, string> = {
  RPG: 'Ролевая игра', Simulation: 'Симулятор', 'Sim RPG': 'Сим-RPG',
  Table: 'Настолка', Action: 'Экшен', Adventure: 'Приключение',
  Shooter: 'Шутер', 'Action RPG': 'Экшен-RPG', Racing: 'Гонки',
  'Online RPG': 'Онлайн-RPG', 'Online Sim': 'Онлайн-сим', Trivia: 'Викторина',
  Life: 'Жизнь', Board: 'Настольные', Puzzle: 'Пазл', Music: 'Музыка',
  'Audio Novel': 'Звуковой роман', Motion: 'Танцы/Спорт', Educational: 'Обучение',
  'Card Game': 'Карточная',
};
const CONSOLE_MULT: Record<string, number> = {
  PC: 1, 'Microx SX': 2, Exodus: 2, IES: 2, 'Game Kid': 1, 'Play Gear': 2,
  'PCC-FQX': 3, NEONGEON: 4, 'Game Swan': 3, 'Super IES': 4, 'Virtual Kid': 5,
  PlayStatus: 8, Playdion: 12, Uranus: 8, 'Game-Box': 12, 'Mini Status': 9,
  'Intendro DM': 18, 'PlayStatus 2': 18, 'Microx 480': 18, Whoops: 25,
  'Harpo Drive': 25, 'Play Popo X': 30, 'Jupiter 512': 50, GameJohn: 50,
};

// ---------------- чтение исходников ----------------

const r1 = read(R1);
const r2 = read(R2);
const r3 = read(R3);
const r4 = read(R4);

const bGenres = section(r1, '## Appendix B — Genres (20)', '## Appendix C — Types (79)');
const bTypes = section(r1, '## Appendix C — Types (79)', '## Appendix D1 — Combo compatibility matrix');
const bCombo = section(r1, '## Appendix D1 — Combo compatibility matrix', '## Appendix D2 — Combo compatibility matrix');
const bConsoles = section(r1, '## Appendix E — Consoles (24)', '## Appendix F — Magazine review messages');
const bMessages = section(r1, '## Appendix F — Magazine review messages (58) with points', '## Appendix G — Achievements (32)');
const bStaff = section(r1, '## Appendix A1 — Hire-able employees (45 rows', '## Appendix A2 — Outsourced specialists (18)');
const bCons2 = section(r2, '## 7.1 Market consoles', '### 7.2 Your own console');
const bJpGenres = section(r3, '## 3. Genres (ジャンル)', '## 4. Contents (内容)');
const bContracts = section(r3, '## 8. Contracts (受注開発)', '## 9. Consoles (ハード)');
const bHire = section(r3, '### 12.5 Recruiting methods (求人)', '## 13. Offices (オフィス)');
const bBoosters = section(r2, '**Boosters**', '**Replenishable items**');

// ---------------- парсинг ----------------

// жанры: EN-вики + стоимости из JP
const jpCosts = new Map<string, number>();
for (const row of tableRows(bJpGenres)) {
  if (row.length < 6 || !row[1]) continue;
  const en = JP_GENRE_EN[clean(row[2])];
  if (en) jpCosts.set(en, num(row[4]) ?? 300);
}

interface GenreRow { id: string; name: string; ru: string; popularity: string; costWan: number; unlockJob: string | null; unlockLevel: number | null }
const genres: GenreRow[] = [];
for (const row of tableRows(bGenres)) {
  if (row.length < 5 || !row[0] || row[0] === 'No.' || row[1] === 'Genre') continue;
  const name = clean(row[1]);
  genres.push({
    id: slug(name),
    name,
    ru: GENRE_RU[name] ?? name,
    popularity: clean(row[2]).toUpperCase() || 'C',
    costWan: jpCosts.get(name) ?? 300,
    unlockJob: unlockJob(row[3]),
    unlockLevel: num(row[4]),
  });
}
if (genres.length !== 20) throw new Error(`genres: ${genres.length}`);

// ─── русские названия (11_Контент) ───
const TYPES_RU: Record<string, string> = {
  'sports': 'Спорт', 'exploration': 'Приключения', 'martial-arts': 'Единоборства', 'fantasy': 'Фэнтези',
  'virtual-pet': 'Виртуальный питомец', 'samurai': 'Самураи', 'dungeon': 'Данжоны', 'romance': 'Романтика',
  'pirate': 'Пираты', 'comedy': 'Комедия', 'horror': 'Хоррор', 'word': 'Словесные', 'train': 'Поезда',
  'animal': 'Животные', 'robot': 'Роботы', 'airplane': 'Авиация', 'conv-store': 'Магазинчик',
  'historical': 'История', 'bookstore': 'Книжный магазин', 'comics': 'Комиксы', 'art': 'Искусство',
  'movies': 'Кино', 'game-co': 'Игровая студия', 'egypt': 'Египет', 'town': 'Городок',
  'architecture': 'Архитектура', 'lawyer': 'Адвокаты', 'medieval': 'Средневековье', 'monster': 'Монстры',
  'hunting': 'Охота', 'high-school': 'Старшая школа', 'junior-high': 'Школа', 'war': 'Война',
  'ninja': 'Ниндзя', 'cutie': 'Милые', 'ogre': 'Огры', 'fashion': 'Мода', 'detective': 'Детектив',
  'mystery': 'Загадки', 'cowboy': 'Ковбои', 'horseshoes': 'Подковы', 'president': 'Президент',
  'stocks': 'Биржа', 'cartoon': 'Мультфильмы', 'cosplay': 'Косплей', 'pop-star': 'Поп-звезда',
  'swimsuit': 'Купальники', 'mini-skirt': 'Мини-юбки', 'mushroom': 'Грибы', 'poncho': 'Пончо',
  'chess': 'Шахматы', 'checkers': 'Шашки', 'mahjong': 'Маджонг', 'reversi': 'Реверси',
  'dance': 'Танцы', 'drums': 'Барабаны', 'fitness': 'Фитнес', 'pro-wrestling': 'Реслинг',
  'basketball': 'Баскетбол', 'skiing': 'Лыжи', 'snowboard': 'Сноуборд', 'golf': 'Гольф',
  'swimming': 'Плавание', 'volleyball': 'Волейбол', 'motorsport': 'Автоспорт', 'soccer': 'Футбол',
  'ping-pong': 'Пинг-понг', 'sumo': 'Сумо', 'baseball': 'Бейсбол', 'wrestling': 'Борьба',
  'marathon': 'Марафон', 'f1-racing': 'Формула-1', 'pinball': 'Пинбол', 'slots': 'Автоматы',
  'dating': 'Свидания', 'harbor': 'Гавань', 'time-travel': 'Путешествия во времени', 'spy': 'Шпионы',
  'celebrity': 'Знаменитости',
};
const CONTRACTS_RU: Record<number, string> = {
  1: 'Игровая манга', 2: 'Рингтон', 3: 'Талисман района', 4: 'Звуки для аниме', 5: 'Дизайн персонажа',
  6: 'Видео для патинко', 7: 'Игровой сценарий', 8: 'Разработка инструментов', 9: 'Мини-игра по заказу',
  10: 'Игровой движок', 11: 'Тематическая песня', 12: '3D для кино', 13: 'Музыка к фильму',
  14: 'Перевод игры', 15: 'Портирование игры', 16: 'Анализ игровой консоли',
};
const ADS_RU: Record<string, string> = {
  '雑誌に広告 magazine': 'Журнальная реклама', 'ネット広告 net': 'Интернет-реклама',
  'ラジオ広告 radio': 'Радио', '体験版を配布 demo': 'Демо-версии', 'ちんどん屋 (street band)': 'Уличный оркестр',
  'テレビCM TV CM': 'ТВ-реклама', '着ぐるみショウ mascot show': 'Ростовые куклы',
  'テレビ番組スポンサー TV sponsor': 'Спонсор ТВ-шоу', 'キャラバンカーが走る caravan': 'Автокараван',
  'カードゲーム大会 card tournament': 'Турнир карточных игр', '飛行船を飛ばす airship': 'Дирижабль',
  '月面広告 moon ad': 'Реклама на Луне',
};
const TRAIN_RU: Record<string, string> = {
  '散歩 walk': 'Прогулка', '読書 reading': 'Чтение', '映画鑑賞 movies': 'Кино', 'アニメ鑑賞 anime': 'Аниме',
  'ゲームで遊ぶ games': 'Игры', 'ジョギング jogging': 'Пробежка', 'パチンコ pachinko': 'Пинбол',
  '瞑想 meditation': 'Медитация', '音楽ライブ live music': 'Концерт', 'ネットサーフィン surfing': 'Интернет-сёрфинг',
  '科学博物館 museum': 'Музей', '大学で勉強 university': 'Университет', '研究所 lab': 'Лаборатория',
  '国内旅行 domestic trip': 'Поездка по стране', '海外旅行 overseas trip': 'Поездка за границу',
};

// ─── типы: источник порядка/имён — матрица комбо (79 уникальных, включая Pro Wrestling и Wrestling),
// данные анлока — Appendix C (по имени, первое совпадение)
const bTypesRows = tableRows(bTypes).filter((row) => row.length >= 6 && row[0] && row[0] !== 'No.' && row[1] !== 'Type');
const typeByName = new Map<string, string[]>();
for (const row of bTypesRows) typeByName.set(clean(row[1]).replace('Soccor', 'Soccer'), row);
const comboTypeNames = new Set<string>();
for (const row of tableRows(bCombo)) {
  if (row.length < 21 || !row[0] || row[0].includes('\\')) continue;
  comboTypeNames.add(clean(row[0]).replace('Soccor', 'Soccer'));
}
interface TypeRow { id: string; name: string; popularity: string; unlockJob: string | null; unlockLevel: number | null; unlockTraining: string | null }
const types: TypeRow[] = [];
for (const name of comboTypeNames) {
  const src = typeByName.get(name);
  types.push({
    id: slug(name),
    name,
    popularity: src ? (clean(src[2]).toUpperCase() || 'C') : 'C',
    unlockJob: src ? unlockJob(src[3]) : null,
    unlockLevel: src ? num(src[4]) : null,
    unlockTraining: src ? (TRAIN[clean(src[5]).toLowerCase()] ?? null) : null,
  });
}
if (types.length !== 79) throw new Error(`types: ${types.length}`);

// комбо: нормализованные строки (type_id, genre_id, grade)
const genreOrder: string[] = [];
const combos: { typeId: string; genreId: string; grade: string }[] = [];
for (const row of tableRows(bCombo)) {
  if (row.length < 21 || !row[0]) continue;
  if (row[0].includes('\\')) {
    // заголовок «Type \ Genre | RPG | ...» — фиксирует порядок жанров
    for (let i = 1; i <= 20; i++) genreOrder.push(slug(clean(row[i]!)));
    continue;
  }
  const typeId = slug(clean(row[0]!).replace('Soccor', 'Soccer'));
  for (let i = 1; i <= 20; i++) {
    const g = clean(row[i]!).replace('*', '');
    combos.push({ typeId, genreId: genreOrder[i - 1]!, grade: 'SABCDF'.includes(g) ? g : 'C' });
  }
}
if (combos.length !== 79 * 20) throw new Error(`combos: ${combos.length}`);

// консоли: Appendix E + базы из research/02 §7.1
const installBase = new Map<string, number>();
for (const row of tableRows(bCons2)) {
  if (row.length < 8 || !row[0] || row[0] === 'Console') continue;
  installBase.set(clean(row[0]), money(row[3]) ?? 500);
}

interface ConsoleRow { id: string; name: string; devCost: number; licenseCost: number; company: string; unlockY: number | null; unlockM: number | null; unlockW: number | null; unlockText: string | null; removedY: number | null; removedM: number | null; removedW: number | null; installBase: number; costMult: number }
const consoles: ConsoleRow[] = [];
for (const row of tableRows(bConsoles)) {
  if (row.length < 8 || !row[0] || row[0] === 'Name') continue;
  const name = clean(row[0]);
  const unlock = datev(row[4]);
  const removed = datev(row[5]);
  consoles.push({
    id: slug(name),
    name,
    devCost: money(row[1]) ?? 0,
    licenseCost: money(row[2]) ?? 0,
    company: clean(row[3]) === 'None' ? '' : clean(row[3]),
    unlockY: typeof unlock === 'object' && unlock ? unlock.y : null,
    unlockM: typeof unlock === 'object' && unlock ? unlock.m : null,
    unlockW: typeof unlock === 'object' && unlock ? unlock.w : null,
    unlockText: typeof unlock === 'string' ? unlock : null,
    removedY: typeof removed === 'object' && removed ? removed.y : null,
    removedM: typeof removed === 'object' && removed ? removed.m : null,
    removedW: typeof removed === 'object' && removed ? removed.w : null,
    installBase: installBase.get(name) ?? 500,
    costMult: CONSOLE_MULT[name] ?? 1,
  });
}
if (consoles.length !== 24) throw new Error(`consoles: ${consoles.length}`);

// сотрудники
const CAREER_COLS = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'] as const;
type CareerKey = (typeof CAREER_COLS)[number];
interface StaffRow { id: string; name: string; gender: string; salary: number; hireFee: number; maxPower: number; stats: [number, number, number, number]; careers: Record<CareerKey, number>; activeCareer: string; unlock: string }
const staff: StaffRow[] = [];
for (const row of tableRows(bStaff)) {
  if (row.length < 19 || !row[0] || row[0] === 'Name') continue;
  const name = clean(row[0]).split('(')[0]!.trim();
  const careers = {} as Record<CareerKey, number>;
  for (let i = 0; i < 8; i++) careers[CAREER_COLS[i]!] = num(row[10 + i]!) ?? 0;
  const active = [...CAREER_COLS].sort((a, b) => (careers[b]! - careers[a]!) || (CAREER_COLS.indexOf(a) - CAREER_COLS.indexOf(b)))[0]!;
  staff.push({
    id: slug(name),
    name,
    gender: clean(row[1]),
    salary: money(row[2]) ?? 0,
    hireFee: money(row[3]) ?? 0,
    maxPower: num(row[4]) ?? 8,
    stats: [num(row[5]) ?? 0, num(row[6]) ?? 0, num(row[7]) ?? 0, num(row[8]) ?? 0],
    careers,
    activeCareer: active,
    unlock: clean(row[18]),
  });
}
if (staff.length !== 46) throw new Error(`staff: ${staff.length}`);

// личности сотрудников (research/04, наш контент [Н]): id → инструкция для LLM-чата
const bPersonas = section(r4, '## Таблица личностей', '## Конец');
const staffIds = new Set(staff.map((s) => s.id));
const personas: { staffId: string; persona: string }[] = [];
for (const row of tableRows(bPersonas)) {
  if (row.length < 2 || !row[0] || row[0] === 'id') continue;
  const id = clean(row[0]);
  const persona = clean(row[1]);
  if (!persona) continue;
  if (!staffIds.has(id)) throw new Error(`persona: неизвестный id «${id}»`);
  if (personas.some((p) => p.staffId === id)) throw new Error(`persona: дубль id «${id}»`);
  personas.push({ staffId: id, persona });
}
if (personas.length !== 46) throw new Error(`personas: ${personas.length} (нужно 46)`);

// реплики рецензентов
const messages: { points: number; message: string }[] = [];
for (const row of tableRows(bMessages)) {
  if (row.length < 2 || !row[0] || row[0] === 'Points') continue;
  messages.push({ points: Number(row[0]), message: clean(row[1]) });
}
if (messages.length !== 58) throw new Error(`messages: ${messages.length}`);

// контракты (research/03 §8)
interface ContractRow { id: number; name: string; nameEn: string | null; rewardMin: number | null; rewardMax: number | null; prMin: number | null; prMax: number | null; weeks: number | null; reqP: number | null; reqS: number | null; reqG: number | null; reqSo: number | null; office: number | null }
function range(s: string | undefined): [number | null, number | null] {
  const m = clean(s).match(/^([\d.,]+)\s*[–—-]\s*([\d.,]+)$/);
  if (m) return [Number(m[1]!.replace(/,/g, '')), Number(m[2]!.replace(/,/g, ''))];
  const single = num(s);
  return single !== null ? [single, single] : [null, null];
}
const contracts: ContractRow[] = [];
for (const row of tableRows(bContracts)) {
  if (row.length < 9 || !row[0] || row[0] === 'Job') continue;
  const [rmn, rmx] = range(row[1]!);
  const [pmn, pmx] = range(row[2]!);
  const enMatch = clean(row[0]).match(/\(([^)]+)\)/);
  contracts.push({
    id: contracts.length + 1,
    name: clean(row[0]),
    nameEn: enMatch ? (enMatch[1] ?? null) : null,
    rewardMin: rmn, rewardMax: rmx, prMin: pmn, prMax: pmx,
    weeks: num(row[3]),
    reqP: num(row[4]), reqS: num(row[5]), reqG: num(row[6]), reqSo: num(row[7]),
    office: officeOf(row[8]!),
  });
}
if (contracts.length !== 16) throw new Error(`contracts: ${contracts.length}`);

// обучение (research/03 §12.4 + research/02 §10.5 — цены GFAQS)
// rows: name, cost_wan, power, program, scenario, graphics, sound, office
const TRAIN_ROWS: Array<[string, number | null, number, number | null, number | null, number | null, number | null, number]> = [
  ['散歩 walk', 300, 2, null, 3, 3, null, 1],
  ['読書 reading', 300, 2, 4, 3, null, null, 1],
  ['映画鑑賞 movies', 500, 2, null, null, 4, 4, 1],
  ['アニメ鑑賞 anime', 700, 3, 5, 4, 3, 2, 1],
  ['ゲームで遊ぶ games', 1000, 3, 6, null, 5, null, 1],
  ['ジョギング jogging', 1200, 4, 4, null, null, 5, 2],
  ['パチンコ pachinko', 800, 5, null, null, null, null, 2],
  ['瞑想 meditation', 900, 5, 1, 2, 1, 3, 2],
  ['音楽ライブ live music', 1600, 3, 3, null, null, 5, 2],
  ['ネットサーフィン surfing', 2800, 4, 7, 5, -5, null, 2],
  ['科学博物館 museum', 3000, 4, 5, 6, 6, -3, 2],
  ['大学で勉強 university', 5500, 6, -2, 5, null, null, 3],
  ['研究所 lab', 8000, 7, 6, -3, 3, 4, 3],
  ['国内旅行 domestic trip', 10500, 9, 8, 7, 4, 5, 3],
  ['海外旅行 overseas trip', 25000, 11, 5, 8, 6, 6, 3],
];
interface TrainingRow { name: string; nameEn: string | null; costWan: number | null; power: number | null; program: number | null; scenario: number | null; graphics: number | null; sound: number | null; office: number | null }
const trainings: TrainingRow[] = [];
for (const [name, costWan, power, program, scenario, graphics, sound, office] of TRAIN_ROWS) {
  trainings.push({ name, nameEn: null, costWan, power, program, scenario, graphics, sound, office });
}
if (trainings.length !== 15) throw new Error(`trainings: ${trainings.length}`);

// реклама (research/02 §12 — цены GFAQS; имена JP из research/03 §10)
const AD_ROWS: Array<[string, number, number]> = [
  ['雑誌に広告 magazine', 300, 1],
  ['ネット広告 net', 500, 1],
  ['ラジオ広告 radio', 800, 1],
  ['体験版を配布 demo', 1500, 1],
  ['ちんどん屋 (street band)', 2500, 1],
  ['テレビCM TV CM', 3500, 2],
  ['着ぐるみショウ mascot show', 5000, 2],
  ['テレビ番組スポンサー TV sponsor', 6500, 2],
  ['キャラバンカーが走る caravan', 12000, 2],
  ['カードゲーム大会 card tournament', 33000, 3],
  ['飛行船を飛ばす airship', 55000, 3],
  ['月面広告 moon ad', 99000, 3],
];
interface AdRow { name: string; nameEn: string | null; costWan: number | null; office: number | null }
const ads: AdRow[] = [];
for (const [name, costWan, office] of AD_ROWS) {
  ads.push({ name, nameEn: null, costWan, office });
}
if (ads.length !== 12) throw new Error(`ads: ${ads.length}`);

// методы найма (research/03 §12.5)
interface HireRow { name: string; nameEn: string | null; costWan: number | null; office: number | null }
const hireMethods: HireRow[] = [];
for (const row of tableRows(bHire)) {
  if (row.length < 3 || !row[0] || row[0] === 'Method') continue;
  const enMatch = clean(row[0]).match(/\(([^)]+)\)/);
  hireMethods.push({
    name: clean(row[0]),
    nameEn: enMatch ? (enMatch[1] ?? null) : null,
    costWan: num(row[1]),
    office: officeOf(row[2]!),
  });
}
if (hireMethods.length !== 6) throw new Error(`hireMethods: ${hireMethods.length}`);

// бустеры (research/02 §11)
const boosters: { office: number; purchaseNo: number; price: number }[] = [];
for (const row of tableRows(bBoosters)) {
  if (row.length < 7 || !row[0] || row[0] === 'Office') continue;
  const office = num(row[0]);
  if (office === null) continue;
  for (let i = 1; i <= 6; i++) {
    const price = money(row[i]!);
    if (price !== null) boosters.push({ office, purchaseNo: i, price });
  }
}
if (boosters.length !== 18) throw new Error(`boosters: ${boosters.length}`);

// ---------------- создание БД ----------------

mkdirSync(`${ROOT}data`, { recursive: true });
// аудит-51 04-P2-3: сборка идёт во временный файл, рабочая БД подменяется только после проверки
// полноты — упавшая сборка (кривой research/*.md и т.п.) больше не оставляет проект без БД
const TMP_DB = `${DB_PATH}.tmp`;
rmSync(TMP_DB, { force: true });
const db = new DatabaseSync(TMP_DB);
db.exec(`
PRAGMA journal_mode = OFF;
PRAGMA user_version = 1;

CREATE TABLE genres (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, ru TEXT NOT NULL,
  popularity TEXT NOT NULL, cost_wan INTEGER NOT NULL,
  unlock_job TEXT, unlock_level INTEGER
);
CREATE TABLE types (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ru TEXT, popularity TEXT NOT NULL,
  unlock_job TEXT, unlock_level INTEGER, unlock_training TEXT,
  cost_wan INTEGER  -- TODO(M4): точные стоимости из research/03 §4 (маппинг EN↔JP)
);
CREATE TABLE combos (
  type_id TEXT NOT NULL, genre_id TEXT NOT NULL, grade TEXT NOT NULL,
  PRIMARY KEY (type_id, genre_id)
);
CREATE INDEX idx_combos_genre ON combos(genre_id);
CREATE TABLE consoles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  dev_cost REAL NOT NULL, license_cost REAL NOT NULL, company TEXT NOT NULL,
  unlock_y INTEGER, unlock_m INTEGER, unlock_w INTEGER, unlock_text TEXT,
  removed_y INTEGER, removed_m INTEGER, removed_w INTEGER,
  install_base INTEGER NOT NULL, cost_mult INTEGER NOT NULL
);
CREATE TABLE staff (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL,
  salary REAL NOT NULL, hire_fee REAL NOT NULL, max_power INTEGER NOT NULL,
  program INTEGER NOT NULL, scenario INTEGER NOT NULL,
  graphics INTEGER NOT NULL, sound INTEGER NOT NULL,
  career_coder INTEGER NOT NULL, career_writer INTEGER NOT NULL,
  career_designer INTEGER NOT NULL, career_sound INTEGER NOT NULL,
  career_director INTEGER NOT NULL, career_producer INTEGER NOT NULL,
  career_hw INTEGER NOT NULL, career_hacker INTEGER NOT NULL,
  active_career TEXT NOT NULL, unlock TEXT NOT NULL
);
CREATE TABLE personalities (
  staff_id TEXT PRIMARY KEY, persona TEXT NOT NULL
);
CREATE TABLE review_messages (points INTEGER NOT NULL, message TEXT NOT NULL);
CREATE TABLE contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_ru TEXT, name_en TEXT,
  reward_min REAL, reward_max REAL, pr_min INTEGER, pr_max INTEGER,
  weeks INTEGER, req_program INTEGER, req_scenario INTEGER,
  req_graphics INTEGER, req_sound INTEGER, office INTEGER
);
CREATE TABLE trainings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_ru TEXT, name_en TEXT, cost_wan INTEGER, power INTEGER,
  program INTEGER, scenario INTEGER, graphics INTEGER, sound INTEGER,
  office INTEGER
);
CREATE TABLE ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_ru TEXT, name_en TEXT, cost_wan INTEGER, office INTEGER
);
CREATE TABLE hire_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, name_en TEXT, cost_wan INTEGER, office INTEGER
);
CREATE TABLE offices (
  level INTEGER PRIMARY KEY, capacity INTEGER NOT NULL,
  move_cost REAL NOT NULL, trigger_text TEXT NOT NULL
);
CREATE TABLE item_boosters (
  office INTEGER NOT NULL, purchase_no INTEGER NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (office, purchase_no)
);
CREATE TABLE item_consumables (
  name TEXT NOT NULL, name_en TEXT, office INTEGER NOT NULL, price REAL NOT NULL,
  PRIMARY KEY (name, office)
);
`);

const insGenres = db.prepare('INSERT INTO genres VALUES (?,?,?,?,?,?,?)');
const insTypes = db.prepare('INSERT INTO types VALUES (?,?,?,?,?,?,?,?)');
const insCombos = db.prepare('INSERT INTO combos VALUES (?,?,?)');
const insConsoles = db.prepare('INSERT INTO consoles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const insStaff = db.prepare('INSERT INTO staff VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const insPersonas = db.prepare('INSERT INTO personalities VALUES (?,?)');
const insMessages = db.prepare('INSERT INTO review_messages VALUES (?,?)');
const insContracts = db.prepare('INSERT INTO contracts (name,name_ru,name_en,reward_min,reward_max,pr_min,pr_max,weeks,req_program,req_scenario,req_graphics,req_sound,office) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
const insTrainings = db.prepare('INSERT INTO trainings (name,name_ru,name_en,cost_wan,power,program,scenario,graphics,sound,office) VALUES (?,?,?,?,?,?,?,?,?,?)');
const insAds = db.prepare('INSERT INTO ads (name,name_ru,name_en,cost_wan,office) VALUES (?,?,?,?,?)');
const insHire = db.prepare('INSERT INTO hire_methods (name,name_en,cost_wan,office) VALUES (?,?,?,?)');
const insOffices = db.prepare('INSERT INTO offices VALUES (?,?,?,?)');
const insBoosters = db.prepare('INSERT INTO item_boosters VALUES (?,?,?)');
const insConsumables = db.prepare('INSERT INTO item_consumables VALUES (?,?,?,?)');

db.exec('BEGIN');
for (const g of genres) insGenres.run(g.id, g.name, g.ru, g.popularity, g.costWan, g.unlockJob, g.unlockLevel);
for (const t of types) insTypes.run(t.id, t.name, TYPES_RU[t.id] ?? t.name, t.popularity, t.unlockJob, t.unlockLevel, t.unlockTraining, null);
for (const c of combos) insCombos.run(c.typeId, c.genreId, c.grade);
for (const c of consoles) insConsoles.run(c.id, c.name, c.devCost, c.licenseCost, c.company, c.unlockY, c.unlockM, c.unlockW, c.unlockText, c.removedY, c.removedM, c.removedW, c.installBase, c.costMult);
for (const s of staff) insStaff.run(s.id, s.name, s.gender, s.salary, s.hireFee, s.maxPower, s.stats[0], s.stats[1], s.stats[2], s.stats[3], s.careers.coder, s.careers.writer, s.careers.designer, s.careers.sound, s.careers.director, s.careers.producer, s.careers.hw, s.careers.hacker, s.activeCareer, s.unlock);
for (const p of personas) insPersonas.run(p.staffId, p.persona);
for (const m of messages) insMessages.run(m.points, m.message);
for (const c of contracts) insContracts.run(c.name, CONTRACTS_RU[c.id] ?? null, c.nameEn, c.rewardMin, c.rewardMax, c.prMin, c.prMax, c.weeks, c.reqP, c.reqS, c.reqG, c.reqSo, c.office);
for (const t of trainings) insTrainings.run(t.name, TRAIN_RU[t.name] ?? null, t.nameEn, t.costWan, t.power, t.program, t.scenario, t.graphics, t.sound, t.office);
for (const a of ads) insAds.run(a.name, ADS_RU[a.name] ?? null, a.nameEn, a.costWan, a.office);
for (const h of hireMethods) insHire.run(h.name, h.nameEn, h.costWan, h.office);
insOffices.run(1, 4, 0, 'старт');
insOffices.run(2, 6, 600, 'год 4+, после ≥1 игры, деньги ≥ ~1000K');
insOffices.run(3, 8, 2500, 'Y4–Y6: 3500K + награда; Y7–Y9: любое; Y10+: свободно');
for (const b of boosters) insBoosters.run(b.office, b.purchaseNo, b.price);
for (const [name, nameEn, prices] of [
  ['Dead Bull', 'replenishable', [50, 200, 550]],
  ['Career Change Manual', 'replenishable', [50, 200, 550]],
] as const) {
  prices.forEach((price, i) => insConsumables.run(name, nameEn, i + 1, price));
}
db.exec('COMMIT');

console.log(`OK: genres=${genres.length} types=${types.length} combos=${combos.length} consoles=${consoles.length} staff=${staff.length} messages=${messages.length} contracts=${contracts.length} trainings=${trainings.length} ads=${ads.length} hireMethods=${hireMethods.length} boosters=${boosters.length}`);

db.exec(`PRAGMA user_version = 1;`);
db.close();

// аудит-51 04-P2-3: контроль полноты перед подменой рабочей БД (иначе — понятная ошибка и старая БД цела)
const check = new DatabaseSync(TMP_DB, { readOnly: true });
const tables = (check.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
).all() as { name: string }[]).map((r) => r.name);
const expectedTables = ['ads', 'combos', 'consoles', 'contracts', 'genres', 'hire_methods', 'item_boosters', 'item_consumables', 'offices', 'personalities', 'review_messages', 'staff', 'trainings', 'types'];
const missing = expectedTables.filter((t) => !tables.includes(t));
const vv = (check.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
const typeCount = (check.prepare('SELECT COUNT(*) AS n FROM types').get() as { n: number }).n;
check.close();
if (missing.length) throw new Error(`сборка неполна — нет таблиц: ${missing.join(', ')} (рабочая БД не тронута)`);
if (vv !== 1) throw new Error(`user_version=${vv}, ожидается 1 (рабочая БД не тронута)`);
if (typeCount < 79) throw new Error(`types=${typeCount} < 79 (рабочая БД не тронута)`);
renameSync(TMP_DB, DB_PATH);
console.log(`DB: ${DB_PATH}`);
