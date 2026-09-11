// Серверный слой (Ф0/Ф1): валидация set_speed, схемная проверка импорта, отмена решений
// автопилота (SRV-03), очереди чата (SRV-11). LLM инжектится fake-функцией (LLM-05).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GameServer } from '../src/server/game';
import type { LlmFn } from '../src/server/giga';
import { newGame } from '../src/core/engine';
import { autopilotProjectInput } from '../src/core/sim/policy';
import type { AutopilotStep } from '../src/shared/autopilot';

let dir: string | null = null;
let srv: GameServer | null = null;

function makeServer(llm: LlmFn = async () => ({ text: '{}', model: 'fake' })): GameServer {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-test-'));
  return new GameServer({
    llm,
    story: async () => ({ title: 'Тест', plot: 'Сюжет' }),
    savePath: path.join(dir, 'save.json'),
  });
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  srv?.dispose();
  srv = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('GameServer: set_speed (SRV-01)', () => {
  it('отклоняет NaN/огромное/отрицательное, принимает 0..8', () => {
    srv = makeServer();
    for (const bad of [Number.NaN, 1e9, -1, Number.POSITIVE_INFINITY]) {
      srv.handle({ type: 'set_speed', v: bad });
      expect(srv.actionResult()).toEqual({ ok: false, error: expect.stringContaining('некорректная скорость') });
      expect(srv.snapshot().speed).toBe(1); // скорость не изменилась — тикер не ушёл в 1 мс
    }
    srv.handle({ type: 'set_speed', v: 8 });
    expect(srv.actionResult()).toBeNull();
    expect(srv.snapshot().speed).toBe(8);
  });
});

describe('GameServer: new_game (BUG-01)', () => {
  it('новая партия стартует на 1× — пауза авторежима не наследуется', () => {
    srv = makeServer();
    srv.handle({ type: 'set_speed', v: 0 }); // пауза
    srv.handle({ type: 'set_autopilot', on: true }); // авто снимает паузу, но НЕ разгоняет (AP-12)
    expect(srv.snapshot().speed).toBe(1);
    srv.handle({ type: 'new_game' });
    expect(srv.snapshot().speed).toBe(1);
  });
});

describe('GameServer: обсуждение автопилота (16)', () => {
  it('реплики решения встают в очередь чата с шагом 2 недели', () => {
    srv = makeServer();
    const w = srv.game.week;
    srv.publishDiscussion([
      { author: 'Джон', text: 'Берём пазл — и с котами!' },
      { author: 'Ньюб', text: 'Я запрограммирую ядро.' },
    ]);
    expect(srv.chat.queue.length).toBe(2);
    expect(srv.chat.queue[0]!.week).toBe(w + 2);
    expect(srv.chat.queue[1]!.week).toBe(w + 4);
  });
});

describe('GameServer: importSave (SRV-02)', () => {
  it('битый/огрызок импорта не подменяет живую партию', () => {
    srv = makeServer();
    const g = srv.snapshot().game;
    g.money = 4242;
    expect(srv.importSave('не json вовсе')).toBe(false);
    expect(srv.importSave('{"game":{"week":1}}')).toBe(false);
    expect(srv.importSave(JSON.stringify({ game: { ...newGame(1), staff: 'нет' } }))).toBe(false);
    expect(srv.snapshot().game.money).toBe(4242); // живая партия не тронута
  });

  it('валидный импорт заменяет партию', () => {
    srv = makeServer();
    const g = newGame(777);
    g.money = 12345;
    expect(srv.importSave(JSON.stringify({ game: g, chat: { msgs: [], queue: [], phases: {} } }))).toBe(true);
    expect(srv.snapshot().game.money).toBe(12345);
  });
});

describe('GameServer: хвосты сервера (SRV-18/08/05)', () => {
  it('SRV-05: результат сюжета несёт reqId запроса; отписанный слушатель молчит', async () => {
    srv = makeServer();
    const got: Array<{ ok: boolean; reqId?: number; title?: string; plot?: string }> = [];
    const unsub = srv.addStoryListener((res) => got.push(res));
    await srv.runStory({ genreId: 'table', typeId: 'pirate', reqId: 42 });
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ ok: true, title: 'Тест', plot: 'Сюжет', reqId: 42 });
    unsub();
    await srv.runStory({ genreId: 'table', typeId: 'pirate', reqId: 43 });
    expect(got).toHaveLength(1); // после отписки результат не приходит
  });

  it('SRV-18: неизвестное действие и чужой вариант стенда отклоняются с ошибкой', () => {
    srv = makeServer();
    srv.handle({ type: 'definitely-not-an-action' } as never);
    expect(srv.actionResult()).toEqual({ ok: false, error: expect.stringContaining('Неизвестное действие') });
    srv.handle({ type: 'resolve_gamedex', option: 'hack-the-planet' });
    expect(srv.actionResult()).toEqual({ ok: false, error: expect.stringContaining('Неизвестный стенд') });
  });

  it('SRV-08: старт проекта сразу пишется на диск (не ждём дебаунса)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    srv = makeServer();
    const g = srv.snapshot().game;
    g.money = 1e6;
    srv.handle({ type: 'set_speed', v: 8 });
    await vi.advanceTimersByTimeAsync(400); // PC «поступила в продажу»
    const spy = vi.spyOn(srv, 'saveNow');
    const input = autopilotProjectInput(g)!;
    srv.handle({ type: 'start_project', input });
    expect(srv.snapshot().game.activeGame).not.toBeNull();
    expect(spy).toHaveBeenCalled();
    const saved = JSON.parse(fs.readFileSync(path.join(dir!, 'save.json'), 'utf8')) as { game: { activeGame: unknown } };
    expect(saved.game.activeGame).not.toBeNull(); // партия уже на диске
  });
});

describe('GameServer: автопилот и чат', () => {
  it('SRV-03: take_control во время решения отменяет план и хореографию', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // фиксированный сид партии — тест детерминирован
    let resolveDecision: ((text: string) => void) | undefined;
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('команда игровой студии')) {
        // решение «висит», пока тест не отпустит его сам
        return new Promise<{ text: string; model: string }>((resolve) => {
          resolveDecision = (text) => resolve({ text, model: 'fake' });
        });
      }
      // чат: невалидный ответ → серия обсуждения быстро рассыпается (errors >= 3)
      return { text: 'не JSON', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.snapshot().game.money = 1e6; // без проектов политика не зарабатывает — исключаем банкротство
    const steps: AutopilotStep[] = [];
    srv.subscribeSteps((s) => steps.push(s));

    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'set_autopilot', on: true }); // кнопка «Отдать управление» (таймаут убран)
    for (let i = 0; i < 60 && !resolveDecision; i++) await vi.advanceTimersByTimeAsync(500);
    expect(srv.snapshot().autopilot).toBe(true);
    expect(resolveDecision).toBeTypeOf('function'); // решение LLM уже в полёте

    // босс вернулся, пока LLM «думал»
    srv.handle({ type: 'take_control' });
    expect(srv.snapshot().autopilot).toBe(false);

    // LLM отвечает ПОСЛЕ возврата босса — план не должен ставиться
    const plan = autopilotProjectInput(srv.snapshot().game);
    expect(plan).not.toBeNull();
    resolveDecision!(JSON.stringify(plan));
    await vi.advanceTimersByTimeAsync(4000);

    expect(steps.some((s) => s.kind === 'plan')).toBe(false); // хореография визарда не запускалась
    expect(srv.snapshot().game.activeGame).toBeNull(); // проект не стартовал
  });

  it('16: решение чата — реплики и упор из одного ответа доезжают до чата и хореографии', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let decisionUser = '';
    let resolveDecision: ((text: string) => void) | undefined;
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('команда игровой студии')) {
        decisionUser = messages[1]?.content ?? '';
        return new Promise<{ text: string; model: string }>((resolve) => {
          resolveDecision = (text) => resolve({ text, model: 'fake' });
        });
      }
      if (sys.includes('обычный игрок')) return { text: 'Классная игра!', model: 'fake' }; // письма фанатов — не JSON
      return { text: 'не JSON', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.snapshot().game.money = 1e6;
    const steps: AutopilotStep[] = [];
    srv.subscribeSteps((s) => steps.push(s));
    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'set_autopilot', on: true }); // кнопка «Отдать управление» (таймаут убран)

    for (let i = 0; i < 160 && !resolveDecision; i++) await vi.advanceTimersByTimeAsync(500);
    expect(resolveDecision).toBeTypeOf('function'); // LLM-решение уже в полёте
    // промпт решения: команда и бюджет направления из партии; таблицы комбо больше нет
    expect(decisionUser).toContain('Команда: ');
    expect(decisionUser).toContain(`Очки направления: ${srv.snapshot().game.directionPoints}`);
    expect(decisionUser).not.toContain('Топ комбинаций');

    const base = autopilotProjectInput(srv.snapshot().game);
    expect(base).not.toBeNull();
    const staff = srv.snapshot().game.staff;
    // ОДИН ответ: живые реплики и решение — вместе (что решили, то и делают)
    resolveDecision!(JSON.stringify({
      ...base,
      direction: { niche: 6, innovation: 4 },
      name: 'Нишевая история',
      plot: 'Маленькая игра про большое.',
      messages: [
        { author: staff[0]!.name, text: 'Предлагаю упор на нишевость и инновации!' },
        { author: staff[1]!.name, text: 'Согласен — и назовём «Нишевая история».' },
      ],
    }));
    await vi.advanceTimersByTimeAsync(2000);

    const step = steps.find((s) => s.kind === 'plan');
    expect(step).toBeTruthy();
    if (step?.kind === 'plan') {
      expect(step.plan.direction).toMatchObject({ niche: 6, innovation: 4 }); // упор чата доехал до хореографии
      expect(step.plan.name).toBe('Нишевая история'); // название команды — в мастер
      expect(Object.values(step.plan.direction).reduce((a, b) => a + b, 0)).toBe(srv.snapshot().game.directionPoints);
    }
    // в чате: реплики команды, «Решено» с названием и упором — и никакого «Почему так»
    const snap = srv.snapshot();
    const chatAll = [...snap.chat.msgs, ...snap.chat.queue];
    expect(chatAll.some((m) => m.text.includes('нишевость и инновации'))).toBe(true);
    expect(chatAll.some((m) => m.text.includes('Решено:') && m.text.includes('Нишевая история'))).toBe(true);
    expect(chatAll.some((m) => m.text.includes('Упор:') && m.text.includes('Нишевость 6'))).toBe(true);
    expect(chatAll.some((m) => m.text.includes('Почему так'))).toBe(false);
  });

  it('SRV-11: второй вопрос игрока не затирает первый (FIFO)', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // серия = 1 реплика на вопрос — детерминированно
    const llm: LlmFn = async (messages) => {
      const name = srv!.snapshot().game.staff[0]!.name;
      const sys = messages[0]?.content ?? '';
      if (sys.includes('корпоративный чат')) {
        return { text: JSON.stringify({ message: { author: name, text: 'Отвечаем, босс!' } }), model: 'fake' };
      }
      return { text: '{}', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.handle({ type: 'set_speed', v: 8 });

    // оба вопроса приходят, пока команда занята первым
    srv.handle({ type: 'chat_message', text: 'Первый вопрос' });
    srv.handle({ type: 'chat_message', text: 'Второй вопрос' });
    await vi.advanceTimersByTimeAsync(700); // автопилот сам не включается — только кнопкой

    const msgs = srv.snapshot().chat.msgs;
    const asked = msgs.filter((m) => m.author === 'Вы');
    const answered = msgs.filter((m) => m.author !== 'Вы' && m.author !== 'Система');
    expect(asked.length).toBe(2); // оба вопроса в чате
    expect(answered.length).toBe(2); // и на каждый есть ответ (раньше второй терялся)
  });

  it('автопилот не включается сам от простоя — только кнопкой «Взять/Отдать управление»', async () => {
    srv = makeServer();
    srv.snapshot().game.money = 1e6;
    srv.handle({ type: 'set_speed', v: 8 });
    await vi.advanceTimersByTimeAsync(30000); // десятки игровых недель без действий босса
    expect(srv.snapshot().autopilot).toBe(false); // авторежим не включился сам

    srv.handle({ type: 'set_autopilot', on: true }); // кнопка «Отдать управление»
    expect(srv.snapshot().autopilot).toBe(true);
    srv.handle({ type: 'set_autopilot', on: false }); // кнопка «Взять управление»
    expect(srv.snapshot().autopilot).toBe(false);
  });

  it('память диалога и ротация: реплика видит историю треда, повтор автора переспрашивается', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const chatPrompts: string[] = [];
    let srvName = '';
    const llm: LlmFn = async (messages) => {
      chatPrompts.push(messages[1]?.content ?? '');
      return { text: JSON.stringify({ message: { author: srvName, text: 'Ёлки-палки, давайте уже работать!' } }), model: 'fake' };
    };
    srv = makeServer(llm);
    srvName = srv.snapshot().game.staff[0]!.name; // все реплики — от одного: проверяем ротацию
    srv.handle({ type: 'set_speed', v: 8 });
    // серия ответов боссу (16: чат-память не зависит от автопилота — обсуждение живёт в решении)
    srv.handle({ type: 'chat_message', text: `Босс спрашивает: как продвигается проект? ${'Расскажите подробнее, очень интересно! '.repeat(3)}` });
    for (let i = 0; i < 160 && chatPrompts.length < 4; i++) await vi.advanceTimersByTimeAsync(500);

    expect(chatPrompts.length).toBeGreaterThanOrEqual(4); // открытие + реплики + повтор выбора автора
    expect(chatPrompts.some((p) => p.includes('Диалог до этого:'))).toBe(true); // реплика видит тред
    expect(chatPrompts.some((p) => p.includes('Ёлки-палки, давайте уже работать!'))).toBe(true); // история содержит реплику
    expect(chatPrompts.some((p) => p.includes('СТРОГО:'))).toBe(true); // автор-повтор → жёсткая ротация
  });
});


describe('порядок чата: события не рвут живые диалоги (10.09.2026)', () => {
  it('системные записи встают за очередью, а не в середину треда', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // длинная серия ответов
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('корпоративный чат')) {
        const name = srv!.snapshot().game.staff[0]!.name;
        return { text: JSON.stringify({ message: { author: name, text: 'Отвечаем, босс!' } }), model: 'fake' };
      }
      return { text: '{}', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'chat_message', text: 'Босс спрашивает: как продвигается проект? '.repeat(5) });

    // ждём: серия началась и её реплика уже в очереди (доставка по неделям — ещё не в чате)
    let queued = 0;
    for (let i = 0; i < 60; i++) {
      await vi.advanceTimersByTimeAsync(50);
      queued = srv.snapshot().chat.queue.filter((m) => m.trigger === 'week' && m.author !== 'Вы').length;
      if (queued > 0) break;
    }
    expect(queued).toBeGreaterThan(0);

    // пока серия «в полёте»: системные записи НЕ выскакивают в чат — встают в очередь
    srv.handle({ type: 'set_autopilot', on: true });
    srv.handle({ type: 'set_autopilot', on: false });
    const snap = srv.snapshot().chat;
    expect(snap.msgs.some((m) => m.text.includes('Босс вернулся'))).toBe(false);
    expect(snap.queue.some((m) => m.text.includes('Босс вернулся'))).toBe(true);
    expect(snap.queue.some((m) => m.text.includes('отдал команде'))).toBe(true);

    // время идёт: всё доставляется, системные записи — ПОСЛЕ реплики серии
    await vi.advanceTimersByTimeAsync(6000);
    const msgs = srv.snapshot().chat.msgs;
    const iReply = msgs.findIndex((m) => m.text.includes('Отвечаем, босс!'));
    const iGive = msgs.findIndex((m) => m.text.includes('отдал команде'));
    const iBack = msgs.findIndex((m) => m.text.includes('Босс вернулся'));
    expect(iReply).toBeGreaterThanOrEqual(0);
    expect(iGive).toBeGreaterThan(iReply);
    expect(iBack).toBeGreaterThan(iReply);
  });

  it('письмо фаната публикуется по текущей неделе (не «старой») и с текстом LLM', async () => {
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('обычный игрок')) return { text: 'Это была великолепная игра, спасибо вам!', model: 'fake' };
      return { text: '{}', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.handle({ type: 'set_speed', v: 8 });
    await vi.advanceTimersByTimeAsync(4000); // игра пожила: неделя уже далеко не 1

    const g = srv.snapshot().game;
    const w0 = g.week;
    expect(w0).toBeGreaterThan(1);
    g.mail.push({
      id: g.mailId + 1, week: 1, year: 1, gameName: 'Тестовая игра', score: 33,
      fanName: 'Алексей', gender: 'M', sentiment: 'love', fansDelta: 0, text: 'заготовка движка', llm: false,
    });
    await vi.advanceTimersByTimeAsync(3000);

    const letter = srv.snapshot().chat.msgs.find((m) => m.author === 'Алексей (фанат)');
    expect(letter).toBeTruthy();
    expect(letter!.text).toContain('великолепная игра'); // текст LLM заменил заготовку
    expect(letter!.week).toBeGreaterThanOrEqual(w0); // дата — неделя ДОСТАВКИ (week: 1 в письме не вылезает в чат)
  });
});

// AP-08 (Ф5): в затишье автопилота чат оживает редкой репликой команды (idle-фаза).
describe('AP-08: idle-фаза в живой сессии', () => {
  it('команда изредка перекидывается репликой, пока босс не вмешивается', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('корпоративный чат')) {
        const name = srv!.snapshot().game.staff[0]!.name;
        const idle = messages.some((m) => m.content.includes('Затишье')); // инструкция idle-фазы
        return { text: JSON.stringify({ message: { author: name, text: idle ? 'Тихо, даже баги спят.' : 'Работаем, босс!' } }), model: 'fake' };
      }
      return { text: '{}', model: 'fake' };
    };
    srv = makeServer(llm);
    srv.snapshot().game.money = 1e6;
    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'set_autopilot', on: true });
    // ~4 минуты реального времени автосессии: обсуждение → план → проект → затишье между фазами
    await vi.advanceTimersByTimeAsync(240000);
    const chat = srv.snapshot().chat;
    const all = [...chat.msgs, ...chat.queue];
    expect(all.some((m) => m.text.includes('баги спят'))).toBe(true); // idle-реплика реально дошла до чата
  });
});
