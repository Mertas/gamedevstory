// PLAN-44: сюжетные линии — арка «Оффер» (завязка, выбор, эпилог) и миграция v11.
import { expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { createRng, type Rng } from '../src/core/rng';
import { resolveStory, tickStory } from '../src/core/systems/story';
import type { GameRecord, GameState } from '../src/core/types';

function ready(seed = 3): GameState {
  const g = newGame(seed);
  g.history.push({} as GameRecord, {} as GameRecord); // 2 релиза
  g.week = 60;
  g.staff[0]!.careers[g.staff[0]!.activeCareer] = 2; // Lv2+
  return g;
}

function failRng(): Rng {
  return { int: (a: number) => a, chance: () => false, state: 0 } as unknown as Rng;
}

it('свежая студия: арка молчит', () => {
  const g = newGame(3);
  tickStory(g);
  expect(g.pendingEvent).toBeNull();
});

it('с 60-й недели и двух релизов приходит «Оффер» (участник Lv2+)', () => {
  const g = ready();
  tickStory(g);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
  expect(g.story?.arcs.offer?.staffId).toBe(g.staff[0]!.id);
  expect(g.story?.arcs.offer?.staffName).toBe(g.staff[0]!.name);
});

it('raise: −200K, сотрудник остаётся; эпилог через 8 недель: +стат и +150 фанатов', () => {
  const g = ready();
  tickStory(g);
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'raise', createRng(1)).ok).toBe(true);
  expect(g.money).toBe(m0 - 200);
  expect(g.staff.some((s) => s.id === id)).toBe(true);
  expect(g.story!.arcs.offer!.outcome).toBe('stay');
  expect(g.story!.arcs.offer!.waitUntil).toBe(68);

  g.week = 68;
  tickStory(g);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 2 });
  const staff = g.staff.find((s) => s.id === id)!;
  const stats = ['program', 'scenario', 'graphics', 'sound'] as const;
  const best = stats.reduce((a, b) => ((staff.stats[b] ?? 0) > (staff.stats[a] ?? 0) ? b : a));
  const before = staff.stats[best];
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', createRng(2)).ok).toBe(true);
  expect(staff.stats[best]).toBe(before + 5);
  expect(g.fans).toBe(fans0 + 150);
  expect(g.story!.arcs.offer!.done).toBe(true);
});

it('talk с провалом: сотрудник уходит; эпилог «письмо» даёт +100 фанатов', () => {
  const g = ready();
  tickStory(g);
  const id = g.staff[0]!.id;
  expect(resolveStory(g, 'talk', failRng()).ok).toBe(true);
  expect(g.staff.some((s) => s.id === id)).toBe(false);
  expect(g.story!.arcs.offer!.outcome).toBe('left');

  g.week = 68;
  tickStory(g);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 3 });
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', createRng(2)).ok).toBe(true);
  expect(g.fans).toBe(fans0 + 100);
  expect(g.story!.arcs.offer!.done).toBe(true);
});

it('letgo: +150K и сотрудник уходит', () => {
  const g = ready();
  tickStory(g);
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'letgo', createRng(1)).ok).toBe(true);
  expect(g.money).toBe(m0 + 150);
  expect(g.staff.some((s) => s.id === id)).toBe(false);
});

it('деньги важны: raise без 200K не проходит, событие остаётся', () => {
  const g = ready();
  tickStory(g);
  g.money = 10;
  const res = resolveStory(g, 'raise', createRng(1));
  expect(res.ok).toBe(false);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
});

it('миграция v10 → v11: каркас story появляется, версия поднимается', () => {
  const g = newGame(1);
  g.saveVersion = 10;
  delete (g as { story?: unknown }).story;
  const m = migrateSave(g);
  expect(m.story).toEqual({ arcs: {}, flags: {} });
  expect(m.saveVersion).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(11);
});
