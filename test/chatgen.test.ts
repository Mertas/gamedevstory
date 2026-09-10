// Промпт решения автопилота: упор направления выбирает LLM — по жанру/типу и обсуждению
// команды в чате, а не по пришпиленному примеру (иначе каждый проект «упор: доступность+полировка»).
import { describe, expect, it } from 'vitest';
import { buildDecisionPrompt, buildLetterPrompt, buildMessages, parseSingleMessage } from '../src/server/chatgen';

const ctx = {
  team: 'John (proposal Lv1, id:john)',
  money: 400,
  research: 10,
  office: 1,
  genres: 'puzzle="Пазл"',
  types: 'reverse="Реверси"',
  combos: 'Пазл × Реверси = S (~390K)',
  consoles: 'pc-game="PC Game"',
  directionPoints: 12,
};

function promptText(discussion?: string): string {
  return buildDecisionPrompt(ctx, discussion).map((m) => m.content).join('\n');
}

describe('buildDecisionPrompt: упор решает чат', () => {
  it('передаёт обсуждение команды и бюджет направления из партии', () => {
    const text = promptText('John: делаем упор на нишевость и инновации\nNewb: согласен, ниша наше всё');
    expect(text).toContain('Обсуждение команды');
    expect(text).toContain('John: делаем упор на нишевость и инновации');
    expect(text).toContain('сумма РОВНО 12');
    expect(text).toContain('распредели все доступные очки');
    expect(text).toContain('свободных очков не оставляй');
    expect(text).toContain('Очки направления: 12');
    expect(text).toContain('УПОР в направлении выбери сам');
  });

  it('пример ответа не пришпиливает доступность/полировку (старый источник «одних и тех же осей»)', () => {
    const text = promptText();
    expect(text).not.toContain('"approach":5');
    expect(text).not.toContain('"polish":5');
    expect(text).toContain('НЕ копируй его');
  });

  it('без обсуждения промпт остаётся валидным (решение до чата / пустой чат)', () => {
    const text = promptText();
    expect(text).not.toContain('Обсуждение команды');
    expect(text).toContain('"direction"');
  });

  it('AP-04: письма фанатов попадают в промпт с правилом о смене жанра после разгрома', () => {
    const text = buildDecisionPrompt({ ...ctx, fans: 'разгром — «Гонки»; восторг — «Рогалик»' }, undefined)
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain('Письма фанатов');
    expect(text).toContain('разгром — «Гонки»');
    expect(text).toContain('жанр не повторяй');
  });

  it('AP-04: без писем строки о фанатах в промпте нет (промпт не пухнет)', () => {
    expect(promptText()).not.toContain('Письма фанатов');
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
    expect(p[1]!.content).toContain('30/40');
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

  it('итоги релиза — человеческой строкой, units не сырым JSON', () => {
    const text = buildMessages('release', { ...chatCtx, facts: { score: 33, units: 12000 } }, {})
      .map((m) => m.content)
      .join('\n');
    expect(text).toContain('Итоги релиза: рецензии 33/40, продажи 12 000 копий.');
    expect(text).not.toContain('"units"');
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
