// Промпт решения автопилота: упор направления выбирает LLM — по жанру/типу и обсуждению
// команды в чате, а не по пришпиленному примеру (иначе каждый проект «упор: доступность+полировка»).
import { describe, expect, it } from 'vitest';
import { buildDecisionPrompt, buildLetterPrompt, buildMessages } from '../src/server/chatgen';

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
    expect(text).toContain('сумма не больше 12');
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
