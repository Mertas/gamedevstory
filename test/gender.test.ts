// Родовые формы (11.10.2026): пары {муж/жен@ключ}, пол героя по аватарке, имена по полу.
import { expect, it } from 'vitest';
import { applyGenderSlots, gform } from '../src/shared/gender';
import { avatarGender, heroNameIdeasFor, HERO_NAME_IDEAS } from '../src/shared/hero';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';

it('gform: форма по полу; без слэша и без рода — мужская (поведение легаси-данных)', () => {
  expect(gform('пошёл/пошла', 'M')).toBe('пошёл');
  expect(gform('пошёл/пошла', 'F')).toBe('пошла');
  expect(gform('пошёл/пошла', undefined)).toBe('пошёл');
  expect(gform('сам/сама', 'F')).toBe('сама');
  expect(gform('без слэша', 'F')).toBe('без слэша');
  expect(gform('вернулся отдохнувшим/вернулась отдохнувшей', 'F')).toBe('вернулась отдохнувшей');
});

it('applyGenderSlots: @ключ и fallback; неизвестный род — пара остаётся (вычитка)', () => {
  expect(applyGenderSlots('{name} {вырос/выросла@name2}', { name2: 'F' })).toBe('{name} выросла');
  expect(applyGenderSlots('{вырос/выросла@name}', { name: 'M' })).toBe('вырос');
  expect(applyGenderSlots('{сам/сама} передумает', {}, 'F')).toBe('сама передумает');
  expect(applyGenderSlots('{сам/сама} передумает', {})).toBe('{сам/сама} передумает');
  expect(applyGenderSlots('{сам/сама@нет}', { name: 'F' })).toBe('{сам/сама@нет}');
});

it('applyGenderSlots: обычные плейсхолдеры не трогает; пары с пробелами, несколько на строку', () => {
  expect(applyGenderSlots('{name} и {name2} пришли', { name: 'F', name2: 'M' })).toBe('{name} и {name2} пришли');
  expect(applyGenderSlots('но {сам не подойдёт/сама не подойдёт@name}: гордость', { name: 'F' }))
    .toBe('но сама не подойдёт: гордость');
  expect(applyGenderSlots('{затаил/затаила@name} обиду и {выстоял/выстояла@name}', { name: 'F' }))
    .toBe('затаила обиду и выстояла');
});

it('avatarGender: нечётные аватарки — парни, чётные — девушки; мусор — парень (как легаси)', () => {
  expect(avatarGender('player-01')).toBe('M');
  expect(avatarGender('player-02')).toBe('F');
  expect(avatarGender('player-10')).toBe('F');
  expect(avatarGender('player-19')).toBe('M');
  expect(avatarGender('player-20')).toBe('F');
  expect(avatarGender('player-00')).toBe('M');
  expect(avatarGender('нет-такой')).toBe('M');
});

it('heroNameIdeasFor: имена по полу; общий список = оба набора (совместимость)', () => {
  const m = heroNameIdeasFor('M');
  const f = heroNameIdeasFor('F');
  expect(m).toContain('Артём Пикселев');
  expect(f).toContain('Алиса Пикселева');
  expect(m.length).toBe(25);
  expect(f.length).toBe(25);
  expect([...m, ...f]).toEqual(HERO_NAME_IDEAS);
});

it('migrateSave v13→v14: пол героя выравнивается по аватарке; остальных не трогает', () => {
  const g = newGame(7);
  const base = g.staff[0]!;
  g.staff.push({ ...base, id: 'hero', hero: true, avatarId: 'player-02', gender: 'M' });
  g.saveVersion = 13;
  const m = migrateSave(g);
  expect(m.staff.find((s) => s.id === 'hero')!.gender).toBe('F'); // чётная аватарка — девушка
  expect(m.staff.find((s) => s.id === base.id)!.gender).toBe(base.gender);
  expect(m.saveVersion).toBe(SAVE_VERSION);
});
