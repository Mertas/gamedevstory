// Все балансные константы — здесь (09_Формулы_и_данные.md, пометки [Н] = наша модель).
// Калибровка: test/balance.test.ts (M6).
import type { GamedexOption } from './types';

export type Mode = 'normal' | 'speed' | 'quality' | 'research' | 'budget';
export type HireMethodId = 'word-of-mouth' | 'magazine' | 'online' | 'vocational' | 'open-house' | 'hollywood';

export const CONFIG = {
  // старт
  START_MONEY: 404, // K (чемпион лаборатории v8)
  START_RESEARCH: 10,
  START_FANS: 0,
  START_DIRECTION_POINTS: 10,
  FIRST_YEAR_FREE: true,
  EMERGENCY_FUND: 165, // K, одноразовый (чемпион лаборатории v8)
  OFFICE_CAPACITY: { 1: 4, 2: 6, 3: 8 },

  // время (ДНИ; год = 365; игра начинается 1 апреля 1985)
  // 1 игровой день = 1 реальная секунда на скорости 1× (TICK_MS)
  PAYDAY_DAY: 352, // зарплаты (чемпион лаборатории v8; день считается по модулю года)
  // PLAN-32: праздники РФ (день года, 1 = 1 апреля). Неделя, задевшая праздник, продаёт ×1.5–2.
  // аудит-51 01-P2-1: дни сверены с dateToDay (shared/consoles.ts) — было смещение −1:
  // 1 мая = 31, 9 мая = 39, 12 июня = 73, 4 ноября = 218, 23 февраля = 329, 8 марта = 342
  HOLIDAY_DOY: [31, 39, 73, 218, 329, 342] as number[],
  HOLIDAY_RANGES: [[276, 283]] as [number, number][], // Новый год и Рождество: 1–8 января
  HOLIDAY_MULT_MIN: 1.5,
  HOLIDAY_MULT_MAX: 2.0,
  WEEK_WOBBLE: 0.15, // PLAN-32: остальные недели гуляют ±15% (детерминированно по релизу)
  AWARDS_DAY: 62, // 1 июня — церемония наград
  YEAR_LENGTH: 365,
  TICK_MS: 1000, // мс на игровой день при 1×

  // PLAN-49: сага «Синяя Комета» — выключатель сборки (Э1–Э2) и тир-числа эффектов.
  // Точные значения — этап чисел (Э3, plan/49_Сага_в_игре.md); здесь — черновые из стенда.
  SAGA_ENABLED: true,
  SAGA: {
    /** порог «фанатов достаточно» для условий fansMin (стенд: thr.fansMin) */
    FANS_MIN: 5000,
    /** деньги: ±тиры 1..3, K */
    MONEY: { plus: [50, 150, 400], minus: [40, 120, 300] },
    /** фанаты: ±тиры 1..3 */
    FANS: { plus: [1000, 5000, 20000], minus: [1000, 5000, 20000] },
    /** пейсер: пауза перед следующей главой, дней (решение PLAN-49: 180–230; калибровка — Э3) */
    HOLD_MIN: 180,
    HOLD_SPAN: 51,
    /** Э3: цели интерлюдий (i1–i5) — к какому году саги приводит следующий акт.
     *  Канон (00_Канон.md): акты ≈ годы 0 / +6 / +12 / +17 / +22 / +26 от старта саги.
     *  Пауза интерлюдии = цель − текущий день − пауза следующей главы (минимум 180):
     *  держит акты на канонных годах при любом темпе прохождения. */
    HOLD_INT_ACTS: {
      i1: { at: 6, next: 'S4' },
      i2: { at: 12, next: 'S8' },
      i3: { at: 17, next: 'S13' },
      i4: { at: 22, next: 'S18' },
      i5: { at: 26, next: 'S22' },
    } as Record<string, { at: number; next: string }>,
    /** эпилог (правила 1–7, plan/47_Сага/06_Акт_VI_НАСЛЕДИЕ.md): пороги секрета «Двойной финал».
     *  У Виталика в контенте только −1 (плюсов нет): порог = «не терял ещё раз». Калибровка — Э3. */
    EPILOG: {
      SECRET_CONSCIENCE: 4,
      // P1 аудита-51: в саге у Жанны максимум +1 доверия (оба +1 — взаимоисключающие ветки одного узла S11),
      // порог 2 делал секретный эпилог E6 недостижимым ни в одной органической партии
      SECRET_TRUST: { 'Вера': 2, 'Мороз': 2, 'Каспер': 2, 'Глеб': 2, 'Жанна': 1, 'Виталик': -1 } as Record<string, number>,
    },
  },

  // продавец Тыквенных Продуктов: 1–31 мая (дни 31–61 от 1 апреля)
  SALESMAN_DAY: 31,
  SALESMAN_DAY_END: 61,

  // разработка
  DEV_STAT_FACTOR: 0.5, // очки/нед = стат × фактор
  DEV_COST_SCALE: 2.44, // масштаб стоимости (чемпион лаборатории, M6): разработка ~100 дней (1 день = 1 сек на 1×)
  DIRECTION_BONUS: 0.3, // доля очков, распределяемая осями направления
  DIRECTION_NORM: 10, // норма эффекта осей (09 §2.3): 10 очков = полный бонус, больше распределил — сильнее
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
    // качественный (перебаланс 10.10.2026, решение юзера): очки проекта = speed × time = +32% —
    // плата: +30% цены и +15% времени; бонус: меньше багов. Раньше давал −2% очков (обман текстов).
    quality: { cost: 1.3, speed: 1.15, bugs: 0.7, time: 1.15 },
    research: { cost: 1.5, speed: 0.9, bugs: 1, time: 1.1 },
    budget: { cost: 2, speed: 1.25, bugs: 0.85, time: 1.3 },
  },

  // базовая длительность разработки в днях (1 день = 1 сек на 1×)
  DEV_DAYS: 96,

  // баги
  BUGS_PER_COST: 0.02197, // ≈1/45.5 — чемпион лаборатории (M6): баги за очко работы (≈ K стоимости при типичной выработке); имя не меняем — на него завязана лаборатория (аудит-51 01-P2-12)
  DEBUG_RATE: 0.0317, // багов/день = Σ Program × это (чемпион лаборатории v8)
  DEBUG_PR_MIN: 1,
  DEBUG_PR_MAX: 3,
  BUGS_F_COMBO: 10,
  BOOST_FAIL_BUGS: [20, 30] as const,

  // события разработки (шансы — в ДЕНЬ; были в неделю, ÷7)
  BOOST_CHANCE: 0.651,
  BOOST_SUCCESS_BASE: 0.5,
  BOOST_RATE_PER_PR: 0.025, // шанс успеха растёт на это за каждый PR сверх предложения
  BOOST_SUCCESS_STAT_DIV: 400,
  BOOST_SUCCESS_CAP: 0.8,
  // 28.09: доля суммы характеристик автора идеи — удачный буст масштабируется с прокачкой (запрос босса)
  BOOST_GAIN_PCT: [0.10, 0.15] as const,
  BOOST_HYPE_GAIN: 10, // хайп за успешный буст — влияет на продажи при релизе (hypeMult)
  BLACKOUT_CHANCE: 0.00539, // чемпион лаборатории (v8)
  BLACKOUT_LOSS: 0.3, // −30% всех очков
  BREAKDOWN_CHANCE: 0.00106, // чемпион лаборатории (v8)
  BREAKDOWN_LOSS: [10, 20] as const,

  // рецензии
  REVIEW_BASE: 3,
  REVIEW_DIV: 892, // PLAN-30: подобрано под «по 2000 в каждом направлении = сотка» (10 критиков)
  REVIEW_NOISE: 1,
  HALL_OF_FAME: 80, // PLAN-30: шкала теперь сразу /100 (10 критиков), зал славы — 80
  GRAND_PRIZE_SCORE: 90, // PLAN-30: /100; Гран-при — с 90

  // продажи (в ДЕНЬ; были в неделю, ÷7)
  SALES_BASE_RATE: 0.04539, // доля базы консоли за жизнь игры (чемпион лаборатории, M6)
  SALES_DAYS: 168, // 24 недели
  // PLAN-30: форма продаж задана формулой (обратный easeInOutQuart) в formulas.ts — таблицы больше нет
  PRICE_BASE: 23.46, // $ за копию при costMult=1 (чемпион лаборатории, M6)
  PRICE_MULT_SOFT: 0.15, // смягчение ценового множителя: 1 + (mult−1)×это
  COMBO_MULT: { S: 1.5, A: 1.3, B: 1.1, C: 1.0, D: 0.8, F: 0.5 },
  POP_MULT: { A: 1.2, B: 1.0, C: 0.85 } as Record<string, number>,
  FAN_MULT_DIV: 2225, // чемпион лаборатории (M6); аудит 05.09: было 100 → кап ~10K фанатов делал верхние AD_FAN_CAPS (до 150K) мёртвыми
  FAN_MULT_CAP: 3.0,
  HYPE_MULT_BASE: 0.8,
  HYPE_MULT_CAP: 1.8,
  SEQUEL_MULT: 1.2,
  FAN_PER_UNIT: 5.63, // фанатов за 1K проданных копий (чемпион лаборатории v8)
  FAN_DECAY: 0.9993, // ежедневно (было 0.995 в неделю)
  CONSOLE_BASE_GROWTH: 93, // тыс. за релиз под консоль

  // награды
  PRIZE_DESIGN: 100,
  PRIZE_MUSIC: 100,
  PRIZE_RUNNER_UP: 500,
  PRIZE_GRAND: 1000,
  PRIZE_WORST: 300, // аудит-51 01-P2-3: антипремия «Худшая игра года» — списывается (plan/03:58, plan/05:44)
  WORST_BUGS_MIN: 50, // порог багов на релизе для антипремии (документ: 50–60 багов)

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
  RESEARCH_DEV_RATE: 0.0447, // PR/день = очки_дня × это (0.5×очки_недели×0.1 из plan/09 §10; аудит 05.09: было 0.0072 — двойное ÷7)
  RESEARCH_MODE_MULT: 1.5,
  // 01.10: цена предложения масштабируется от автора идеи — ~10% суммы его характеристик (запрос босса)
  BOOST_COST_STAT_PCT: 0.1,
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
  // смена профессии: пререквизиты (уровни на ТОМ ЖЕ сотруднике). Смена — ТОЛЬКО по руководству
  // (продавец, май) и только когда требования выполнены; руководство требования НЕ снимает.
  // База (coder/writer/designer/sound) — без требований. Хакер — высшая ступень: всё остальное по 5.
  CAREER_PREREQ: {
    director: { writer: 5, coder: 5 },
    producer: { writer: 5, designer: 5 },
    hw: { director: 5, producer: 5 },
    hacker: { coder: 5, writer: 5, designer: 5, sound: 5, director: 5, producer: 5, hw: 5 },
  } as Record<string, Record<string, number>>,

  // ─── M3: продавец (research/02 §11) ───
  BOOSTER_KEY_GAIN: [18, 22], // ключевая профессия, 1-е использование
  BOOSTER_KEY_GAIN_2: [8, 11],
  BOOSTER_OTHER_GAIN: [8, 11],
  BOOSTER_OTHER_GAIN_2: [1, 5],
  BOOSTER_TYPES: ['fun', 'creativity', 'graphics', 'sound'] as const,
  DEAD_BULL_PRICE: [50, 200, 550], // по офисам (K)
  DEAD_BULL_RESEARCH: 10,
  CAREER_MANUAL_PRICE: [50, 200, 550],

  // ─── PLAN-41: пороги статов сотрудника ───
  // У каждого сотрудника свои пороги (caps) на 4 стата. Пороги растут при левелапе
  // и смене профессии; если стат ЗАЛИТ до текущего порога — рост этого порога ×CAP_MAX_BONUS
  // («намного эффективней»). Полный проход (все 8 профессий, Lv5, с заливом до порогов
  // каждого уровня) даёт максимальный стат ≈ 10 000 — калибровка: test/staff-caps.test.ts.
  CAP_INIT_MULT: 2, // стартовый порог = стат × 2
  CAP_INIT_FLAT: 10, // ...или стат + 10 (что больше)
  CAP_MAX_BONUS: 10, // «залит по максимуму» → прирост порога ×10
  // прирост порогов за левелап (база, ×CAP_MAX_BONUS если стат залит) — по профессиям
  CAP_GROW: {
    coder: { program: 40, scenario: 15, graphics: 20, sound: 15 },
    writer: { program: 15, scenario: 40, graphics: 15, sound: 15 },
    designer: { program: 15, scenario: 15, graphics: 40, sound: 15 },
    sound: { program: 15, scenario: 15, graphics: 15, sound: 40 },
    director: { program: 30, scenario: 30, graphics: 15, sound: 15 },
    producer: { program: 15, scenario: 30, graphics: 30, sound: 30 },
    hw: { program: 35, scenario: 25, graphics: 10, sound: 10 },
    hacker: { program: 25, scenario: 25, graphics: 25, sound: 25 },
  } as Record<string, Record<string, number>>,
  CAP_CHANGE_MULT: 1.5, // смена профессии: прирост порогов = веса профессии × 1.5 (×10 если залит)
  // смена профессии двигает САМИ статы: куда переходишь — то и растёт, обратное слабеет
  CAREER_STAT_SHIFT: {
    coder: { program: 1.15, scenario: 0.9, graphics: 0.95, sound: 0.95 },
    writer: { program: 0.9, scenario: 1.15, graphics: 0.95, sound: 0.95 },
    designer: { program: 0.95, scenario: 0.9, graphics: 1.15, sound: 0.95 },
    sound: { program: 0.95, scenario: 0.9, graphics: 0.95, sound: 1.15 },
    director: { program: 1.1, scenario: 1.1, graphics: 0.95, sound: 0.95 },
    producer: { program: 0.9, scenario: 1.1, graphics: 1.1, sound: 1.1 },
    hw: { program: 1.1, scenario: 1.1, graphics: 0.9, sound: 0.9 },
    hacker: { program: 1.1, scenario: 1.1, graphics: 1.1, sound: 1.1 },
  } as Record<string, Record<string, number>>,
  TRAIN_SCALE_DIV: 100, // прирост тренировки ×floor(порог/100) (мин ×1) — и плюсы, и минусы
  REST_DAYS: 7, // отпуск: 7 дней → POWER до максимума (не вносит вклад, недоступен для обучения)

  // ─── M4: реклама (research/02 §12; потолки — plan/09) ───
  // Фанаты растут с убыванием: у каждого типа свой потолок (ключ = id в БД ads),
  // прирост за кампанию = (кап − накоплено типом) × AD_FAN_GROWTH + AD_FAN_MIN.
  // Капы: 1 журнал 2K · 2 интернет 3K · 3 радио 4K · 4 демо 6K · 5 оркестр 8K ·
  // 6 ТВ 15K · 7 куклы 12K · 8 спонсор ТВ 20K · 9 караван 30K · 10 турнир 60K ·
  // 11 дирижабль 90K · 12 Луна 150K.
  AD_FAN_CAPS: { 1: 2000, 2: 3000, 3: 4000, 4: 6000, 5: 8000, 6: 15000, 7: 12000, 8: 20000, 9: 30000, 10: 60000, 11: 90000, 12: 150000 } as Record<number, number>,
  AD_FAN_GROWTH: 0.15,
  AD_FAN_MIN: 50,
  AD_FAME_GAIN: 5, // известность текущей разработки за кампанию (research: реклама ↑ fame)

  // ─── M4: контракты (research/03 §8) ───
  CONTRACT_WEEKLY_RATE: 0.05 / 7, // прогресс/день = Σ стат × это (было 0.05 в неделю)
  CONTRACT_MAX_STAFF: 3,
  /** M9: повтор контракта — не раньше, чем через столько недель после сдачи/провала */
  CONTRACT_COOLDOWN_WEEKS: 12,

  // ─── M4: своя консоль (research/01 §8) ───
  OWN_CONSOLE_WEEKS_BASE: 12,
  OWN_CONSOLE_WEEKS_PER_INDEX: 3,

  // ─── M5: медиа-события после релиза (plan/09 §2.4) ───
  MEDIA_CHANCE: 0.022612, // шанс в ДЕНЬ на игру в окне (чемпион лаборатории v8; было 0.12/7)
  MEDIA_WINDOW_DAYS: 56, // первые 8 недель продаж
  MEDIA_ARTICLE_MULT: 1.08, // «Статья в журнале»: +8% продаж
  MEDIA_TV_MULT: 1.15, // «TV-сюжет»: +15%
  MEDIA_BUG_MULT: 0.9, // «Найден баг»: −10% (только если баги на релизе > 0)

  // ─── M5: событийные консоли (анлоки Гран-при; unlock_text в БД [О]) ───
  GRAND_CONSOLE_JUPITER: 2, // Jupiter 512 — после 2-го Гран-при
  GRAND_CONSOLE_GAMEJOHN: 5, // GameJohn — 5 Гран-при + 20M копий одной игры
  GAMEJOHN_UNITS_K: 20000, // 20M копий (units в K)

  // ─── M5: письма фанатов (research: love/hate-письма; [Н]-модель) ───
  LETTER_CHANCE: 0.07, // шанс письма в день на игру в окне после релиза (~1–2 письма/игра)
  LETTER_WINDOW_DAYS: 21, // окно: 3 недели после релиза
  LETTER_LOVE_MIN: 40, // +фанатов за восторженное письмо (оценка ≥ 25)
  LETTER_LOVE_MAX: 80,
  LETTER_HATE_MIN: 20, // −фанатов за гневное (оценка ≤ 19)
  LETTER_HATE_MAX: 60,
  LETTER_CAP: 50, // храним последние N писем

  // ─── M5: Gamedex (plan/05 §6, research/02 §12; июль, офис 2+) ───
  // Стенды добавляют ИЗВЕСТНОСТЬ (fame к следующему проекту) + немного фанатов;
  // повтор той же опции подряд «приедается» (×0.5). Цены в K.
  GAMEDEX_DAY: 92, // 1 июля (день года от 1 апреля)
  GAMEDEX_DAY_END: 99, // 8 июля — выставка уезжает (авто-пропуск; подстрахован серверным таймером, 03-P2-3)
  PROJECT_FAME_BASE: 10, // стартовая известность проекта (была литералом 10)
  GAMEDEX_OPTIONS: {
    none: { cost: 0, fame: 0, fans: 0, label: 'Не участвовать' },
    booth: { cost: 150, fame: 10, fans: 100, label: 'Обычный стенд' },
    costumes: { cost: 600, fame: 25, fans: 300, label: 'Талисманы и костюмы' },
    girls: { cost: 2500, fame: 50, fans: 800, label: 'Промо-команда', newsChance: 0.3, newsFans: 500 },
    star: { cost: 7000, fame: 100, fans: 2000, label: 'Звезда-гость' },
  } as Record<GamedexOption, { cost: number; fame: number; fans: number; label: string; newsChance?: number; newsFans?: number }>,
  GAMEDEX_REPEAT_MULT: 0.5, // повтор той же опции подряд — публика помнит
  // аудит-51 03-P2-3: незатронутый попап выставки «уезжает» сам — выставку можно переждать
  GAMEDEX_AUTO_SKIP_MS: 120_000,

  // ─── PLAN-52 M1: франшизы и мерч (медиа-империя, этап 1) ───
  /** планка франшизы: игра с этой оценкой рождает франшизу (повтор комбо — сиквел к ней) */
  FRANCHISE_MIN_SCORE: 80,
  /** сила бренда: рост за очко успеха сиквела (score − планка) */
  FRANCHISE_BRAND_GAIN: 0.5,
  /** сила бренда: падение за очко провала сиквела (планка − score) */
  FRANCHISE_BRAND_LOSS: 1.0,
  /** забвение: −1 к бренду за каждые 52 недели без релиза франшизы */
  FRANCHISE_IDLE_DECAY: 1,
  /** мерч: минимальная сила бренда для запуска линии фигурок */
  MERCH_MIN_BRAND: 60,
  /** мерч: разовые вложения на старт линии фигурок (K) */
  MERCH_START_COST: 300,
  /** мерч: содержание линии (K в день; в UI показывается как /нед) */
  MERCH_UPKEEP_PER_DAY: 20 / 7,
  /** мерч: доход за неделю = фанаты / MERCH_FANS_DIV × бренд / MERCH_BRAND_DIV (K) */
  MERCH_FANS_DIV: 1000,
  MERCH_BRAND_DIV: 50,
  /** мерч: движение бренда при запуске/остановке линии */
  MERCH_BRAND_ON_START: 1,
  MERCH_BRAND_ON_STOP: -2,
};
