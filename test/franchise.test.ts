// PLAN-52 M1: франшизы, сила бренда и мерч — юнит-тесты (медиа-империя, этап 1).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import { SAVE_VERSION, migrateSave } from '../src/core/migrate';
import {
  buildFranchises, merchDailyNet, merchWeekly, onGameReleased, tickFranchises, tickMerch, toggleMerch,
} from '../src/core/systems/franchise';
import type { GameRecord, GameState } from '../src/core/types';

/** запись архива для теста (в франшизе читаются только эти поля) */
function rec(name: string, genreId: string, typeId: string, score: number, releaseWeek: number): GameRecord {
  return { name, genreId, typeId, score, releaseWeek } as unknown as GameRecord;
}

describe('PLAN-52 M1: франшизы и сила бренда', () => {
  it('сильная игра (80+) рождает франшизу; сиквел растит бренд, провал — роняет', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Космо-Рейнджеры', 'rpg', 'action', 85, 100));
    const f = g.franchises['rpg|action']!;
    expect(f).toBeDefined();
    expect(f.name).toBe('Космо-Рейнджеры');
    expect(f.brand).toBe(85); // старт — оценка игры

    // сиквел-успех: +(оценка − 80) × 0.5
    onGameReleased(g, rec('Космо-Рейнджеры 2', 'rpg', 'action', 90, 200));
    expect(f.brand).toBeCloseTo(85 + 5);
    expect(f.releases.length).toBe(2);

    // провальный сиквел: −(80 − оценка) × 1.0
    onGameReleased(g, rec('Космо-Рейнджеры 3', 'rpg', 'action', 70, 300));
    expect(f.brand).toBeCloseTo(90 - 10);
  });

  it('игра ниже планки франшизу не рождает (но роняет бренд существующей серии)', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Так себе', 'sim', 'strategy', 79, 100));
    expect(g.franchises['sim|strategy']).toBeUndefined();
  });

  it('бренд клэмпится сотней', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Легенда', 'rpg', 'action', 100, 1));
    onGameReleased(g, rec('Легенда 2', 'rpg', 'action', 100, 2));
    expect(g.franchises['rpg|action']!.brand).toBe(100);
  });

  it('забвение: −1 за каждые 52 недели без релиза; новый релиз сбрасывает счётчик', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Тихая серия', 'rpg', 'action', 85, 1));
    const f = g.franchises['rpg|action']!;

    g.week = 100; // прошло неполных полгода
    tickFranchises(g);
    expect(f.brand).toBe(85);

    g.week = 1 + CONFIG.YEAR_LENGTH; // ровно год без релиза
    tickFranchises(g);
    expect(f.brand).toBe(84);
    expect(f.decayed).toBe(1);

    g.week = 1 + CONFIG.YEAR_LENGTH * 3; // три года
    tickFranchises(g);
    expect(f.brand).toBe(82);
    expect(f.decayed).toBe(3);

    // продолжение вышло — счётчик сброшен, дальше год молчания снова списывает
    onGameReleased(g, rec('Тихая серия 2', 'rpg', 'action', 85, g.week));
    expect(f.decayed).toBe(0);
    expect(f.brand).toBeCloseTo(82 + 2.5);
    g.week += CONFIG.YEAR_LENGTH;
    tickFranchises(g);
    expect(f.brand).toBeCloseTo(84.5 - 1);
  });

  it('мерч: путь запуска, доход и остановка', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Плюшевая', 'rpg', 'action', 80, 1));
    const f = g.franchises['rpg|action']!;
    g.fans = 20_000;

    // слабый бренд — отказ
    f.brand = 50;
    expect(toggleMerch(g, 'rpg|action').ok).toBe(false);
    // не хватает денег — отказ
    f.brand = 80;
    g.money = 100;
    expect(toggleMerch(g, 'rpg|action').ok).toBe(false);

    g.money = 1000;
    const res = toggleMerch(g, 'rpg|action');
    expect(res.ok).toBe(true);
    expect(g.money).toBe(700); // 300K на запуск
    expect(f.merch).not.toBeNull();
    expect(f.brand).toBe(81); // +1 к бренду за старт

    // недельный доход: фанаты/1000 × бренд/50 − содержание (20K/нед)
    expect(merchWeekly(f, g.fans)).toBeCloseTo(20 * (81 / 50) - 20);

    // ежедневное начисление в кассу
    const before = g.money;
    tickMerch(g);
    expect(g.money).toBeCloseTo(before + merchDailyNet(g));
    expect(merchDailyNet(g)).toBeGreaterThan(0);

    // остановка: −2 к бренду
    expect(toggleMerch(g, 'rpg|action').ok).toBe(true);
    expect(f.merch).toBeNull();
    expect(f.brand).toBe(Math.max(0, 81 - 2));
  });

  it('buildFranchises пересобирает портфель из архива (путь миграции)', () => {
    const g = newGame(7);
    g.history.push(rec('Хроники', 'rpg', 'action', 85, 100));
    g.history.push(rec('Хроники 2', 'rpg', 'action', 90, 200));
    g.history.push(rec('Мимо кассы', 'sim', 'strategy', 60, 300));
    const map = buildFranchises(g);
    expect(Object.keys(map)).toEqual(['rpg|action']);
    expect(map['rpg|action']!.brand).toBeCloseTo(90);
    expect(map['rpg|action']!.releases.length).toBe(2);
  });

  it('миграция v19: старый сейв получает франшизы из history, версия поднята', () => {
    const g = newGame(11);
    g.history.push(rec('Хроники', 'rpg', 'action', 85, 100));
    g.history.push(rec('Хроники 2', 'rpg', 'action', 90, 200));
    g.franchises = undefined;
    g.saveVersion = 18; // сейв до M1

    migrateSave(g);

    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.franchises!['rpg|action']!.brand).toBeCloseTo(90);
    // идемпотентность: повторная миграция портфель не пересобирает
    const snapshot = JSON.stringify(g.franchises);
    migrateSave(g);
    expect(JSON.stringify(g.franchises)).toBe(snapshot);
  });

  it('новая партия стартует с пустым портфелем', () => {
    const g: GameState = newGame(3);
    expect(g.franchises).toEqual({});
  });
});
