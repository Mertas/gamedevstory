// аудит-51 05-P2-6 / 01-P2-13: финал партии — после завершения истории показываем счёт по активам
// (капитал) и отпускаем в свободную игру; письмо двадцатилетия — один раз, ровно на 20-й год.
import { expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame, tick } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { createRng } from '../src/core/rng';
import { tickFanLetters } from '../src/core/systems/mail';
import { resolveFinale, tickFinale } from '../src/core/systems/finale';
import { finaleReport } from '../src/shared/finale';
import type { GameRecord, GameState } from '../src/core/types';

/** Партия с завершённой сагой (эпилог отыгран, stage 'done'). */
function sagaDoneGame(seed = 11): GameState {
  const g = newGame(seed);
  g.saga = {
    node: 'E6',
    stage: 'done',
    flags: [],
    artifacts: [],
    trust: {},
    scales: {},
    roles: {},
    startWeek: g.week,
    lastWeek: g.week,
    lastGap: 0,
  };
  return g;
}

it('сага завершена → итог партии: капитал зафиксирован, попап выставлен', () => {
  const g = sagaDoneGame();
  g.money = 12345;
  tickFinale(g);
  expect(g.finale).toBeDefined();
  expect(g.finale!.worth).toBe(12345);
  expect(g.finale!.shown).toBe(false);
  expect(g.pendingEvent).toMatchObject({ type: 'finale' });
});

it('интеграция: полный tick тоже замечает конец истории', () => {
  const g = sagaDoneGame();
  tick(g);
  expect(g.finale).toBeDefined();
  expect(g.pendingEvent).toMatchObject({ type: 'finale' });
});

it('капитал замораживается: деньги после финала счёт не меняют', () => {
  const g = sagaDoneGame();
  g.money = 500;
  tickFinale(g);
  g.money = 99999;
  tickFinale(g);
  expect(g.finale!.worth).toBe(500);
});

it('занятая сцена: итог ждёт очереди и не перетирает текущее событие', () => {
  const g = sagaDoneGame();
  g.pendingEvent = { type: 'info', title: 't', text: 'x' };
  tickFinale(g);
  expect(g.finale).toBeDefined();
  expect(g.pendingEvent).toMatchObject({ type: 'info' });
  g.pendingEvent = null;
  tickFinale(g);
  expect(g.pendingEvent).toMatchObject({ type: 'finale' });
});

it('«Играть дальше»: попап снимается и больше не показывается', () => {
  const g = sagaDoneGame();
  tickFinale(g);
  const res = resolveFinale(g);
  expect(res.ok).toBe(true);
  expect(g.pendingEvent).toBeNull();
  tickFinale(g);
  expect(g.pendingEvent).toBeNull();
});

it('без саги (SAGA_ENABLED=false) финал — на 20-м году', () => {
  const old = CONFIG.SAGA_ENABLED;
  CONFIG.SAGA_ENABLED = false;
  try {
    const g = newGame(5);
    g.week = 20 * 365 - 1;
    g.year = 20;
    tickFinale(g);
    expect(g.finale).toBeUndefined();
    g.week = 20 * 365;
    tickFinale(g);
    expect(g.finale).toBeDefined();
  } finally {
    CONFIG.SAGA_ENABLED = old;
  }
});

it('письмо двадцатилетия: ровно один раз, ровно на 20-й год', () => {
  const g = newGame(7);
  const before = g.mail.length;
  g.week = 20 * 365 - 1;
  g.year = 20;
  tickFanLetters(g, createRng(42));
  expect(g.mail.length).toBe(before);
  g.week = 20 * 365;
  tickFanLetters(g, createRng(42));
  const last = g.mail[g.mail.length - 1];
  expect(last?.kind).toBe('anniversary');
  expect(last?.llm).toBe(true);
  expect(last?.gameName).toBe('');
  expect(g.anniversary20).toBe(true);
  const n = g.mail.length;
  tickFanLetters(g, createRng(42));
  expect(g.mail.length).toBe(n);
});

it('finaleReport: счёт, годы, лучшая игра, награды, фанаты, консоль', () => {
  const g = newGame(9);
  g.week = 9709; // ~26.6 лет — как финал саги по ритму Э3
  g.year = 27;
  g.finale = { shown: true, week: 9709, worth: 7777 };
  g.fans = 150000;
  g.awards = { grand: 2, design: 1, music: 0, runnerUp: 3, worst: 0 };
  g.history.push({ name: 'Тихая', score: 70, units: 100 } as unknown as GameRecord);
  g.history.push({ name: 'Комета', score: 93, units: 1200 } as unknown as GameRecord);
  const r = finaleReport(g);
  expect(r.worth).toBe(7777);
  expect(r.years).toBe(26);
  expect(r.yearsLabel).toBe('1985–2011');
  expect(r.best?.name).toBe('Комета');
  expect(r.best?.score).toBe(93);
  expect(r.awards.grand).toBe(2);
  expect(r.awards.runnerUp).toBe(3);
  expect(r.fans).toBe(150000);
  expect(r.consoleName).toBeNull();
  expect(r.gamesCount).toBe(2);
});

it('миграция 18: старым сейвам за 20 лет письмо задним числом не шлём', () => {
  expect(SAVE_VERSION).toBe(22); // v22: PLAN-53 иерархия (bossId, seats); v21: телевидение; v20: линии мерча и паки карточек; v19: франшизы (медиа-империя)
  const old20 = newGame(3);
  old20.week = 7500;
  old20.year = 21;
  old20.saveVersion = 17;
  delete old20.anniversary20;
  const m = migrateSave(old20);
  expect(m.anniversary20).toBe(true);

  const young = newGame(4);
  young.saveVersion = 17;
  delete young.anniversary20;
  const m2 = migrateSave(young);
  expect(m2.anniversary20).toBeUndefined();
});
