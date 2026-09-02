// Все балансные константы — здесь (09_Формулы_и_данные.md, пометки [Н] = наша модель).
// Калибровка: test/balance.test.ts (M6).

export type Mode = 'normal' | 'speed' | 'quality' | 'research' | 'budget';
export type HireMethodId = 'word-of-mouth' | 'magazine' | 'online' | 'vocational' | 'open-house' | 'hollywood';

export const CONFIG = {
  // старт
  START_MONEY: 500, // K
  START_RESEARCH: 10,
  START_FANS: 0,
  START_DIRECTION_POINTS: 10,
  FIRST_YEAR_FREE: true,
  EMERGENCY_FUND: 150, // K, одноразовый
  OFFICE_CAPACITY: { 1: 4, 2: 6, 3: 8 },

  // время (ДНИ; год = 365; игра начинается 1 апреля 1985)
  // 1 игровой день = 1 реальная секунда на скорости 1× (TICK_MS)
  PAYDAY_DAY: 365, // 31 марта — зарплаты (в конце игрового года)
  WINTER_SPIKE_DAY: 245, // 1 декабря (пик продаж 7 дней)
  AWARDS_DAY: 62, // 1 июня — церемония наград
  YEAR_LENGTH: 365,
  TICK_MS: 1000, // мс на игровой день при 1×

  // продавец Тыквенных Продуктов: 1–31 мая (дни 31–61 от 1 апреля)
  SALESMAN_DAY: 31,
  SALESMAN_DAY_END: 61,

  // разработка
  DEV_STAT_FACTOR: 0.5, // очки/нед = стат × фактор
  DEV_COST_SCALE: 2.5, // масштаб стоимости: разработка ~100 дней (1 день = 1 сек на 1×)
  DIRECTION_BONUS: 0.3, // доля очков, распределяемая осями направления
  TYPE_COST_DEFAULT: 30, // K — M1: единая стоимость типа (TODO: точные из research/03 §4)
  GENRE_LV_COST_MULT: (lv: number) => 1 + 0.5 * lv,
  TYPE_LV_COST_MULT: (lv: number) => 1 + 0.3 * lv,
  GENRE_LV_QUALITY: (lv: number) => 1 + 0.05 * lv, // бонус к очкам за уровень жанра
  PROPOSAL_SCENARIO_FUN: 0.5,
  PROPOSAL_SCENARIO_CREATIVITY: 0.3,
  DIRECTION_POINTS_GENRE_LV: [2, 5] as const, // +2 очка направления на этих уровнях жанра

  // режимы (стоимость / скорость-множитель / баги-множитель / время разработки)
  // время: 100 дней × time — НЕ зависит от размера команды (команда влияет на качество, как в оригинале)
  MODE: {
    normal: { cost: 1, speed: 1, bugs: 1, time: 1 },
    speed: { cost: 1.2, speed: 1.15, bugs: 1.5, time: 0.85 },
    quality: { cost: 1.3, speed: 0.85, bugs: 0.7, time: 1.15 },
    research: { cost: 1.5, speed: 0.9, bugs: 1, time: 1.1 },
    budget: { cost: 2, speed: 1.25, bugs: 0.85, time: 1.3 },
  },

  // базовая длительность разработки в днях (1 день = 1 сек на 1×)
  DEV_DAYS: 100,

  // баги
  BUGS_PER_COST: 1 / 50, // баги = стоимость(K) × это / множитель режима
  DEBUG_RATE: 0.03, // багов/день = Σ Program × это (было 0.2 в неделю, ÷7)
  DEBUG_PR_MIN: 1,
  DEBUG_PR_MAX: 3,
  BUGS_F_COMBO: 10,
  BOOST_FAIL_BUGS: [20, 30] as const,
  WORST_GAME_BUGS: 50, // 50–60 багов на релизе → антипремия

  // события разработки (шансы — в ДЕНЬ; были в неделю, ÷7)
  BOOST_CHANCE: 0.6,
  BOOST_SUCCESS_BASE: 0.5,
  BOOST_RATE_PER_PR: 0.025, // шанс успеха растёт на это за каждый PR сверх предложения
  BOOST_SUCCESS_STAT_DIV: 400,
  BOOST_SUCCESS_CAP: 0.8,
  BOOST_GAIN: [25, 50] as const,
  BLACKOUT_CHANCE: 0.003, // 0.04/7/2 — вдвое реже (просьба)
  BLACKOUT_LOSS: 0.3, // −30% всех очков
  BREAKDOWN_CHANCE: 0.00215, // 0.03/7/2 — вдвое реже (просьба)
  BREAKDOWN_LOSS: [10, 20] as const,

  // рецензии
  REVIEW_BASE: 3,
  REVIEW_DIV: 88,
  REVIEW_NOISE: 1,
  HALL_OF_FAME: 32,
  GRAND_PRIZE_SCORE: 36,
  JUDGE_WEIGHTS: [
    { fun: 1.0, creativity: 0.6, graphics: 0.7, sound: 0.5 },
    { fun: 0.8, creativity: 1.0, graphics: 0.8, sound: 0.6 },
    { fun: 1.2, creativity: 0.5, graphics: 0.9, sound: 0.9 },
    { fun: 0.6, creativity: 0.6, graphics: 1.2, sound: 1.2 },
  ] as const,

  // продажи (в ДЕНЬ; были в неделю, ÷7)
  SALES_BASE_RATE: 0.04, // доля базы консоли за жизнь игры (было 0.02; поднято под DEV_COST_SCALE)
  SALES_DAYS: 168, // 24 недели
  SALES_CURVE: [
    0.15, 0.12, 0.1, 0.08, 0.07, 0.06, 0.055, 0.05, 0.045, 0.04, 0.035, 0.03,
    0.027, 0.024, 0.021, 0.019, 0.017, 0.015, 0.013, 0.011, 0.009, 0.008, 0.007, 0.006,
  ] as number[],
  PRICE_BASE: 20, // $ за копию при costMult=1
  PRICE_MULT_SOFT: 0.15, // смягчение ценового множителя: 1 + (mult−1)×это
  COMBO_MULT: { S: 1.5, A: 1.3, B: 1.1, C: 1.0, D: 0.8, F: 0.5 },
  POP_MULT: { A: 1.2, B: 1.0, C: 0.85 } as Record<string, number>,
  FAN_MULT_DIV: 100,
  FAN_MULT_CAP: 3.0,
  HYPE_MULT_BASE: 0.8,
  HYPE_MULT_CAP: 1.8,
  SEQUEL_MULT: 1.2,
  FAN_PER_UNIT: 5, // фанатов за 1K проданных копий (0.5% от копий)
  FAN_DECAY: 0.9993, // ежедневно (было 0.995 в неделю)
  CONSOLE_BASE_GROWTH: 100, // тыс. за релиз под консоль

  // награды
  PRIZE_DESIGN: 100,
  PRIZE_MUSIC: 100,
  PRIZE_RUNNER_UP: 500,
  PRIZE_GRAND: 1000,
  PRIZE_WORST: -300,

  // найм
  HIRE_METHODS: {
    'word-of-mouth': { cost: 50, office: 1, pool: ['Initially available', 'Word of Mouth'] },
    magazine: { cost: 120, office: 1, pool: ['Word of Mouth'] },
    online: { cost: 550, office: 1, pool: ['Word of Mouth'] },
    vocational: { cost: 800, office: 2, pool: ['Vocational School'] },
    'open-house': { cost: 1800, office: 2, pool: ['Open House & Office 3'] },
    hollywood: { cost: 3500, office: 3, pool: ['Open House & Office 3'] },
  },
  HIRE_CANDIDATES: 3,

  // логи
  LOG_CAP: 500,

  // исследования
  RESEARCH_DEV_RATE: 0.0072, // PR/день = очки_дня × это (было 0.05 в неделю)
  RESEARCH_MODE_MULT: 1.5,
  BOOST_COST_DIV: 10,
  BOOST_COST_MIN: 10,

  // ─── M3: прокачка (research/02 §10.3, §10.4) ───
  // PR-цены повышений Lv2→5 по профессиям
  LEVEL_PR: {
    coder: [15, 25, 40, 55],
    writer: [15, 20, 30, 50],
    designer: [15, 25, 28, 45],
    sound: [15, 25, 35, 50],
    director: [30, 40, 60, 88],
    producer: [35, 50, 77, 108],
    hw: [40, 60, 90, 135],
    hacker: [60, 90, 140, 190],
  } as Record<string, number[]>,
  // стат-прирост за уровень (итоги по research/02 §10.3, разложены на 4 уровня)
  LEVEL_STATS: {
    coder: [{ p: 10, s: 2, g: 2, so: 2 }, { p: 10, s: 2, g: 2, so: 2 }, { p: 10, s: 2, g: 2, so: 2 }, { p: 9, s: 1, g: 1, so: 1 }],
    writer: [{ p: 3, s: 11, g: 3, so: 4 }, { p: 3, s: 11, g: 3, so: 4 }, { p: 2, s: 10, g: 2, so: 3 }, { p: 2, s: 10, g: 2, so: 3 }],
    designer: [{ p: 2, s: 2, g: 9, so: 1 }, { p: 2, s: 2, g: 9, so: 1 }, { p: 2, s: 2, g: 9, so: 1 }, { p: 1, s: 2, g: 7, so: 1 }],
    sound: [{ p: 3, s: 1, g: 3, so: 9 }, { p: 3, s: 1, g: 3, so: 9 }, { p: 3, s: 1, g: 3, so: 9 }, { p: 2, s: 1, g: 1, so: 9 }],
    director: [{ p: 11, s: 12, g: 2, so: 2 }, { p: 11, s: 12, g: 2, so: 2 }, { p: 11, s: 12, g: 2, so: 2 }, { p: 9, s: 11, g: 0, so: 3 }],
    producer: [{ p: 11, s: 10, g: 12, so: 8 }, { p: 11, s: 10, g: 12, so: 8 }, { p: 11, s: 10, g: 12, so: 8 }, { p: 9, s: 10, g: 10, so: 8 }],
    hw: [{ p: 13, s: 13, g: 4, so: 5 }, { p: 13, s: 13, g: 4, so: 5 }, { p: 13, s: 13, g: 4, so: 5 }, { p: 14, s: 12, g: 5, so: 4 }],
    hacker: [{ p: 20, s: 20, g: 20, so: 20 }, { p: 20, s: 20, g: 20, so: 20 }, { p: 20, s: 20, g: 20, so: 20 }, { p: 20, s: 20, g: 20, so: 20 }],
  } as Record<string, Array<{ p: number; s: number; g: number; so: number }>>,
  // смена профессии: пререквизиты (уровни на ТОМ ЖЕ сотруднике)
  CAREER_PREREQ: {
    director: { writer: 5, coder: 5 },
    producer: { designer: 5, sound: 5 },
    hw: { director: 5, producer: 5 },
    hacker: { hw: 5 },
  } as Record<string, Record<string, number>>,

  // ─── M3: продавец (research/02 §11) ───
  SALESMAN_WEEK: 18, // первая неделя мая (M5W2), с года 2
  BOOSTER_KEY_GAIN: [18, 22], // ключевая профессия, 1-е использование
  BOOSTER_KEY_GAIN_2: [8, 11],
  BOOSTER_OTHER_GAIN: [8, 11],
  BOOSTER_OTHER_GAIN_2: [1, 5],
  BOOSTER_TYPES: ['fun', 'creativity', 'graphics', 'sound'] as const,
  DEAD_BULL_PRICE: [50, 200, 550], // по офисам (K)
  DEAD_BULL_RESEARCH: 10,
  CAREER_MANUAL_PRICE: [50, 200, 550],

  // ─── M4: реклама (research/02 §12) ───
  AD_FAN_RATE: 0.1, // фанаты = costK × это
  AD_HYPE: 5,

  // ─── M4: контракты (research/03 §8) ───
  CONTRACT_WEEKLY_RATE: 0.05 / 7, // прогресс/день = Σ стат × это (было 0.05 в неделю)
  CONTRACT_MAX_STAFF: 3,

  // ─── M4: своя консоль (research/01 §8) ───
  OWN_CONSOLE_WEEKS_BASE: 12,
  OWN_CONSOLE_WEEKS_PER_INDEX: 3,
  OWN_CONSOLE_BASE_GROWTH: 100, // K базы за релиз (общее правило для всех консолей)
};
