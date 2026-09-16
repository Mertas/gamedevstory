// Русские имена сотрудников для UI и логов (16.09). В данных (data/gamedev.db) имена
// остаются английскими (id — тоже); здесь карта id → русское имя для показа игроку.
// Стиль — принятая транслитерация: шуточные имена читаются и по-русски (Эс Прессо, Ди Кодер).
export const STAFF_NAME_RU: Record<string, string> = {
  // стартовая четвёрка
  'john-gameson': 'Джон Геймсон',
  'newb-ownerton': 'Ньюб Оуэртон',
  's-presso': 'Эс Прессо',
  'dee-coder': 'Ди Кодер',
  // слой «по знакомству»
  'biggs-porkins': 'Биггс Поркинс',
  'sam-ulation': 'Сэм Юлейшн',
  'amy-less': 'Эми Лесс',
  'callie-fornia': 'Кэлли Форния',
  // слой «журнал»
  'holly-cow': 'Холли Кау',
  'chuck-shultz': 'Чак Шульц',
  'ann-deroid': 'Энн Дероид',
  'gilly-bates': 'Гилли Бейтс',
  'lady-googoo': 'Леди Гугу',
  'vincent-vangoo': 'Винсент Вангу',
  // слой «интернет»
  'marla-sharpovich': 'Марла Шарпович',
  'abraham-malcolm': 'Абрахам Малкольм',
  'clementine-jones': 'Клементина Джонс',
  'shigeto-minamoto': 'Шигэто Минамото',
  'shirley-ugest': 'Ширли Юджест',
  // профучилище
  'frank-biller': 'Фрэнк Биллер',
  'dave-lightman': 'Дэйв Лайтман',
  'kitty-pawson': 'Китти Поусон',
  'bob-clockwatcher': 'Боб Клоквотчер',
  'jane-dough': 'Джейн Доу',
  'max-torque': 'Макс Торк',
  'honey-sweety': 'Хани Свити',
  'george-marlin': 'Джордж Марлин',
  'charlize-theory': 'Шарлиз Тиори',
  'john-dough': 'Джон Доу',
  'charles-royal': 'Чарльз Ройал',
  // день открытых дверей / Голливуд
  'sandy-claus': 'Сэнди Клаус',
  'donny-jepp': 'Донни Джепп',
  'mindy-crawford': 'Минди Кроуфорд',
  'bubbles-morgan': 'Бабблз Морган',
  'stephen-jobson': 'Стивен Джобсон',
  'cokie-bottleson': 'Коки Боттлсон',
  'sophie-kairo': 'Софи Кайро',
  'dexter-mcphee': 'Декстер Макфи',
  'walt-sidney': 'Уолт Сидни',
  'francoise-bloom': 'Франсуаза Блум',
  // спец-сотрудники
  'mister-x': 'Мистер X',
  'king-ackbar': 'Кинг Акбар',
  'grizzly-bearington': 'Гризли Берингтон',
  'chimpan-z-force': 'Чимпа Зи-Форс',
  'kairobot': 'Кайробот',
};

/** Русское имя сотрудника (fallback — исходное, если перевода нет). */
export function staffNameRu(id: string, fallback: string): string {
  return STAFF_NAME_RU[id] ?? fallback;
}
