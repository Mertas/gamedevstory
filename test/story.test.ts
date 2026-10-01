// PLAN-44: сюжетные линии — арки «Оффер», «Выгорание», «Игра мечты» и миграция v11.
import { expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { createRng, type Rng } from '../src/core/rng';
import { resolveStory, tickStory } from '../src/core/systems/story';
import type { GameRecord, GameState } from '../src/core/types';

function ready(seed = 3, releases = 2, week = 60): GameState {
  const g = newGame(seed);
  for (let i = 0; i < releases; i++) g.history.push({} as GameRecord);
  g.week = week;
  g.staff[0]!.careers[g.staff[0]!.activeCareer] = 2; // Lv2+
  return g;
}

/** Пометить арку закрытой (чтобы протестировать следующую по очереди). */
function closeArc(g: GameState, id: string): void {
  g.story = g.story ?? { arcs: {}, flags: {} };
  g.story.arcs[id] = { step: 2, done: true };
}

function failRng(): Rng {
  return { int: (a: number) => a, chance: () => false, state: 0 } as unknown as Rng;
}

function luckyRng(): Rng {
  return { int: (a: number) => a, chance: () => true, state: 0 } as unknown as Rng;
}

const R = createRng(5);
const stats = ['program', 'scenario', 'graphics', 'sound'] as const;
const bestOf = (s: GameState['staff'][number]) =>
  stats.reduce((a, b) => ((s.stats[b] ?? 0) > (s.stats[a] ?? 0) ? b : a));

it('свежая студия: арки молчат', () => {
  const g = newGame(3);
  tickStory(g, R);
  expect(g.pendingEvent).toBeNull();
});

// ─── Арка «Оффер» ───

it('с 60-й недели и двух релизов приходит «Оффер» (участник Lv2+)', () => {
  const g = ready();
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
  expect(g.story?.arcs.offer?.staffId).toBe(g.staff[0]!.id);
  expect(g.story?.arcs.offer?.staffName).toBe(g.staff[0]!.name);
});

it('raise: −200K, сотрудник остаётся; эпилог через 8 недель: +стат и +150 фанатов', () => {
  const g = ready();
  tickStory(g, R);
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'raise', createRng(1)).ok).toBe(true);
  expect(g.money).toBe(m0 - 200);
  expect(g.staff.some((s) => s.id === id)).toBe(true);
  expect(g.story!.arcs.offer!.outcome).toBe('stay');
  expect(g.story!.arcs.offer!.waitUntil).toBe(68);

  g.week = 68;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 2 });
  const staff = g.staff.find((s) => s.id === id)!;
  const best = bestOf(staff);
  const before = staff.stats[best];
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', createRng(2)).ok).toBe(true);
  expect(staff.stats[best]).toBe(before + 5);
  expect(g.fans).toBe(fans0 + 150);
  expect(g.story!.arcs.offer!.done).toBe(true);
});

it('talk с провалом: сотрудник уходит; эпилог «письмо» даёт +100 фанатов', () => {
  const g = ready();
  tickStory(g, R);
  const id = g.staff[0]!.id;
  expect(resolveStory(g, 'talk', failRng()).ok).toBe(true);
  expect(g.staff.some((s) => s.id === id)).toBe(false);
  expect(g.story!.arcs.offer!.outcome).toBe('left');

  g.week = 68;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 3 });
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', createRng(2)).ok).toBe(true);
  expect(g.fans).toBe(fans0 + 100);
  expect(g.story!.arcs.offer!.done).toBe(true);
});

it('letgo: +150K и сотрудник уходит', () => {
  const g = ready();
  tickStory(g, R);
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'letgo', createRng(1)).ok).toBe(true);
  expect(g.money).toBe(m0 + 150);
  expect(g.staff.some((s) => s.id === id)).toBe(false);
});

it('деньги важны: raise без 200K не проходит, событие остаётся', () => {
  const g = ready();
  tickStory(g, R);
  g.money = 10;
  const res = resolveStory(g, 'raise', createRng(1));
  expect(res.ok).toBe(false);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
});

// ─── Арка «Выгорание» (M2) ───

it('«Выгорание»: с 45-й недели; отпуск −100K → через 6 недель эпилог +4 стат и +50 фанатов', () => {
  const g = ready(3, 2, 50);
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'burnout', step: 1 });
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'rest', R).ok).toBe(true);
  expect(g.money).toBe(m0 - 100);
  expect(g.story!.arcs.burnout!.outcome).toBe('rest');
  expect(g.story!.arcs.burnout!.waitUntil).toBe(56);

  g.week = 56;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'burnout', step: 2 });
  const staff = g.staff.find((s) => s.id === id)!;
  const best = bestOf(staff);
  const before = staff.stats[best];
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(staff.stats[best]).toBe(before + 4);
  expect(g.fans).toBe(fans0 + 50);
  expect(g.story!.arcs.burnout!.done).toBe(true);
});

it('«Выгорание» риск: 50/50 — «сломался» (−3 стата) или «вытянул» (+2)', () => {
  const broken = ready(3, 2, 50);
  tickStory(broken, R);
  expect(resolveStory(broken, 'risk', R).ok).toBe(true);
  expect(broken.story!.arcs.burnout!.waitUntil).toBe(54);
  broken.week = 54;
  tickStory(broken, failRng()); // ролл «сломался»
  expect(broken.pendingEvent).toEqual({ type: 'story', arcId: 'burnout', step: 3 });
  const s1 = broken.staff[0]!;
  const b1 = s1.stats[bestOf(s1)];
  expect(resolveStory(broken, 'ok', R).ok).toBe(true);
  expect(s1.stats[bestOf(s1)]).toBe(b1 - 3);
  expect(broken.story!.arcs.burnout!.done).toBe(true);

  const coped = ready(3, 2, 50);
  tickStory(coped, R);
  resolveStory(coped, 'risk', R);
  coped.week = 54;
  tickStory(coped, luckyRng()); // ролл «вытянул»
  expect(coped.pendingEvent).toEqual({ type: 'story', arcId: 'burnout', step: 4 });
  const s2 = coped.staff[0]!;
  const b2 = s2.stats[bestOf(s2)];
  expect(resolveStory(coped, 'ok', R).ok).toBe(true);
  expect(s2.stats[bestOf(s2)]).toBe(b2 + 2);
});

// ─── Арка «Игра мечты» (M2) ───

it('«Игра мечты»: обещание → релиз нужного жанра в срок → +5 стат и +150 фанатов', () => {
  const g = ready(3, 3, 75);
  closeArc(g, 'offer');
  closeArc(g, 'burnout');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 1 });
  const arc = g.story!.arcs.dream!;
  expect(arc.genreId).toBeTruthy();
  expect(arc.startWeek).toBe(75);

  expect(resolveStory(g, 'promise', R).ok).toBe(true);
  expect(g.story!.arcs.dream!.waitUntil).toBe(115); // 40 недель на мечту

  g.history.push({ genreId: arc.genreId, releaseWeek: 100 } as GameRecord);
  g.week = 115;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 2 });
  const staff = g.staff.find((s) => s.id === arc.staffId)!;
  const best = bestOf(staff);
  const before = staff.stats[best];
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(staff.stats[best]).toBe(before + 5);
  expect(g.fans).toBe(fans0 + 150);
  expect(g.story!.arcs.dream!.done).toBe(true);
});

it('«Игра мечты» не сбылась: без релиза эпилог «подождёт», наград нет', () => {
  const g = ready(3, 3, 75);
  closeArc(g, 'offer');
  closeArc(g, 'burnout');
  tickStory(g, R);
  expect(resolveStory(g, 'promise', R).ok).toBe(true);
  g.week = 115;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 3 });
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(g.fans).toBe(fans0);
  expect(g.story!.arcs.dream!.done).toBe(true);
});

it('«Игра мечты» отказ: вежливый эпилог и закрытие арки', () => {
  const g = ready(3, 3, 75);
  closeArc(g, 'offer');
  closeArc(g, 'burnout');
  tickStory(g, R);
  expect(resolveStory(g, 'decline', R).ok).toBe(true);
  tickStory(g, R); // waitUntil = текущая неделя — ответ придёт сразу следующим днём
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 4 });
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(g.story!.arcs.dream!.done).toBe(true);
});

// ─── Миграция ───

it('миграция v10 → v11: каркас story появляется, версия поднимается', () => {
  const g = newGame(1);
  g.saveVersion = 10;
  delete (g as { story?: unknown }).story;
  const m = migrateSave(g);
  expect(m.story).toEqual({ arcs: {}, flags: {} });
  expect(m.saveVersion).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(11);
});
