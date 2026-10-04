// PLAN-44: сюжетные линии — арки «Оффер», «Выгорание», «Игра мечты», арки-взаимодействия
// («Спор самолюбий», «Наставник», «Старые против новых»), процедурные квесты (v1.40: раз в
// год, генератор questgen.ts) и миграции v11–v12.
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

const ALL_ARCS = ['offer', 'burnout', 'dream', 'rivalry', 'mentorship', 'generations'] as const;

/** Пометить арку закрытой (чтобы протестировать следующую по очереди). */
function closeArc(g: GameState, id: string): void {
  g.story = g.story ?? { arcs: {}, flags: {} };
  g.story.arcs[id] = { step: 2, done: true };
}

/** Закрыть все арки, кроме указанной (проверяем конкретную арку). */
function only(g: GameState, keep: (typeof ALL_ARCS)[number]): void {
  for (const id of ALL_ARCS) if (id !== keep) closeArc(g, id);
}

/** Закрыть все авторские арки (проверяем процедурный квест). */
function noArcs(g: GameState): void {
  for (const id of ALL_ARCS) closeArc(g, id);
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
  only(g, 'offer');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
  expect(g.story?.arcs.offer?.staffId).toBe(g.staff[0]!.id);
  expect(g.story?.arcs.offer?.staffName).toBe(g.staff[0]!.name);
});

it('raise: −200K, сотрудник остаётся; эпилог через 8 недель: +стат и +150 фанатов', () => {
  const g = ready();
  only(g, 'offer');
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
  only(g, 'offer');
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
  only(g, 'offer');
  tickStory(g, R);
  const id = g.staff[0]!.id;
  const m0 = g.money;
  expect(resolveStory(g, 'letgo', createRng(1)).ok).toBe(true);
  expect(g.money).toBe(m0 + 150);
  expect(g.staff.some((s) => s.id === id)).toBe(false);
});

it('деньги важны: raise без 200K не проходит, событие остаётся', () => {
  const g = ready();
  only(g, 'offer');
  tickStory(g, R);
  g.money = 10;
  const res = resolveStory(g, 'raise', createRng(1));
  expect(res.ok).toBe(false);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'offer', step: 1 });
});

// ─── Арка «Выгорание» (M2) ───

it('«Выгорание»: с 45-й недели; отпуск −100K → через 6 недель эпилог +4 стат и +50 фанатов', () => {
  const g = ready(3, 2, 50);
  only(g, 'burnout');
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
  only(broken, 'burnout');
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
  only(coped, 'burnout');
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

it('«Игра мечты»: обещание → релиз нужного жанра в срок (полгода) → +5 стат и +150 фанатов', () => {
  const g = ready(3, 3, 75);
  only(g, 'dream');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 1 });
  const arc = g.story!.arcs.dream!;
  expect(arc.genreId).toBeTruthy();
  expect(arc.startWeek).toBe(75);

  expect(resolveStory(g, 'promise', R).ok).toBe(true);
  expect(g.story!.arcs.dream!.waitUntil).toBe(255); // v1.40: полгода (180 недель) на мечту

  g.history.push({ genreId: arc.genreId, releaseWeek: 200 } as GameRecord);
  g.week = 255;
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
  only(g, 'dream');
  tickStory(g, R);
  expect(resolveStory(g, 'promise', R).ok).toBe(true);
  g.week = 255;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 3 });
  const fans0 = g.fans;
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(g.fans).toBe(fans0);
  expect(g.story!.arcs.dream!.done).toBe(true);
});

it('«Игра мечты» отказ: вежливый эпилог и закрытие арки', () => {
  const g = ready(3, 3, 75);
  only(g, 'dream');
  tickStory(g, R);
  expect(resolveStory(g, 'decline', R).ok).toBe(true);
  tickStory(g, R); // waitUntil = текущая неделя — ответ придёт сразу следующим днём
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'dream', step: 4 });
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(g.story!.arcs.dream!.done).toBe(true);
});

// ─── Арки-взаимодействия между сотрудниками (v1.39.0) ───

it('«Спор самолюбий»: с 25-й недели; код-дуэль −50K → через 6 недель +2 обоим', () => {
  const g = ready(3, 1, 30);
  only(g, 'rivalry');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'rivalry', step: 1 });
  const arc = g.story!.arcs.rivalry!;
  expect(arc.staffId).toBeTruthy();
  expect(arc.staffId2).toBeTruthy();
  expect(arc.staffId2).not.toBe(arc.staffId);

  const m0 = g.money;
  expect(resolveStory(g, 'contest', R).ok).toBe(true);
  expect(g.money).toBe(m0 - 50);
  expect(g.story!.arcs.rivalry!.waitUntil).toBe(36);

  g.week = 36;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'rivalry', step: 2 });
  const s1 = g.staff.find((s) => s.id === arc.staffId)!;
  const s2 = g.staff.find((s) => s.id === arc.staffId2)!;
  const b1 = s1.stats[bestOf(s1)];
  const b2 = s2.stats[bestOf(s2)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(s1.stats[bestOf(s1)]).toBe(b1 + 2);
  expect(s2.stats[bestOf(s2)]).toBe(b2 + 2);
  expect(g.story!.arcs.rivalry!.done).toBe(true);
});

it('«Спор самолюбий»: «пусть сами» → через 4 недели рулетка; неудача — осадок −2', () => {
  const g = ready(3, 1, 30);
  only(g, 'rivalry');
  tickStory(g, R);
  const arc = g.story!.arcs.rivalry!;
  expect(resolveStory(g, 'ignore', R).ok).toBe(true);
  expect(arc.waitUntil).toBe(34);

  g.week = 34;
  tickStory(g, failRng()); // ролл «осадок»
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'rivalry', step: 3 });
  const s1 = g.staff.find((s) => s.id === arc.staffId)!;
  const b1 = s1.stats[bestOf(s1)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(s1.stats[bestOf(s1)]).toBe(b1 - 2);
});

it('«Наставник»: с 32-й недели; наставничество → новичку +4, ветерану +1', () => {
  const g = ready(3, 1, 35);
  g.staff[0]!.stats = { program: 200, scenario: 100, graphics: 100, sound: 100 }; // ветеран, 500
  g.staff[1]!.stats = { program: 30, scenario: 20, graphics: 10, sound: 10 }; // новичок, 70
  only(g, 'mentorship');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'mentorship', step: 1 });
  const arc = g.story!.arcs.mentorship!;
  expect(arc.staffId).toBe(g.staff[0]!.id); // сильнейший — ветеран
  expect(arc.staffId2).toBe(g.staff[1]!.id); // слабейший — новичок

  expect(resolveStory(g, 'mentor', R).ok).toBe(true);
  expect(arc.waitUntil).toBe(41);

  g.week = 41;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'mentorship', step: 2 });
  const student = g.staff.find((s) => s.id === arc.staffId2)!;
  const mentor = g.staff.find((s) => s.id === arc.staffId)!;
  const bs = student.stats[bestOf(student)];
  const bm = mentor.stats[bestOf(mentor)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(student.stats[bestOf(student)]).toBe(bs + 4);
  expect(mentor.stats[bestOf(mentor)]).toBe(bm + 1);
  expect(g.story!.arcs.mentorship!.done).toBe(true);
});

it('«Наставник»: «не отвлекать ветерана» → новичок сам +1', () => {
  const g = ready(3, 1, 35);
  g.staff[0]!.stats = { program: 200, scenario: 100, graphics: 100, sound: 100 };
  g.staff[1]!.stats = { program: 30, scenario: 20, graphics: 10, sound: 10 };
  only(g, 'mentorship');
  tickStory(g, R);
  const arc = g.story!.arcs.mentorship!;
  expect(resolveStory(g, 'decline', R).ok).toBe(true);
  expect(arc.waitUntil).toBe(39);

  g.week = 39;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'mentorship', step: 3 });
  const student = g.staff.find((s) => s.id === arc.staffId2)!;
  const bs = student.stats[bestOf(student)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(student.stats[bestOf(student)]).toBe(bs + 1);
});

it('«Старые против новых»: поддержка ветерана → он +2, молодой −1', () => {
  const g = ready(3, 2, 45);
  g.staff[1]!.careers[g.staff[1]!.activeCareer] = 1; // молодой явно ниже уровнем
  only(g, 'generations');
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'generations', step: 1 });
  const arc = g.story!.arcs.generations!;
  expect(arc.staffId).toBe(g.staff[0]!.id); // ветеран — Lv2
  expect(arc.staffId2).toBe(g.staff[1]!.id); // молодой — Lv1

  expect(resolveStory(g, 'veteran', R).ok).toBe(true);
  expect(arc.waitUntil).toBe(50);

  g.week = 50;
  tickStory(g, R);
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'generations', step: 2 });
  const vet = g.staff.find((s) => s.id === arc.staffId)!;
  const young = g.staff.find((s) => s.id === arc.staffId2)!;
  const bv = vet.stats[bestOf(vet)];
  const by = young.stats[bestOf(young)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(vet.stats[bestOf(vet)]).toBe(bv + 2);
  expect(young.stats[bestOf(young)]).toBe(by - 1);
});

it('«Старые против новых»: «каждый по-своему» → рулетка; удача — синтез +2 обоим', () => {
  const g = ready(3, 2, 45);
  g.staff[1]!.careers[g.staff[1]!.activeCareer] = 1;
  only(g, 'generations');
  tickStory(g, R);
  const arc = g.story!.arcs.generations!;
  expect(resolveStory(g, 'both', R).ok).toBe(true);
  g.week = 50;
  tickStory(g, luckyRng()); // ролл «синтез»
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'generations', step: 4 });
  const vet = g.staff.find((s) => s.id === arc.staffId)!;
  const young = g.staff.find((s) => s.id === arc.staffId2)!;
  const bv = vet.stats[bestOf(vet)];
  const by = young.stats[bestOf(young)];
  expect(resolveStory(g, 'ok', R).ok).toBe(true);
  expect(vet.stats[bestOf(vet)]).toBe(bv + 2);
  expect(young.stats[bestOf(young)]).toBe(by + 2);
  expect(g.story!.arcs.generations!.done).toBe(true);
});

// ─── Процедурные квесты (v1.40) ───

it('после авторской арки годовой слот сдвигается на год (+365)', () => {
  const g = ready();
  only(g, 'offer');
  tickStory(g, R);
  expect(resolveStory(g, 'raise', R).ok).toBe(true);
  g.week = 68;
  tickStory(g, R);
  expect(resolveStory(g, 'ok', R).ok).toBe(true); // арка закрыта
  expect(g.story!.arcs.offer!.done).toBe(true);
  expect(g.story!.flags.nextQuestWeek).toBe(68 + 365);
});

it('процедурный квест: приходит на годовом слоте; «судиться» тратит сумму из params', () => {
  const g = ready();
  noArcs(g);
  tickStory(g, failRng());
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'quest', step: 1 });
  const gen = g.story!.arcs.quest!.gen!;
  expect(gen.template).toBe('pirates'); // первый валидный при int→0
  expect(gen.options.length).toBeGreaterThanOrEqual(2);

  const m0 = g.money;
  const fans0 = g.fans;
  expect(resolveStory(g, 'sue', failRng()).ok).toBe(true); // неудачный ролл: −A, +5 фанатов
  expect(g.money).toBe(m0 - (gen.params.a ?? 0));
  expect(g.fans).toBe(fans0 + 5);
  expect(g.story!.arcs.quest!.done).toBe(true);
  expect(g.story!.flags.nextQuestWeek).toBe(g.week + 365);
});

it('до слота квест не приходит; через год — новый, прошлый шаблон не повторяется', () => {
  const g = ready();
  noArcs(g);
  tickStory(g, failRng());
  const fans0 = g.fans;
  expect(resolveStory(g, 'ignore', R).ok).toBe(true); // закрываем «пиратов»
  expect(g.fans).toBe(Math.max(0, fans0 - 10));
  const next = g.story!.flags.nextQuestWeek!;
  expect(next).toBe(60 + 365);

  g.week = next - 1;
  tickStory(g, failRng());
  expect(g.pendingEvent).toBeNull(); // ещё не год

  g.week = next;
  tickStory(g, failRng());
  expect(g.pendingEvent).toEqual({ type: 'story', arcId: 'quest', step: 1 });
  expect(g.story!.arcs.quest!.gen!.template).not.toBe('pirates'); // подряд не повторяем
});

// ─── Миграция ───

it('миграция v10 → v12: каркас story появляется, слот квестов ставится (+60 от недели)', () => {
  const g = newGame(1);
  g.saveVersion = 10;
  delete (g as { story?: unknown }).story;
  const m = migrateSave(g);
  expect(m.story!.arcs).toEqual({});
  expect(m.story!.flags.nextQuestWeek).toBe(m.week + 60);
  expect(m.saveVersion).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(13);
});

it('миграция v11 → v12: слот квестов появляется; уже стоявший слот не трогаем', () => {
  const g = newGame(1);
  g.saveVersion = 11;
  g.week = 100;
  g.story!.flags = {};
  const m = migrateSave(g);
  expect(m.story!.flags.nextQuestWeek).toBe(160);

  const g2 = newGame(1);
  g2.saveVersion = 11;
  g2.story!.flags = { nextQuestWeek: 500 };
  const m2 = migrateSave(g2);
  expect(m2.story!.flags.nextQuestWeek).toBe(500);
});
