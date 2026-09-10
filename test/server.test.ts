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

describe('GameServer: автопилот и чат', () => {
  it('SRV-03: take_control во время решения отменяет план и хореографию', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // фиксированный сид партии — тест детерминирован
    let resolveDecision: ((text: string) => void) | undefined;
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('старший сотрудник')) {
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

  it('упор направления: решение LLM видит обсуждение чата, упор из плана доходит до хореографии', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let decisionUser = '';
    let resolveDecision: ((text: string) => void) | undefined;
    let replies = 0;
    const llm: LlmFn = async (messages) => {
      const sys = messages[0]?.content ?? '';
      if (sys.includes('старший сотрудник')) {
        decisionUser = messages[1]?.content ?? '';
        return new Promise<{ text: string; model: string }>((resolve) => {
          resolveDecision = (text) => resolve({ text, model: 'fake' });
        });
      }
      if (sys.includes('обычный игрок')) return { text: 'Классная игра!', model: 'fake' }; // письма фанатов — не JSON
      // обсуждение команды: живые реплики с явным упором (авторы чередуются)
      const staff = srv!.snapshot().game.staff;
      const author = staff[replies % staff.length]!.name;
      replies++;
      return { text: JSON.stringify({ message: { author, text: 'Предлагаю упор на нишевость и инновации!' } }), model: 'fake' };
    };
    srv = makeServer(llm);
    srv.snapshot().game.money = 1e6;
    const steps: AutopilotStep[] = [];
    srv.subscribeSteps((s) => steps.push(s));
    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'set_autopilot', on: true }); // кнопка «Отдать управление» (таймаут убран)

    for (let i = 0; i < 160 && !resolveDecision; i++) await vi.advanceTimersByTimeAsync(500);
    expect(resolveDecision).toBeTypeOf('function'); // LLM-решение уже в полёте
    // обсуждение из чата реально попало в промпт решения + бюджет направления из партии
    expect(decisionUser).toContain('Обсуждение команды');
    expect(decisionUser).toContain('нишевость и инновации');
    expect(decisionUser).toContain(`Очки направления: ${srv.snapshot().game.directionPoints}`);

    const base = autopilotProjectInput(srv.snapshot().game);
    expect(base).not.toBeNull();
    resolveDecision!(JSON.stringify({ ...base, direction: { niche: 6, innovation: 4 } }));
    await vi.advanceTimersByTimeAsync(2000);

    const step = steps.find((s) => s.kind === 'plan');
    expect(step).toBeTruthy();
    if (step?.kind === 'plan') {
      expect(step.plan.direction).toMatchObject({ niche: 6, innovation: 4 }); // упор чата доехал до хореографии
      expect(Object.values(step.plan.direction).reduce((a, b) => a + b, 0)).toBe(srv.snapshot().game.directionPoints);
    }
    // игрок видит в чате, на что решила сделать упор команда
    expect(srv.snapshot().chat.msgs.some((m) => m.text.includes('Упор:') && m.text.includes('Нишевость 6'))).toBe(true);
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
      const sys = messages[0]?.content ?? '';
      if (sys.includes('старший сотрудник')) return new Promise<{ text: string; model: string }>(() => { /* решение «висит» — не мешает */ });
      chatPrompts.push(messages[1]?.content ?? '');
      return { text: JSON.stringify({ message: { author: srvName, text: 'Ёлки-палки, давайте уже работать!' } }), model: 'fake' };
    };
    srv = makeServer(llm);
    srvName = srv.snapshot().game.staff[0]!.name; // все реплики — от одного: проверяем ротацию
    srv.snapshot().game.money = 1e6;
    srv.handle({ type: 'set_speed', v: 8 });
    srv.handle({ type: 'set_autopilot', on: true });
    for (let i = 0; i < 160 && chatPrompts.length < 4; i++) await vi.advanceTimersByTimeAsync(500);

    expect(chatPrompts.length).toBeGreaterThanOrEqual(4); // открытие + реплики + повтор выбора автора
    expect(chatPrompts.some((p) => p.includes('Диалог до этого:'))).toBe(true); // реплика видит тред
    expect(chatPrompts.some((p) => p.includes('Ёлки-палки, давайте уже работать!'))).toBe(true); // история содержит реплику
    expect(chatPrompts.some((p) => p.includes('СТРОГО:'))).toBe(true); // автор-повтор → жёсткая ротация
  });
});
