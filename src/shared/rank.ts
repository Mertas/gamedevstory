// PLAN-22: уровень игрока = число открытых комбо «жанр × тип» (всего пар в игре — 1580).
// Общий модуль: сервер считает звание, клиент рисует карточку — таблица одна.
// Порогов намеренно много (каждый — реальный разработчик и его заслуга), чтобы звание
// менялось часто: первые шаги по одному комбо, дальше шаг растёт до конца шкалы (1580).
export interface Rank {
  /** нижняя граница (включительно) по числу открытых комбо */
  from: number;
  /** иконка звания */
  icon: string;
  /** имя: реальный разработчик, чей уровень игрок уже набрал */
  name: string;
  /** чем этот человек крут — одна строка */
  why: string;
}

/** Таблица порогов по возрастанию. Имена — реальные разработчики, а не абстракции. */
export const RANKS: readonly Rank[] = [
  { from: 0, icon: '🥚', name: 'Эрик Барон', why: 'Stardew Valley: сделал игру в одиночку за четыре года — включая музыку и пиксель-арт.' },
  { from: 1, icon: '🧑💻', name: 'Лукас Поуп', why: 'Papers, Please: один человек — механика, смысл и мораль в одной коробке.' },
  { from: 2, icon: '🎹', name: 'Тоби Фокс', why: 'Undertale: придумал, написал, нарисовал и озвучил всё сам.' },
  { from: 3, icon: '⛏️', name: 'Маркус Перссон', why: 'Minecraft: первая версия собрана за одну неделю.' },
  { from: 4, icon: '⌨️', name: 'Дэвид Брэбен', why: 'Elite: восемь галактик уместились в 22 КБ памяти.' },
  { from: 5, icon: '🌌', name: 'Иэн Белл', why: 'Elite: соавтор бесконечного космоса и первых торговых маршрутов.' },
  { from: 6, icon: '🎢', name: 'Крис Сойер', why: 'RollerCoaster Tycoon: написал симуляцию парка на ассемблере.' },
  { from: 7, icon: '🏰', name: 'Джордан Мехнер', why: 'Prince of Persia: ротоскоп и платформинг, придуманные заново.' },
  { from: 8, icon: '🐒', name: 'Рон Гилберт', why: 'Monkey Island и движок SCUMM: изобрёл язык приключенческих игр.' },
  { from: 9, icon: '🧩', name: 'Алексей Пажитнов', why: 'Тетрис: простая формула, пережившая все платформы.' },
  { from: 10, icon: '🔫', name: 'Кэндзи Эномото', why: 'Metal Gear: придумал жанр стелс.' },
  { from: 11, icon: '🕶️', name: 'Уоррен Спектор', why: 'Deus Ex: игрок сам решает, как пройти уровень.' },
  { from: 12, icon: '💀', name: 'Джон Ромеро', why: 'Doom: E1M1 стал эталоном уровня в шутере.' },
  { from: 13, icon: '🔮', name: 'Рэнд Миллер', why: 'Myst: головоломка, ставшая бестселлером девяностых.' },
  { from: 14, icon: '🗿', name: 'Фумито Уэда', why: 'ICO и Shadow of the Colossus: тишина как язык игры.' },
  { from: 15, icon: '🤖', name: 'Кэйдзи Инафунэ', why: 'Mega Man: дизайн уровней, который учит без единого слова.' },
  { from: 16, icon: '💨', name: 'Юдзи Нака', why: 'Sonic: скорость как эмоция.' },
  { from: 17, icon: '🏯', name: 'Хиронобу Сакагути', why: 'Final Fantasy: доказал, что JRPG нужны всему миру.' },
  { from: 18, icon: '🐛', name: 'Сатоси Тадзири', why: 'Pokémon: детская коллекция насекомых стала мировой франшизой.' },
  { from: 19, icon: '🥊', name: 'Масахиро Сакураи', why: 'Smash Bros: кроссовер, который живёт турнирами.' },
  { from: 20, icon: '🎼', name: 'Нобуо Уэмацу', why: 'Музыка Final Fantasy: партитуры, которые играют оркестры.' },
  { from: 22, icon: '🗡️', name: 'Хидэтака Миядзаки', why: 'Dark Souls: превратил сложность в идею.' },
  { from: 25, icon: '🎬', name: 'Хидео Кодзима', why: 'Metal Gear Solid: кино и игра перестали спорить.' },
  { from: 28, icon: '🎭', name: 'Ёко Таро', why: 'NieR: Automata: сюжет, который играет с формой самой игры.' },
  { from: 31, icon: '🐉', name: 'Тодд Ховард', why: 'Skyrim: мир, в котором живут годами.' },
  { from: 34, icon: '🚀', name: 'Гейб Ньюэлл', why: 'Half-Life и Steam: изменил и игры, и способ их покупать.' },
  { from: 38, icon: '🏗️', name: 'Уилл Райт', why: 'SimCity и The Sims: два жанра, которым больше тридцати лет.' },
  { from: 42, icon: '🧪', name: 'Питер Молиньё', why: 'Populous и Fable: замахивался на целые миры.' },
  { from: 47, icon: '🚙', name: 'Крис Робертс', why: 'Wing Commander: космос как кино.' },
  { from: 53, icon: '🧟', name: 'Синдзи Миками', why: 'Resident Evil 4: переизобрёл экшен от третьего лица.' },
  { from: 60, icon: '🖌️', name: 'Хидэаки Ицуно', why: 'Okami: живопись стала геймплеем.' },
  { from: 68, icon: '👻', name: 'Кэйитиро Тоями', why: 'Silent Hill: туман как страх.' },
  { from: 78, icon: '🧱', name: 'Тим Суини', why: 'Unreal Engine: движок, на котором выросла половина индустрии.' },
  { from: 90, icon: '🏅', name: 'Мишель Ансель', why: 'Rayman и Beyond Good & Evil: стиль превыше всего.' },
  { from: 104, icon: '🎵', name: 'Мартин О’Доннелл', why: 'Музыка Halo: тема, которую знают даже не игравшие.' },
  { from: 120, icon: '🧪', name: 'Джонатан Блоу', why: 'Braid и The Witness: головоломка как высказывание.' },
  { from: 140, icon: '🐟', name: 'Эдмунд Макмиллен', why: 'Super Meat Boy и The Binding of Isaac: инди-панк.' },
  { from: 165, icon: '🎮', name: 'Джейд Реймонд', why: 'Assassin’s Creed: продюсер больших миров.' },
  { from: 195, icon: '🎛️', name: 'Кэн Кутараги', why: 'PlayStation: привёл консоли в новую эпоху.' },
  { from: 230, icon: '🕹️', name: 'Гунпэй Ёкои', why: 'PlayStation: железо, на котором выросла целая эра.' },
  { from: 275, icon: '🚀', name: 'Джон Кармак', why: 'Doom и Quake: движки, на которых выросла вся индустрия шутеров.' },
  { from: 330, icon: '🌟', name: 'Сатору Ивата', why: 'Nintendo: геймдиректор, ставший лицом компании.' },
  { from: 400, icon: '🎲', name: 'Сид Мейер', why: 'Civilization: «ещё один ход» стало именем нарицательным.' },
  { from: 490, icon: '🍄', name: 'Хироси Ямаути', why: 'Превратил Nintendo из игрушечной компании в игровую империю.' },
  { from: 600, icon: '🗺️', name: 'Ричард Гэрриотт', why: 'Ultima: открытые миры задолго до open world.' },
  { from: 750, icon: '👾', name: 'Тору Иватани', why: 'Pac-Man: первая икона видеоигр.' },
  { from: 950, icon: '🍄', name: 'Сигеру Миямото', why: 'Mario и Zelda: из его идей выросла вся планета игр и профессия геймдизайнера.' },
  { from: 1200, icon: '🥚', name: 'Уоррен Робинетт', why: 'Adventure: спрятал первый пасхальный яйцо в игре.' },
  { from: 1450, icon: '🏭', name: 'Тосихиро Нисикадо', why: 'Space Invaders: сделал игры массовыми.' },
  { from: 1580, icon: '🏛️', name: 'Нолан Бушнелл', why: 'Atari и Pong: он вообще придумал эту индустрию — остальные пришли по его чертежам.' },
];

/** Звание по числу открытых комбо. */
export function rankFor(combos: number): Rank {
  let cur = RANKS[0]!;
  for (const r of RANKS) if (combos >= r.from) cur = r;
  return cur;
}

/** Следующее звание и сколько комбо до него (null — уже максимум). */
export function nextRank(combos: number): { rank: Rank; need: number } | null {
  for (const r of RANKS) if (r.from > combos) return { rank: r, need: r.from - combos };
  return null;
}

/** Тост о новом уровне: переход через порог — ещё и звание с заслугой (PLAN-22). */
export function levelUpNotice(prev: number, count: number, comboName: string): { title: string; text: string } {
  const now = rankFor(count);
  const before = rankFor(prev);
  if (now.name !== before.name) {
    return { title: `🎖️ Уровень ${count}: ${now.icon} ${now.name}`, text: `Новое комбо: ${comboName}. ${now.why}` };
  }
  const nx = nextRank(count);
  return {
    title: `🎖️ Уровень ${count}`,
    text: `Новое комбо: ${comboName}.` + (nx ? ` До звания «${nx.rank.name}» — ${nx.need}.` : ' Выше только легенды индустрии.'),
  };
}

/** Ключ комбо для хранения в аккаунте. */
export const comboKey = (genreId: string, typeId: string): string => `${genreId}|${typeId}`;
