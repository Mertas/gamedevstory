// Промпт решения автопилота (16): обсуждение и решение — ОДНИМ ответом команды;
// без таблицы комбо и цен — решают как творческие люди (жалоба: «обоснование по механикам»).
import { describe, expect, it } from 'vitest';
import { buildDecisionPrompt, buildLetterPrompt, buildMessages, parseDecision, parseSingleMessage } from '../src/server/chatgen';

const ctx = {
  team: 'John (proposal Lv1, id:john)',
  money: 400,
  research: 10,
  office: 1,
  genres: 'puzzle="Пазл"',
  types: 'reverse="Реверси"',
  consoles: 'pc-game="PC Game"',
  directionPoints: 12,
};

type PromptCtx = Parameters<typeof buildDecisionPrompt>[0];
function promptText(extra: Partial<PromptCtx> = {}): string {
  return buildDecisionPrompt({ ...ctx, ...extra } as PromptCtx).map((m) => m.content).join('\n');
}

describe('buildDecisionPrompt: обсуждение и решение одним ответом (16)', () => {
  it('требует реплики, роли, название и описание; бюджет направления — из партии', () => {
    const text = promptText();
    expect(text).toContain('"messages"');
    expect(text).toContain('2–4 реплики');
    expect(text).toContain('роли');
    expect(text).toContain('"name"');
    expect(text).toContain('"plot"');
    expect(text).toContain('сумма РОВНО 12');
    expect(text).toContain('Очки направления: 12');
    expect(text).toContain('не входит в другие роли');
  });

  it('без таблицы комбо: ни градаций, ни цен как аргументов', () => {
    const text = promptText();
    expect(text).not.toContain('Топ комбинаций');
    expect(text).not.toContain('S лучше A');
    expect(text).not.toContain('(~');
    expect(text).toContain('НЕ упоминайте рейтинги, градации');
  });

  it('человеческие мотивы: история студии, продолжение удачного и письма фанатов', () => {
    const text = promptText({ history: '«Хит» — Пазл × Реверси, 34/40', sequel: '«Пазл × Реверси» — 34/40', fans: 'восторг — «Хит»' });
    expect(text).toContain('История студии');
    expect(text).toContain('«Хит» — Пазл × Реверси, 34/40');
    expect(text).toContain('можно сделать продолжение');
    expect(text).toContain('Письма фанатов');
    expect(text).toContain('восторг — «Хит»');
    expect(text).toContain('не повторяйте');
  });
});

describe('parseDecision: план + реплики из одного ответа (16)', () => {
  const base = {
    genreId: 'puzzle', typeId: 'reverse', consoleId: 'pc-game', mode: 'normal',
    direction: { cute: 6, polish: 6 },
    proposalStaffId: 'john', assignments: { program: ['newb'], graphics: [], sound: [], debug: [] },
  };
  it('разбирает реплики, название и описание', () => {
    const r = parseDecision(JSON.stringify({
      ...base, name: 'Кот-Реверс', plot: 'Кот складывает пазлы в космосе.',
      messages: [{ author: 'John', text: 'Делаем пазл про кота!' }, { author: 'Newb', text: 'Я запрограммирую ядро.' }],
    }));
    expect(r?.plan.name).toBe('Кот-Реверс');
    expect(r?.plan.plot).toBe('Кот складывает пазлы в космосе.');
    expect(r?.messages.map((m) => m.author)).toEqual(['John', 'Newb']);
    expect(r?.plan.genreId).toBe('puzzle');
  });
  it('обрезает название до 40 и описание до 800; пустые — undefined, реплик нет', () => {
    const r = parseDecision(JSON.stringify({ ...base, name: 'X'.repeat(80), plot: 'Y'.repeat(2000) }));
    expect(r?.plan.name?.length).toBe(40);
    expect(r?.plan.plot?.length).toBe(800);
    const r2 = parseDecision(JSON.stringify(base));
    expect(r2?.plan.name).toBeUndefined();
    expect(r2?.messages).toEqual([]);
  });
  it('не JSON — null (фолбэк остаётся)', () => {
    expect(parseDecision('никакого json тут нет')).toBeNull();
  });
});

// Память диалога, анти-повтор и ротация говорящих: раньше реплика видела только последнюю
// строку, а авторами были одни и те же (диагноз по живому сейву 10.09.2026).
const chatCtx = {
  year: 1993, week: 40, money: 500, fans: 120, research: 30,
  staff: [
    { id: 'newb', name: 'Newb', career: 'программист', stats: { program: 40, scenario: 20, graphics: 20, sound: 20 }, persona: 'ироничный ворчун' },
    { id: 'donny', name: 'Donny', career: 'звукорежиссёр', stats: { program: 10, scenario: 10, graphics: 10, sound: 60 }, persona: 'восторженный иностранец' },
  ],
  project: null,
  facts: { score: 40 },
};

function msgText(opts: Parameters<typeof buildMessages>[2]): string {
  return buildMessages('release', chatCtx, opts).map((m) => m.content).join('\n');
}

describe('buildMessages: память диалога и ротация говорящих', () => {
  it('реплика видит историю треда, зачины «не повторяй» и кому дать слово', () => {
    const text = msgText({
      replyTo: 'Выпустили! Рецензии отличные.',
      history: [{ author: 'Dee', text: 'Наконец-то дожали!' }],
      recent: ['Ёлки-палки, опять'],
      spoken: ['Dee', 'Newb'],
      suggest: ['Donny'],
    });
    expect(text).toContain('Диалог до этого:');
    expect(text).toContain('Dee: «Наконец-то дожали!»');
    expect(text).toContain('НЕ повторяй эти зачины');
    expect(text).toContain('«Ёлки-палки, опять»');
    expect(text).toContain('В диалоге уже говорили: Dee, Newb.');
    expect(text).toContain('Дай слово тому, кто ещё НЕ говорил: Donny.');
  });

  it('жёсткая ротация: автором может быть только молчун из списка', () => {
    const text = msgText({ replyTo: 'ага', spoken: ['Dee', 'Newb'], suggest: ['Donny'], hardRotate: true });
    expect(text).toContain('ТОЛЬКО один из: Donny.');
  });

  it('открытие диалога: мягкая подсказка, списка говоривших ещё нет', () => {
    const text = msgText({ suggest: ['Donny'] });
    expect(text).toContain('Слово лучше дать одному из: Donny.');
    expect(text).not.toContain('В диалоге уже говорили');
  });
});


// Письма фанатов: 4 тона, разные зачины и длина, конкретика (10.09.2026).
// Раньше письма сходились к «Дорогие разработчики! Я просто…» — теперь стиль задаёт движок.
describe('buildLetterPrompt: 4 тона писем', () => {
  const base = { fanName: 'Игорь', gender: 'M' as const, gameName: 'Гонки', score: 30, year: 1993 };

  it('стиль задаёт тон, длину и зачин; запрещены шаблонные зачины', () => {
    const rant = buildLetterPrompt({ ...base, sentiment: 'hate', style: 'rant' });
    expect(rant[0]!.content).toContain('конкретные претензии');
    const delight = buildLetterPrompt({ ...base, sentiment: 'love', style: 'delight' });
    expect(delight[0]!.content).toContain('восторженное');
    expect(delight[0]!.content).toContain('2–4 предложения');
    expect(delight[0]!.content).toContain('Дорогие разработчики'); // это запрет в правилах промпта
    expect(delight[0]!.content).toContain('«Я просто…»'); // анти-шаблон
  });

  it('без style — тон по чувству: love→восторг, neutral→идеи, hate→разбор', () => {
    expect(buildLetterPrompt({ ...base, sentiment: 'love' })[0]!.content).toContain('восторженное');
    expect(buildLetterPrompt({ ...base, sentiment: 'neutral' })[0]!.content).toContain('зачин — предложение');
    expect(buildLetterPrompt({ ...base, sentiment: 'hate' })[0]!.content).toContain('конкретные претензии');
  });

  it('жанр из письма попадает в факты — конкретика', () => {
    const p = buildLetterPrompt({ ...base, sentiment: 'love', genre: 'Гонки' });
    expect(p[1]!.content).toContain('жанр: Гонки');
    expect(p[1]!.content).toContain('75/100');
  });
});

// LLM-06(в,г): разбор массива реплик и человеческие итоги релиза (10.09.2026).
describe('parseSingleMessage и итоги релиза (LLM-06 в,г)', () => {
  it('массив messages: берём первую валидную, а не битый arr[0]', () => {
    const raw = JSON.stringify({
      messages: [
        { author: 'Dee', text: 'ок' }, // 2 символа — невалидно
        { author: 'Деидре', text: 'Продолжаю мысль дальше по существу вопроса.' },
        { author: 'Newb', text: 'А я добавлю, что да.' },
      ],
    });
    expect(parseSingleMessage(raw)).toEqual({ author: 'Деидре', text: 'Продолжаю мысль дальше по существу вопроса.' });
  });

  it('массив: пропускаем автора, говорившего последним (не отвечаем сами себе)', () => {
    const raw = JSON.stringify({
      messages: [
        { author: 'Деидре', text: 'Реплику начну с этой фразы, всё по делу.' },
        { author: 'Newb', text: 'А я добавлю пару слов про пиксели.' },
      ],
    });
    expect(parseSingleMessage(raw, 'Деидре')).toEqual({ author: 'Newb', text: 'А я добавлю пару слов про пиксели.' });
  });

  it('объект {"message"} остаётся приоритетным', () => {
    const raw = JSON.stringify({
      message: { author: 'Newb', text: 'Одиночная реплика как просили.' },
      messages: [{ author: 'Dee', text: 'Игнорируем этот массив.' }],
    });
    expect(parseSingleMessage(raw)).toEqual({ author: 'Newb', text: 'Одиночная реплика как просили.' });
  });

  it('итоги релиза — человеческой строкой; units (тыс.) → «241K», не сырой JSON', () => {
    const text = buildMessages('release', { ...chatCtx, facts: { score: 33, units: 241 } }, {})
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain('Итоги релиза: рецензии 83/100, продажи 241K копий.');
    expect(text).not.toContain('"units"');
    const big = buildMessages('release', { ...chatCtx, facts: { score: 33, units: 2500 } }, {})
      .map((m) => m.content)
      .join('\n');
    expect(big).toContain('продажи 2.50M копий');
  });

  it('итоги релиза: имя игры и жанр × тип в подписи (реакция знает, что выпустили)', () => {
    const text = buildMessages('release', {
      ...chatCtx,
      facts: { score: 40, units: 241, name: 'Furry Explorers', genre: 'Приключение', type: 'Животные', console: 'PC Game' },
    }, {})
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain('Итоги релиза игры «Furry Explorers» (Приключение × Животные, PC Game): рецензии 100/100, продажи 241K копий.');
  });
});

// AP-08: idle-фаза автопилота — затишье, одна короткая реплика (оживляет паузы).
describe('buildMessages: idle-фаза', () => {
  it('инструкция затишья попадает в промпт (фаза не провалилась в дефолт)', () => {
    const text = buildMessages('idle', chatCtx, {}).map((m) => m.content).join('\n');
    expect(text).toContain('Затишье');
    expect(text).toContain('Одна короткая реплика');
  });
});
