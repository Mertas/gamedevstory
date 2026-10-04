// PLAN-48: главный герой (игрок) и партнёр — общие константы и чистые хелперы.
// Единственный источник для клиента (форма новой игры, окна) и сервера (валидация API, движок).
import type { CareerId } from '../core/data/schema';
import { STAT_KEYS, type StatCaps } from './train';

/** Бюджет очков главного героя (сумма по 4 статам). */
export const HERO_POINTS = 40;
/** Верхний предел одного стата героя. */
export const HERO_STAT_CAP = 30;
/** Оклад героя — стандартный нижний оклад пула (K/год); 1-й год бесплатно, как у всех. */
export const HERO_SALARY = 20;
/** Максимальная доля партнёра (%), которую можно отдать на старте. */
export const PARTNER_MAX_PCT = 20;

/** Стартовые профессии героя — только четыре (без Режиссёра/Продюсера/Инженера/Хакера). */
export const HERO_CAREERS: CareerId[] = ['coder', 'writer', 'designer', 'sound'];

/** Аватарки игрока в LLMPics (проект gds-player-avatars): папки player-01..player-20. */
export const PLAYER_AVATARS: string[] = Array.from({ length: 20 }, (_, i) => `player-${String(i + 1).padStart(2, '0')}`);

/** 10 характеров героя (кнопка «Следующий» листает по кругу); текст уходит в LLM-чат. */
export interface HeroCharacter {
  id: string;
  label: string;
  persona: string;
}

export const HERO_CHARACTERS: HeroCharacter[] = [
  { id: 'optimist', label: 'Оптимист', persona: 'Неисправимый оптимист: в любой проблеме видит возможность и заражает команду энергией.' },
  { id: 'skeptic', label: 'Скептик', persona: 'Скептик: сомневается в каждой идее, ищет слабые места и спорит, но всегда по делу.' },
  { id: 'perfectionist', label: 'Перфекционист', persona: 'Перфекционист: полирует детали до блеска, не терпит халтуры и полумер.' },
  { id: 'dreamer', label: 'Мечтатель', persona: 'Мечтатель: витает в облаках и предлагает смелые, порой странные — и гениальные — идеи.' },
  { id: 'joker', label: 'Шутник', persona: 'Шутник: разряжает обстановку и любую проблему превращает в шутку, но дело не страдает.' },
  { id: 'pragmatist', label: 'Прагматик', persona: 'Прагматик: считает деньги и сроки, режет лишнее и говорит по существу.' },
  { id: 'quiet', label: 'Тихий гений', persona: 'Тихий гений: говорит редко, делает много; его короткие фразы — на вес золота.' },
  { id: 'workaholic', label: 'Трудоголик', persona: 'Трудоголик: горит работой, берёт больше всех и не умеет отдыхать.' },
  { id: 'diplomat', label: 'Дипломат', persona: 'Дипломат: сглаживает конфликты, мирит спорщиков и говорит мягко и взвешенно.' },
  { id: 'rebel', label: 'Мятежник', persona: 'Мятежник: спорит с начальством и нарушает правила, но идеи у него смелые.' },
];

/** Идеи имён героя для кнопки 🎲 (локально, без LLM) — «Имя Фамилия» в стиле игры. */
export const HERO_NAME_IDEAS: string[] = [
  'Артём Пикселев', 'Макс Движков', 'Иван Квестов', 'Фёдор Рендеров', 'Герман Кодеров',
  'Стас Полигонов', 'Пётр Сприйтов', 'Марк Хитбоксов', 'Гриша Моддеров', 'Олег Скриптов',
  'Илья Шейдеров', 'Миша Левелов', 'Тимур Респавнов', 'Ваня Багов', 'Костя Стримов',
  'Юра Фреймов', 'Слава Сейвов', 'Данил Скиллов', 'Сева Крафтов', 'Лёша Дропов',
  'Сеня Геймпадов', 'Вова Дедлайнов', 'Витя Триггеров', 'Антон Апдейтов', 'Паша Чекпоинтов',
  'Алиса Пикселева', 'Вера Движкова', 'Кира Квестова', 'Дина Рендерова', 'Соня Сприйтова',
  'Мила Хитбоксова', 'Ната Моддерова', 'Женя Скриптова', 'Тоня Шейдерова', 'Лена Левелова',
  'Полина Скиллова', 'Даша Багова', 'Настя Сейвова', 'Ксюша Стримова', 'Вика Фреймова',
  'Ульяна Респавнова', 'Рита Полигонова', 'Оля Геймерова', 'Зина Дропова', 'Катя Крафтова',
  'Маша Триггерова', 'Ася Апдейтова', 'Люба Чекпоинтова', 'Света Дебагова', 'Надя Дедлайнова',
];

/** Настройки героя на старте новой игры (клиент → API → движок). */
export interface HeroSetup {
  name: string;
  avatarId: string;
  stats: StatCaps;
  career: CareerId;
  persona: string;
}

/**
 * Санитайз статов героя: целые 0..HERO_STAT_CAP; если сумма больше бюджета —
 * срезаем по одному с самого большого стата (детерминированно, без «сюрпризов»).
 */
export function sanitizeHeroStats(raw: Partial<StatCaps>): StatCaps {
  const out: StatCaps = { program: 0, scenario: 0, graphics: 0, sound: 0 };
  for (const k of STAT_KEYS) {
    const n = Math.round(Number(raw[k] ?? 0));
    out[k] = Number.isFinite(n) ? Math.max(0, Math.min(HERO_STAT_CAP, n)) : 0;
  }
  let sum = STAT_KEYS.reduce((a, k) => a + out[k], 0);
  while (sum > HERO_POINTS) {
    let big: keyof StatCaps = STAT_KEYS[0]!;
    for (const k of STAT_KEYS) if (out[k] > out[big]) big = k;
    out[big] -= 1;
    sum -= 1;
  }
  return out;
}

/** Доля партнёра: целое 0..20 (битое значение → 0). */
export function clampPartnerPct(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(PARTNER_MAX_PCT, n));
}

/** Условия расставания с партнёром при доле pct и текущей кассе money (K). */
export function partnerTerms(pct: number, money: number): { buyout: number; rentPct: number } {
  const D = clampPartnerPct(pct);
  return { buyout: Math.round((money * D) / 100), rentPct: D / 4 };
}

/** Проценты без хвостовых нулей: 5 → «5», 2.5 → «2.5», 0.25 → «0.25». */
export function fmtPct(pct: number): string {
  return pct.toFixed(2).replace(/\.?0+$/, '');
}
