// PLAN-45: диффы состояния по сокету — корректность (fuzz), компактность кадров и поведение
// серверного потока (полный снапшот → кадры → догон кольцом → полный при переполнении кольца).
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyOps, deepEq, diffOps, type SyncOp } from '../src/shared/sync';
import { GameServer } from '../src/server/game';
import type { LlmFn } from '../src/server/giga';

/** mulberry32 — детерминированный rng для fuzz. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

describe('PLAN-45: diffOps/applyOps — корректность', () => {
  const cases: Array<[string, () => [unknown, unknown]]> = [
    ['примитив', () => [1, 2]],
    ['вложенный set', () => [{ a: { b: 1 } }, { a: { b: 2 } }]],
    ['добавление ключа', () => [{ a: 1 }, { a: 1, b: 2 }]],
    ['удаление ключа', () => [{ a: 1, b: 2 }, { a: 1 }]],
    ['замена типа', () => [{ a: { x: 1 } }, { a: [1, 2] }]],
    ['append массива', () => [{ log: [1, 2] }, { log: [1, 2, 3] }]],
    ['замена элемента массива', () => [{ log: [1, 2, 3] }, { log: [1, 9, 3] }]],
    ['удаление из хвоста', () => [{ log: [1, 2, 3] }, { log: [1] }]],
    ['вставка в середину', () => [{ log: [1, 3] }, { log: [1, 2, 3] }]],
  ];
  for (const [name, make] of cases) {
    it(name, () => {
      const [a, b] = make();
      const ops = diffOps(a, b);
      expect(applyOps(a, ops)).toEqual(b);
    });
  }

  it('равные состояния → пустые ops', () => {
    const s = { a: [1, { x: 2 }], b: { c: 'текст' } };
    expect(diffOps(s, clone(s))).toEqual([]);
  });

  it('кольцо чата: сдвиг головы + дозапись — две операции, не пересылка всего массива', () => {
    const old = Array.from({ length: 800 }, (_, i) => ({ id: i, text: `сообщение ${i}` }));
    const next = [...old.slice(1), { id: 800, text: 'новое' }, { id: 801, text: 'ещё' }];
    const ops = diffOps(old, next);
    expect(applyOps(old, ops)).toEqual(next);
    expect(ops.length).toBe(2);
    expect(ops[0]).toEqual(['a', [], 0, 1, []]);
    expect(JSON.stringify(ops).length).toBeLessThan(200); // хвост из двух коротких сообщений
  });

  it('самолечение прессы: точечная замена одного элемента архива (не вся история)', () => {
    const hist = Array.from({ length: 341 }, (_, i) => ({ id: i, review: ['фолбэк'] }));
    const next = clone(hist);
    next[150]!.review = ['настоящий отзыв 1', 'настоящий отзыв 2'];
    const ops = diffOps(hist, next);
    expect(applyOps(hist, ops)).toEqual(next);
    expect(ops.length).toBe(1); // сплайс ровно одного элемента
    const op = ops[0] as ['a', unknown, number, number, unknown[]];
    expect(op[3]).toBe(1);
    expect(op[4].length).toBe(1);
  });

  it('fuzz: 200 случайных правок — apply(diff(prev, next)) сходится', () => {
    const r = rng(20261003);
    for (let iter = 0; iter < 200; iter++) {
      const prev = makeSample(r);
      const next = clone(prev);
      mutate(r, next);
      const ops = diffOps(prev, next);
      const applied = applyOps(prev as never, ops);
      expect(deepEq(applied, next)).toBe(true);
    }
  });

  it('размер типичного тика на «большом» состоянии — единицы КБ', () => {
    const prev = makeBig();
    const next = clone(prev);
    // обычный тик: деньги, неделя, +1 запись лога, +1 сообщение чата, хвост продаж
    next.game.money += 1234;
    next.game.week += 1;
    next.game.log.push({ id: 90001, text: 'Какой-то текст события недели', week: next.game.week });
    next.chat.msgs.push({ id: 70001, author: 'Игрок', text: 'привет', week: next.game.week });
    const ops = diffOps(prev, next);
    expect(applyOps(prev as never, ops)).toEqual(next);
    const bytes = JSON.stringify({ type: 'state2', base: 1, ver: 2, ops }).length;
    expect(bytes).toBeLessThan(4096);
  });
});

// ─── серверный поток кадров ───

let dir: string | null = null;
let srv: GameServer | null = null;
afterEach(() => {
  srv?.dispose();
  srv = null;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
  dir = null;
});

function makeServer(): GameServer {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-sync-'));
  const llm: LlmFn = async () => ({ text: '{}', model: 'fake' });
  const s = new GameServer({ llm, story: async () => ({ title: 'Т', plot: 'П' }), savePath: path.join(dir, 'save.json'), victory: true });
  s.dispose(); // тикер в тестах не нужен — кадры строим руками через emit()
  return s;
}

/** Клиент-эмулятор: полный снапшот + кадры, как это делает store.ts. */
function makeClient(server: GameServer) {
  const p0 = server.syncPayloadFull();
  let state = JSON.parse(p0.json) as Record<string, unknown>;
  let ver = p0.ver;
  const apply = (f: { full: boolean }): string | null => {
    const p = f.full ? server.syncPayloadFull() : server.syncPayload(ver);
    if (!p) return null;
    const msg = JSON.parse(p.json) as { type: string; base?: number; ver: number; ops?: SyncOp[] };
    if (msg.type === 'state') {
      state = msg as unknown as Record<string, unknown>;
    } else {
      expect(msg.base).toBe(ver); // кадр накладывается строго на текущую версию клиента
      state = applyOps(state as never, msg.ops!) as never;
    }
    ver = msg.ver;
    return p.json;
  };
  return {
    apply,
    get ver() { return ver; },
    set ver(v: number) { ver = v; },
    get state() { return state; },
  };
}

describe('PLAN-45: GameServer — поток кадров', () => {
  it('полный снапшот, кадры тиков: клиент сходится с сервером; размер кадра крошечный', () => {
    srv = makeServer();
    const client = makeClient(srv);
    const sizes: number[] = [];
    const unsub = srv.subscribeSync((f) => {
      const p = client.apply(f);
      if (p) sizes.push(p.length);
    });
    try {
      for (let i = 0; i < 5; i++) {
        srv.snapshot().game.money += 100;
        srv.emit();
      }
      expect(client.ver).toBe(5);
      expect(deepEq(client.state.game, srv.snapshot().game)).toBe(true);
      expect(sizes.length).toBe(5);
      expect(Math.max(...sizes)).toBeLessThan(300); // правка одного числа — сотни байт, не мегабайты
    } finally {
      unsub();
    }
  });

  it('догон кольцом: пропущенные кадры складываются в один state2 базы клиента', () => {
    srv = makeServer();
    const client = makeClient(srv);
    const skipped: string[] = [];
    let lagging = true;
    const unsub = srv.subscribeSync((f) => {
      if (lagging) { // фон: кадры не применяем
        const p = f.full ? srv!.syncPayloadFull() : srv!.syncPayload(client.ver);
        skipped.push(p?.json ?? '');
        return;
      }
      client.apply(f);
    });
    try {
      for (let i = 0; i < 4; i++) { srv.snapshot().game.fans += 10; srv.emit(); }
      lagging = false;
      const p = srv.syncPayload(client.ver); // возврат из фона: догон
      expect(p).not.toBeNull();
      const msg = JSON.parse(p!.json) as { type: string; base: number; ver: number; ops: SyncOp[] };
      expect(msg.type).toBe('state2');
      expect(msg.base).toBe(0);
      expect(msg.ver).toBe(4);
      client.ver = msg.ver;
      const state = applyOps(client.state as never, msg.ops) as { game: { fans: number } };
      expect(state.game.fans).toBe(srv.snapshot().game.fans);
    } finally {
      unsub();
    }
  });

  it('отстал больше кольца — приходит полный снапшот', () => {
    srv = makeServer();
    const client = makeClient(srv);
    const unsub = srv.subscribeSync(() => { /* фон: всё пропускаем */ });
    try {
      for (let i = 0; i < 70; i++) { srv.snapshot().game.week += 1; srv.emit(); }
      const p = srv.syncPayload(client.ver);
      expect(p).not.toBeNull();
      const msg = JSON.parse(p!.json) as { type: string };
      expect(msg.type).toBe('state'); // кольцо не покрывает — полный
    } finally {
      unsub();
    }
  });

  it('syncInvalidate (новая партия/импорт) — всем сигнал full, состояние заменяется', () => {
    srv = makeServer();
    const client = makeClient(srv);
    let fullSignals = 0;
    const unsub = srv.subscribeSync((f) => {
      if (f.full) fullSignals += 1;
      client.apply(f);
    });
    try {
      srv.snapshot().game.money += 5;
      srv.emit();
      // замена состояния целиком, как при new_game/импорте
      srv.syncInvalidate();
      expect(fullSignals).toBe(1);
      expect(deepEq(client.state.game, srv.snapshot().game)).toBe(true);
    } finally {
      unsub();
    }
  });
});

// ─── фикстуры ───

function makeSample(r: () => number): Record<string, unknown> {
  return {
    game: {
      money: Math.floor(r() * 1e6),
      week: Math.floor(r() * 1000),
      log: Array.from({ length: Math.floor(r() * 30) }, (_, i) => ({ id: i, text: `запись ${i}` })),
      staff: Array.from({ length: 3 + Math.floor(r() * 5) }, (_, i) => ({
        id: `s${i}`,
        stats: { program: Math.floor(r() * 50), scenario: Math.floor(r() * 50) },
      })),
      history: [] as unknown[],
      flags: { a: r() < 0.5 ? 1 : 0 },
    },
    chat: { msgs: [] as unknown[], queue: [] as unknown[], phases: {} },
  };
}

function mutate(r: () => number, s: Record<string, unknown>): void {
  const g = s.game as Record<string, unknown>;
  const pick = Math.floor(r() * 7);
  const ri = (n: number) => Math.floor(r() * n);
  if (pick === 0) g.money = Math.floor(r() * 1e6);
  else if (pick === 1) (g.log as Array<{ id: number; text: string }>).push({ id: 1000 + ri(1e6), text: `новое ${r()}` });
  else if (pick === 2) { const log = g.log as unknown[]; if (log.length > 1) log.splice(ri(log.length), 1); }
  else if (pick === 3) {
    const st = g.staff as Array<Record<string, unknown>>;
    const i = ri(st.length);
    (st[i]!.stats as Record<string, unknown>).program = ri(50);
  } else if (pick === 4) (g.staff as unknown[]).push({ id: `new${r()}`, stats: { program: 1 } });
  else if (pick === 5) (g.history as unknown[]).push({ id: 1000 + ri(1e6), name: 'игра', review: ['а', 'б'] });
  else {
    const flags = g.flags as Record<string, unknown>;
    const k = `f${ri(5)}`;
    if (k in flags) delete flags[k]; else flags[k] = ri(100);
  }
}

function makeBig(): { game: { money: number; week: number; log: Array<{ id: number; text: string; week: number }>; staff: unknown[]; history: unknown[] }; chat: { msgs: Array<{ id: number; author: string; text: string; week: number }> } } {
  return {
    game: {
      money: 1e6,
      week: 119000,
      log: Array.from({ length: 500 }, (_, i) => ({ id: i, text: `запись ${i} с текстом подлиннее`, week: i })),
      staff: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, name: `Сотрудник ${i}`, stats: { program: 40, scenario: 30, graphics: 50, sound: 20 }, power: 70 })),
      history: Array.from({ length: 341 }, (_, i) => ({
        id: i, name: `Игра ${i}`, revenue: i * 1000,
        reviewMessages: Array.from({ length: 10 }, (_, j) => `Отзыв ${i}-${j}: довольно длинный текст рецензии`),
      })),
    },
    chat: {
      msgs: Array.from({ length: 800 }, (_, i) => ({ id: i, author: 'Кто-то', text: `сообщение номер ${i} с текстом`, week: i })),
    },
  };
}
