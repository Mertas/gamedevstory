// PLAN-44: процедурные квесты (v1.40.0) — «раз в год — один квест», не заканчиваются.
// Генератор собирает квест из шаблонов программно: суммы масштабируются годом партии,
// шаблон не повторяется дважды подряд. Контент и params хранятся в StoryArcState.gen.
import type { Rng } from '../rng';
import type { GameState, GenQuestData, Staff } from '../types';

/** Инфляция сумм к году партии: год 1 → 0.85×, год 8+ → ~1.9×, потолок 2.3×. */
function eraM(state: GameState): number {
  return 0.7 + Math.min(2.3, (state.year ?? 1) * 0.15);
}

const bestStatKey = (s: Staff) => {
  const ks = ['program', 'scenario', 'graphics', 'sound'] as const;
  let best: (typeof ks)[number] = 'program';
  for (const k of ks) if ((s.stats[k] ?? 0) > (s.stats[best] ?? 0)) best = k;
  return best;
};

/** Прибавка к лучшему стату сотрудника (с подъёмом порога, как в story.ts). */
function boost(s: Staff, delta: number): void {
  const k = bestStatKey(s);
  s.stats[k] = Math.max(1, (s.stats[k] ?? 0) + delta);
  if (s.caps) s.caps[k] = Math.max(s.caps[k] ?? 0, s.stats[k]);
}

type Build = (state: GameState) => GenQuestData | null;

// ─── шаблоны (id — стабильные, хранятся в сейве как flags.lastQuestIdx) ───

const TEMPLATES: { id: string; build: Build }[] = [
  {
    id: 'pirates', // с 1-го релиза
    build: (g) => {
      if (g.history.length < 1) return null;
      const a = Math.round(80 * eraM(g));
      return {
        template: 'pirates',
        title: '🏴 Пиратские кассеты',
        text: 'На рынке вовсю торгуют пиратскими копиями вашей последней игры — втрое дешевле. Юрист спрашивает: судимся или махнём рукой?',
        options: [
          { id: 'sue', label: `Судиться (−${a}K)`, cost: a },
          { id: 'ignore', label: 'Забить' },
        ],
        params: { a },
      };
    },
  },
  {
    id: 'interview',
    build: () => ({
      template: 'interview',
      title: '📰 Интервью журналу',
      text: 'Популярный игровой журнал просит у студии интервью. Журналист обещает «только хорошее», но поигрывает диктофоном.',
      options: [
        { id: 'accept', label: 'Согласиться' },
        { id: 'joke', label: 'Отвечать с юмором' },
        { id: 'decline', label: 'Отказаться' },
      ],
      params: {},
    }),
  },
  {
    id: 'fanletter',
    build: (g) => {
      const b = Math.round(20 * eraM(g));
      return {
        template: 'fanletter',
        title: '💌 Письмо фаната',
        text: 'Мальчишка из Новосибирска пишет, что прошёл вашу игру трижды, и просит автограф. В конверте — тетрадный листок с рисунком вашей игры.',
        options: [
          { id: 'reply', label: 'Ответить лично' },
          { id: 'gift', label: `Мерч и автографы (−${b}K)`, cost: b },
          { id: 'skip', label: 'В долгий ящик' },
        ],
        params: { b },
      };
    },
  },
  {
    id: 'sponsor',
    build: (g) => {
      const c = Math.round(250 * eraM(g));
      return {
        template: 'sponsor',
        title: '💼 Спонсор на пороге',
        text: `Бренд газировки предлагает ${c}K за логотип на титульном экране. «Все так делают», — пожимает плечами менеджер.`,
        options: [
          { id: 'take', label: `Взять деньги (+${c}K)` },
          { id: 'haggle', label: 'Поторговаться' },
          { id: 'refuse', label: 'Отказаться' },
        ],
        params: { c },
      };
    },
  },
  {
    id: 'conference',
    build: (g) => {
      const n = Math.max(1, g.staff.length);
      const d = Math.round((50 + 35 * n) * eraM(g));
      const e = Math.round(80 * eraM(g));
      return {
        template: 'conference',
        title: '🎓 Конференция разработчиков',
        text: 'В городе — ежегодная конференция: звук, графика, издательские тонкости. Поедет кто-нибудь?',
        options: [
          { id: 'all', label: `Оплатить всем (−${d}K)`, cost: d },
          { id: 'one', label: `Отправить одного (−${e}K)`, cost: e },
          { id: 'skip', label: 'Пропустить' },
        ],
        params: { d, e },
      };
    },
  },
  {
    id: 'leak',
    build: () => ({
      template: 'leak',
      title: '🕵️ Утечка в сеть',
      text: 'Скриншоты из вашей текущей разработки утекли на форумы. Журналисты шутят, что «кое-что раскопали».',
      options: [
        { id: 'teaser', label: 'Выпустить тизер' },
        { id: 'deny', label: 'Отрицать всё' },
        { id: 'ignore', label: 'Игнорировать' },
      ],
      params: {},
    }),
  },
  {
    id: 'museum', // с 1-го релиза
    build: (g) => {
      if (g.history.length < 1) return null;
      const m = Math.round(120 * eraM(g));
      return {
        template: 'museum',
        title: '🏛️ Приглашение в музей',
        text: 'Городской музей игр просит вашу первую игру в экспозицию «История электронных развлечений».',
        options: [
          { id: 'exhibit', label: 'Отдать в музей' },
          { id: 'sell', label: `Продать (+${m}K)`, },
          { id: 'refuse', label: 'Отказаться' },
        ],
        params: { m },
      };
    },
  },
  {
    id: 'rivals', // с 1-го релиза
    build: (g) => {
      if (g.history.length < 1) return null;
      return {
        template: 'rivals',
        title: '😼 Конкуренты хвастаются',
        text: 'Студия-сосед публично хвастается тиражами и вскользь прошлась по вашей последней игре. Форум ждёт ответа.',
        options: [
          { id: 'respond', label: 'Ответить публично' },
          { id: 'silent', label: 'Промолчать' },
        ],
        params: {},
      };
    },
  },
  {
    id: 'birthday',
    build: (g) => {
      const h = Math.round(100 * eraM(g));
      return {
        template: 'birthday',
        title: '🎂 Годовщина студии',
        text: 'У студии годовщина! Команда косится на календарь и на вас: будет ли праздник?',
        options: [
          { id: 'party', label: `Праздник (−${h}K)`, cost: h },
          { id: 'quiet', label: 'Скромно' },
        ],
        params: { h },
      };
    },
  },
  {
    id: 'charity',
    build: (g) => {
      const i = Math.round(50 * eraM(g));
      return {
        template: 'charity',
        title: '❤️ Благотворительность',
        text: 'Детский дом просит помочь с техникой для кружка юных программистов. Письмо подписано директором от руки.',
        options: [
          { id: 'donate', label: `Пожертвовать (−${i}K)`, cost: i },
          { id: 'skip', label: 'Вежливо отказаться' },
        ],
        params: { i },
      };
    },
  },
  {
    id: 'hardware',
    build: (g) => {
      const j = Math.round(60 * eraM(g));
      return {
        template: 'hardware',
        title: '💾 Скидки на технику',
        text: 'Магазин техники устраивает распродажу рабочих станций — только до конца месяца.',
        options: [
          { id: 'buy', label: `Закупиться (−${j}K)`, cost: j },
          { id: 'skip', label: 'Пропустить' },
        ],
        params: { j },
      };
    },
  },
];

/** Собрать очередной квест: валидные шаблоны, без повтора последнего, случайный выбор. */
export function buildGeneratedQuest(state: GameState, rng: Rng): GenQuestData | null {
  // До первого релиза студию ещё не знают — квесты начинаются с первым релизом
  if (state.history.length < 1) return null;
  const st = state.story;
  const lastIdx = st?.flags?.lastQuestIdx ?? -1;
  const built = TEMPLATES.map((t, idx) => ({ idx, gen: t.build(state) })).filter(
    (x): x is { idx: number; gen: GenQuestData } => x.gen !== null,
  );
  let pool = built.length > 1 ? built.filter((x) => x.idx !== lastIdx) : built;
  if (pool.length === 0) pool = built;
  if (pool.length === 0) return null;
  const pick = pool[rng.int(0, pool.length - 1)]!;
  if (st) st.flags.lastQuestIdx = pick.idx;
  return pick.gen;
}

/** Применить выбор игрока в процедурном квесте. Возвращает текст для журнала (или null). */
export function resolveGeneratedQuest(
  state: GameState,
  gen: GenQuestData,
  optionId: string,
  rng: Rng,
): string | null {
  const opt = gen.options.find((o) => o.id === optionId);
  if (!opt) return null;
  const p = gen.params;
  const staff = state.staff;
  switch (gen.template) {
    case 'pirates': {
      if (optionId === 'sue') {
        if (rng.chance(0.6)) {
          state.fans += 40;
          return '⚖️ Процесс выигран, пресса раздула историю — фанаты +40';
        }
        state.fans += 5;
        return '⚖️ Суд тянулся месяцами и кончился ничем — фанаты +5';
      }
      state.fans = Math.max(0, state.fans - 10);
      return '🏴 Пираты разошлись по рынку (фанаты −10)';
    }
    case 'interview': {
      if (optionId === 'accept') {
        if (rng.chance(0.55)) {
          state.fans += 35;
          return '📰 Отличное интервью — фанаты +35';
        }
        state.fans = Math.max(0, state.fans - 15);
        return '📰 Журналист вырвал фразу из контекста (фанаты −15)';
      }
      if (optionId === 'joke') {
        if (rng.chance(0.5)) {
          state.fans += 50;
          return '😄 Шутки зашли — интервью разошлось на цитаты (+50 фанатов)';
        }
        state.fans = Math.max(0, state.fans - 20);
        return '😬 Шутку поняли превратно — фанаты −20';
      }
      return '📰 Интервью отложено — не до журналистов';
    }
    case 'fanletter': {
      if (optionId === 'reply') {
        state.fans += 25;
        return '💌 Ответ написан от руки — фанат счастлив (+25 фанатов)';
      }
      if (optionId === 'gift') {
        state.fans += 60;
        return '🎁 Посылка с автографами ушла в Новосибирск (+60 фанатов)';
      }
      state.fans = Math.max(0, state.fans - 5);
      return '📪 Письмо осталось без ответа (фанаты −5)';
    }
    case 'sponsor': {
      const c = p.c ?? 0;
      if (optionId === 'take') {
        state.money += c;
        state.fans = Math.max(0, state.fans - 15);
        return `💼 Логотип в игре: +${c}K, фанаты −15 («продались!»)`;
      }
      if (optionId === 'haggle') {
        if (rng.chance(0.5)) {
          const cw = Math.round(c * 1.5);
          state.money += cw;
          state.fans = Math.max(0, state.fans - 15);
          return `💼 Торг удался: +${cw}K (фанаты −15)`;
        }
        return '💼 Спонсор обиделся и ушёл — сделки не будет';
      }
      state.fans += 10;
      return '🚫 Отказались от спонсора — фанаты оценили честность (+10)';
    }
    case 'conference': {
      if (optionId === 'all') {
        for (const s of staff) boost(s, 1);
        return '🎓 Вся команда вернулась с конференции с новыми идеями (+1 стат каждому)';
      }
      if (optionId === 'one') {
        if (staff.length === 0) return '🎓 Ехать было некому';
        const s = staff[rng.int(0, staff.length - 1)]!;
        boost(s, 3);
        return `🎓 ${s.name} съездил на конференцию и подрос (+3 к стату)`;
      }
      return '🎓 Конференцию пропустили — работа важнее';
    }
    case 'leak': {
      if (optionId === 'teaser') {
        state.fans += 30;
        return '📺 Тизер подогрел публику (+30 фанатов)';
      }
      if (optionId === 'deny') {
        if (rng.chance(0.5)) {
          state.fans += 10;
          return '🙅 Отрицание сработало: интрига только растёт (+10 фанатов)';
        }
        state.fans = Math.max(0, state.fans - 20);
        return '😬 Обман раскрыли — фанаты −20';
      }
      return '🕵️ Утечку не заметили (и ладно)';
    }
    case 'museum': {
      if (optionId === 'exhibit') {
        state.fans += 20;
        return '🏛️ Экспозиция открыта — о студии говорят (+20 фанатов)';
      }
      if (optionId === 'sell') {
        const m = p.m ?? 0;
        state.money += m;
        state.fans = Math.max(0, state.fans - 10);
        return `💰 Экспонат продан коллекционеру: +${m}K (фанаты −10)`;
      }
      return '🏛️ Музей получил вежливый отказ';
    }
    case 'rivals': {
      if (optionId === 'respond') {
        if (rng.chance(0.55)) {
          state.fans += 25;
          return '😼 Ваш ответ разошёлся по форумам — фанаты +25';
        }
        state.fans = Math.max(0, state.fans - 10);
        return '😐 Ответ вышел вялым — фанаты −10';
      }
      return '😶 Промолчали и продолжили работать';
    }
    case 'birthday': {
      if (optionId === 'party') {
        state.fans += 40;
        return '🎂 Праздник удался — фото разошлись по прессе (+40 фанатов)';
      }
      state.fans += 5;
      return '🕯️ Отметили скромно, по-семейному (+5 фанатов)';
    }
    case 'charity': {
      if (optionId === 'donate') {
        state.fans += 35;
        return '❤️ О пожертвовании написали в газете (+35 фанатов)';
      }
      return '💌 Директору написали вежливый отказ';
    }
    case 'hardware': {
      if (optionId === 'buy') {
        state.research += 25;
        return '💾 Новые машины в строю (исследования +25 PR)';
      }
      return '💾 Скидки пропустили';
    }
    default:
      return null;
  }
}
