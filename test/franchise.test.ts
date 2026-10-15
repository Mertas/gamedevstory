// PLAN-52 M1/M2: франшизы, сила бренда, линии мерча и паки карточек — юнит-тесты.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import { SAVE_VERSION, migrateSave } from '../src/core/migrate';
import type { Rng } from '../src/core/rng';
import {
  ackCardPack, buildFranchises, cardPackWait, merchDailyNet, merchSlots, merchStartCost, merchWeekly,
  merchWeeklyEst, onGameReleased, openCardPack, tickFranchises, tickMerch, toggleMerch,
} from '../src/core/systems/franchise';
import type { GameRecord, GameState } from '../src/core/types';

/** запись архива для теста (в франшизе читаются только эти поля) */
function rec(name: string, genreId: string, typeId: string, score: number, releaseWeek: number): GameRecord {
  return { name, genreId, typeId, score, releaseWeek } as unknown as GameRecord;
}

/** rng-заглушка: next() идёт по заданной последовательности (последнее значение повторяется) */
function stubRng(nexts: number[]): Rng {
  let i = 0;
  return {
    next: () => nexts[Math.min(i++, nexts.length - 1)],
    int: (a: number) => a,
    chance: (p: number) => p > 0,
    state: 0,
  } as unknown as Rng;
}

/** партия с одной франшизой «Космо-Рейнджеры» (бренд 85) */
function franchiseState(): GameState {
  const g = newGame(7);
  g.franchises = {};
  onGameReleased(g, rec('Космо-Рейнджеры', 'rpg', 'action', 85, 100));
  return g;
}

describe('PLAN-52 M1: франшизы и сила бренда', () => {
  it('сильная игра (80+) рождает франшизу; сиквел растит бренд, провал — роняет', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Космо-Рейнджеры', 'rpg', 'action', 85, 100));
    const f = g.franchises!['rpg|action']!;
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
    expect(g.franchises!['rpg|action']!.brand).toBe(100);
  });

  it('забвение: −1 за каждые 52 недели без релиза; новый релиз сбрасывает счётчик', () => {
    const g = newGame(7);
    g.franchises = {};
    onGameReleased(g, rec('Тихая серия', 'rpg', 'action', 85, 1));
    const f = g.franchises!['rpg|action']!;

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

  it('мерч: путь запуска, доход и остановка (нормальные вложения = поведение M1)', () => {
    const g = franchiseState();
    const f = g.franchises!['rpg|action']!;
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
    expect(g.money).toBe(700); // 300K на запуск (фигурки, нормально)
    expect(f.merch).not.toBeNull();
    expect(f.brand).toBe(81); // +1 к бренду за старт
    expect(f.merch!.line).toBe('figures');
    expect(f.merch!.budget).toBe('norm');

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
});

describe('PLAN-52 M2: линии мерча', () => {
  it('линии открываются эпохами: плюш — с 1990-го, карточки — с 1996-го', () => {
    const g = franchiseState();
    const f = g.franchises!['rpg|action']!;
    f.brand = 80;
    g.money = 100_000;

    // 1985: доступны только фигурки
    g.week = 1;
    expect(toggleMerch(g, 'rpg|action', 'plush').ok).toBe(false);
    expect(toggleMerch(g, 'rpg|action', 'cards').ok).toBe(false);
    expect(toggleMerch(g, 'rpg|action', 'figures').ok).toBe(true);
    expect(toggleMerch(g, 'rpg|action').ok).toBe(true); // стоп

    // последний день 1989-го — плюш ещё закрыт; первый день 1990-го — открыт
    g.week = 5 * CONFIG.YEAR_LENGTH;
    expect(toggleMerch(g, 'rpg|action', 'plush').ok).toBe(false);
    g.week = 5 * CONFIG.YEAR_LENGTH + 1;
    expect(toggleMerch(g, 'rpg|action', 'plush').ok).toBe(true);

    // 1995: карточки закрыты; 1996: открываются (место плюша освобождаем)
    g.week = 11 * CONFIG.YEAR_LENGTH;
    toggleMerch(g, 'rpg|action'); // остановить плюш
    expect(toggleMerch(g, 'rpg|action', 'cards').ok).toBe(false); // эпоха ещё не пришла
    g.week = 11 * CONFIG.YEAR_LENGTH + 1;
    expect(toggleMerch(g, 'rpg|action', 'cards').ok).toBe(true);
    expect(f.merch!.line).toBe('cards');
  });

  it('слоты линий: 2 на первом офисе, 4 на втором, 8 после финала', () => {
    const g = franchiseState();
    onGameReleased(g, rec('Гонки', 'racing', 'action', 85, 100));
    onGameReleased(g, rec('Стратегия', 'sim', 'strategy', 85, 100));
    g.money = 100_000;

    expect(merchSlots(g)).toBe(2); // офис 1
    expect(toggleMerch(g, 'rpg|action', 'figures').ok).toBe(true);
    expect(toggleMerch(g, 'racing|action', 'figures').ok).toBe(true);
    expect(toggleMerch(g, 'sim|strategy', 'figures').ok).toBe(false); // все слоты заняты

    g.officeLevel = 2;
    expect(merchSlots(g)).toBe(4);
    expect(toggleMerch(g, 'sim|strategy', 'figures').ok).toBe(true);

    g.finale = { shown: false, week: g.week, worth: 0 };
    expect(merchSlots(g)).toBe(8); // эндгейм: империя развернулась
  });

  it('вложения: скромно дешевле и бьёт по бренду, солидно — дороже и сильнее', () => {
    const g = franchiseState();
    const f = g.franchises!['rpg|action']!;
    f.brand = 70;
    g.money = 100_000;
    g.fans = 10_000;

    expect(merchStartCost('figures', 'low')).toBe(180); // 300 × 0.6
    expect(merchStartCost('figures', 'high')).toBe(540); // 300 × 1.8

    expect(toggleMerch(g, 'rpg|action', 'figures', 'low').ok).toBe(true);
    expect(f.brand).toBe(68); // −2
    expect(merchWeekly(f, g.fans)).toBeCloseTo((g.fans / 1000) * (68 / 50) * 0.85 - 20);
    expect(merchWeeklyEst(g.fans, 68, 'figures', 'low')).toBeCloseTo(merchWeekly(f, g.fans));

    toggleMerch(g, 'rpg|action'); // стоп: −2 → 66
    expect(f.brand).toBeCloseTo(66);
    expect(toggleMerch(g, 'rpg|action', 'figures', 'high').ok).toBe(true);
    expect(f.brand).toBeCloseTo(68); // +2
    expect(merchWeekly(f, g.fans)).toBeCloseTo((g.fans / 1000) * (68 / 50) * 1.15 - 20);
  });
});

describe('PLAN-52 M2: паки коллекционных карточек', () => {
  it('пак вскрывается только по линии карточек; редкости, кулдаун и подтверждение работают', () => {
    const g = franchiseState();
    const f = g.franchises!['rpg|action']!;
    f.brand = 80;
    g.money = 100_000;
    g.fans = 10_000;

    // линия фигурок — паки недоступны
    expect(toggleMerch(g, 'rpg|action', 'figures').ok).toBe(true);
    expect(openCardPack(g, 'rpg|action', stubRng([0.9])).ok).toBe(false);

    // с 1996-го запускаем линию карточек
    g.week = 11 * CONFIG.YEAR_LENGTH + 1;
    toggleMerch(g, 'rpg|action'); // стоп фигурок
    expect(toggleMerch(g, 'rpg|action', 'cards').ok).toBe(true);
    expect(f.merch!.line).toBe('cards');

    // пак из пяти обычных: минимум по 120 живых душ за карту, бренд не меняется
    const moneyBefore = g.money;
    const fansBefore = g.fans;
    const brandBefore = f.brand;
    expect(openCardPack(g, 'rpg|action', stubRng([0.9, 0.9, 0.9, 0.9, 0.9])).ok).toBe(true);
    expect(g.money).toBeCloseTo(moneyBefore - CONFIG.CARD_PACK_COST);
    expect(g.fans).toBe(fansBefore + 5 * 120);
    expect(f.brand).toBeCloseTo(brandBefore);
    expect(g.cards!.last!.cards).toHaveLength(CONFIG.CARD_PACK_SIZE);
    expect(g.cards!.last!.cards.every((c) => c.rarity === 'common')).toBe(true);
    expect(g.cards!.last!.cards.every((c) => c.name.length > 0)).toBe(true); // на карте — игра серии
    expect(g.cards!.last!.fansGained).toBe(5 * 120);

    // пока мини-окно не подтверждено, acked=false; кулдаун не даёт вскрыть следующий
    expect(g.cards!.last!.acked).toBe(false);
    expect(cardPackWait(g)).toBe(CONFIG.CARD_PACK_COOLDOWN);
    expect(openCardPack(g, 'rpg|action', stubRng([0.9])).ok).toBe(false);

    ackCardPack(g);
    expect(g.cards!.last!.acked).toBe(true);

    // через квартал — снова можно; легендарка приводит фанатов и греет бренд
    g.week += CONFIG.CARD_PACK_COOLDOWN;
    expect(cardPackWait(g)).toBe(0);
    const fans2 = g.fans;
    const brand2 = f.brand;
    expect(openCardPack(g, 'rpg|action', stubRng([0.01, 0.9, 0.9, 0.9, 0.9])).ok).toBe(true);
    expect(g.fans - fans2).toBe(1200 + 4 * 120); // легендарка: max(8% фанатов, 1200)
    expect(f.brand).toBeCloseTo(Math.min(100, brand2 + CONFIG.CARD_PACK_TABLE[0]!.brand));
    expect(g.cards!.last!.cards.some((c) => c.rarity === 'legend')).toBe(true);
  });
});

describe('PLAN-52: миграции и пересборка', () => {
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

  it('миграция v18 → текущая: франшизы выводятся из history, паки создаются', () => {
    const g = newGame(11);
    g.history.push(rec('Хроники', 'rpg', 'action', 85, 100));
    g.history.push(rec('Хроники 2', 'rpg', 'action', 90, 200));
    g.franchises = undefined;
    g.cards = undefined;
    g.saveVersion = 18; // сейв до M1

    migrateSave(g);

    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.franchises!['rpg|action']!.brand).toBeCloseTo(90);
    expect(g.cards).toEqual({ lastWeek: -9999, last: null });
    // идемпотентность: повторная миграция портфель не пересобирает
    const snapshot = JSON.stringify([g.franchises, g.cards]);
    migrateSave(g);
    expect(JSON.stringify([g.franchises, g.cards])).toBe(snapshot);
  });

  it('миграция v20: старая линия мерча получает «нормальные» вложения', () => {
    const g = franchiseState();
    const f = g.franchises!['rpg|action']!;
    f.merch = { startedWeek: 10, line: 'figures' } as unknown as typeof f.merch; // сейв v19: без budget
    g.cards = undefined;
    g.saveVersion = 19;

    migrateSave(g);

    expect(f.merch!.budget).toBe('norm');
    expect(f.merch!.startedWeek).toBe(10); // остальное не потревожено
    expect(g.saveVersion).toBe(SAVE_VERSION);
  });

  it('новая партия стартует с пустым портфелем и паками по умолчанию', () => {
    const g: GameState = newGame(3);
    expect(g.franchises).toEqual({});
    expect(g.cards).toEqual({ lastWeek: -9999, last: null });
  });
});
