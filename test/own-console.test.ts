// v1.34 (27.09): своя консоль — видна в мастере (allConsoles), резолвится движком (consoleDataFor),
// множитель и стартовая база — от компонентов/фанатов (решения игрока 27.09).
import { describe, expect, it } from 'vitest';
import { newGame, releaseAction, startProjectAction } from '../src/core/engine';
import { consoleDataFor } from '../src/core/systems/dev';
import { tickOwnConsole } from '../src/core/systems/progression';
import { migrateSave } from '../src/core/migrate';
import { ownConsoleCostMult, ownConsoleMult, ownConsoleStartBase } from '../src/shared/consoles';
import { allConsoles } from '../src/shared/meta';
import type { MetaData } from '../src/shared/meta';
import type { ActiveGame, GameState } from '../src/core/types';

/** Готовая своя консоль в состоянии партии. */
function withOwnConsole(g: GameState, opts?: { name?: string; cpu?: string; media?: string }) {
  g.consoles['own-console'] = {
    licensed: true, base: 1000, availableAtWeek: 1, removedAtWeek: null,
    name: opts?.name, cpu: opts?.cpu, media: opts?.media,
  };
}

/** Активный проект, готовый к релизу (по образцу engine.test.ts). */
function debugGame(g: GameState, consoleId = 'own-console'): ActiveGame {
  const ag: ActiveGame = {
    consoleId, genreId: 'table', typeId: 'pirate', mode: 'normal',
    comboGrade: 'C', direction: { cute: 0, realism: 0, approach: 5, niche: 0, simple: 0, innovation: 0, world: 0, polish: 5 },
    points: { fun: 300, creativity: 200, graphics: 150, sound: 150 },
    totalCost: 300, progress: 1, bugs: 0, weekStarted: 1, phase: 'debug',
    proposalStaffId: g.staff[1]!.id,
    assignments: { proposal: [g.staff[1]!.id], program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    contribTotal: {},
    boostOffered: true, boostUsed: false, fame: 10, hype: 10,
    name: '', score: null, judgeScores: [], reviewMessages: [], releaseWeek: null,
    sales: [], totalUnits: 0, totalRevenue: 0, ended: false,
  };
  g.activeGame = ag;
  return ag;
}

describe('своя консоль: множитель от компонентов', () => {
  it('×8 (16-бит + картридж) … ×29 (Картошка + Перфокарты)', () => {
    expect(ownConsoleCostMult(0, 0)).toBe(8);
    expect(ownConsoleCostMult(3, 4)).toBe(29);
    expect(ownConsoleMult('16-bit', 'cartridge')).toBe(8);
    expect(ownConsoleMult('32-bit', 'cd')).toBe(14);
    expect(ownConsoleMult('64-bit', 'dvd')).toBe(20);
    expect(ownConsoleMult(undefined, undefined)).toBe(8); // старый сейв без компонентов
  });

  it('стартовая база — от фанатов (фанаты/25, без потолка)', () => {
    expect(ownConsoleStartBase(0)).toBe(0);
    expect(ownConsoleStartBase(2500)).toBe(100);
    expect(ownConsoleStartBase(100000)).toBe(4000);
  });
});

describe('своя консоль: движок', () => {
  it('consoleDataFor отдаёт синтетику (имя, множитель, база)', () => {
    const g = newGame(1);
    withOwnConsole(g, { name: 'Мечта', cpu: '64-bit', media: 'dvd' });
    const cd = consoleDataFor(g, 'own-console')!;
    expect(cd.name).toBe('Мечта');
    expect(cd.costMult).toBe(20);
    expect(cd.company).toBe('Своя студия');
    expect(cd.licenseCost).toBe(0);
    expect(cd.installBase).toBe(1000);
    expect(consoleDataFor(g, 'pc-game')?.name).toBe('PC Game'); // рыночные — из справочника

    g.consoles['own-portable'] = { licensed: true, base: 0, availableAtWeek: 1, removedAtWeek: null };
    const legacy = consoleDataFor(g, 'own-portable')!;
    expect(legacy.name).toBe('Своя консоль'); // старый сейв без имени
    expect(legacy.costMult).toBe(8);
  });

  it('allConsoles добавляет свою консоль в список платформ (мастер/«Железо»)', () => {
    const g = newGame(1);
    const meta = { consoles: [] } as unknown as MetaData;
    withOwnConsole(g, { name: 'Мечта', cpu: '32-bit', media: 'cd' });
    const list = allConsoles(meta, g);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('own-console');
    expect(list[0]!.name).toBe('Мечта');
    expect(list[0]!.costMult).toBe(14);
    expect(list[0]!.installBase).toBe(1000);
    // нелицензированная своя консоль в список не попадает
    g.consoles['own-console']!.licensed = false;
    expect(allConsoles(meta, g)).toHaveLength(0);
  });

  it('стройка завершается: имя/компоненты сохраняются, база — от фанатов', () => {
    const g = newGame(1);
    g.fans = 50000;
    g.ownConsole = {
      name: 'Мечта', type: 'console', cpu: '32-bit', media: 'cd',
      cost: 21000, weeksTotal: 3, progress: 2,
    };
    tickOwnConsole(g); // последний день стройки
    expect(g.ownConsole).toBeNull();
    const cs = g.consoles['own-console']!;
    expect(cs.name).toBe('Мечта');
    expect(cs.cpu).toBe('32-bit');
    expect(cs.base).toBe(2000); // 50000 / 25
    expect(cs.licensed).toBe(true);
  });

  it('старт проекта под свою консоль проходит, стоимость — с её множителем', () => {
    const g = newGame(1);
    g.money = 50000;
    withOwnConsole(g, { name: 'Мечта', cpu: '32-bit', media: 'cd' });
    const res = startProjectAction(g, {
      consoleId: 'own-console', genreId: 'table', typeId: 'pirate', mode: 'normal',
      direction: { approach: 5, polish: 5 },
      proposalStaffId: g.staff[1]!.id,
      assignments: { program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    });
    expect(res.ok).toBe(true);
    expect(g.activeGame?.consoleId).toBe('own-console');
    // база 50K (20+30) × ×14 × 2.44 — как в мастере
    expect(g.activeGame!.totalCost).toBeCloseTo(50 * 14 * 2.44, 4);
  });

  it('релиз под свою консоль проходит: продажи и рост базы', () => {
    const g = newGame(1);
    g.money = 50000;
    withOwnConsole(g, { name: 'Мечта', cpu: '32-bit', media: 'cd' });
    debugGame(g);
    const res = releaseAction(g);
    expect(res.ok).toBe(true);
    expect(g.history[0]!.units).toBeGreaterThan(0); // база 1000 → есть продажи
    expect(g.consoles['own-console']!.base).toBe(1093); // +93 за релиз
  });

  it('миграция v9→v12: у старой своей консоли база 0 → от фанатов', () => {
    const g = newGame(1);
    g.saveVersion = 9;
    g.fans = 25000;
    g.consoles['own-console'] = { licensed: true, base: 0, availableAtWeek: 1, removedAtWeek: null };
    migrateSave(g);
    expect(g.consoles['own-console']!.base).toBe(1000);
    expect(g.saveVersion).toBe(16); // каскад миграций доводит до текущей (v1.53: Э3 точки времени саги)
  });
});
