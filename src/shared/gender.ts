// Род персонажей и родовые пары текста (11.10.2026).
// Пол: сотрудники — staff.gender из данных (26 М / 20 Ж); главный герой — по аватарке
// (hero.ts avatarGender: нечётные player-NN — парни, чётные — девушки); партнёр — сотрудник
// пула (свой пол). Синтаксис пары: {мужская форма/женская форма}, явная привязка — @ключ:
// {вырос/выросла@name2}, {пошёл/пошла@Скептик}. Ключи — как у плейсхолдеров ({name}, {name2})
// и ролей саги ({Скептик}…{Герой}, {Партнёр}). Потребители: storylines/App (арки), движок
// (логи story/staff), чат (промпт), стенд quest-test (app.js — та же грамматика).
export type Gender = 'M' | 'F';

/** Одна форма по полу: gform('пошёл/пошла', gender). Первая — мужская, вторая — женская;
 *  без слэша или без рода — мужская (поведение легаси-данных). */
export function gform(pair: string, gender?: Gender | null): string {
  const i = pair.indexOf('/');
  if (i < 0) return pair;
  const male = pair.slice(0, i);
  const female = pair.slice(i + 1);
  return gender === 'F' ? female || male : male;
}

/** Пары форм в тексте: {а/б} или {а/б@ключ}. Формы — с пробелами, без «{», «}», «@», «/». */
const PAIR_RE = /\{([^{}\/@]+)\/([^{}@]+?)(?:@([\wА-Яа-яЁё-]+))?\}/g;

/** Раскрыть родовые пары по карте родов: @ключ → genders[ключ]; без ключа → fallback;
 *  род неизвестен — пара остаётся как есть (видно при вычитке; в игре передаём fallback). */
export function applyGenderSlots(
  text: string,
  genders: Record<string, Gender | undefined>,
  fallback?: Gender | null,
): string {
  return text.replace(PAIR_RE, (whole: string, male: string, female: string, key?: string) => {
    const g = key ? genders[key] : fallback;
    if (g === 'F') return female;
    if (g === 'M') return male;
    return whole;
  });
}
