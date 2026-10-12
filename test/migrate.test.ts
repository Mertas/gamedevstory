// аудит-51 01-P2-7: repair консолей — старый сейв доводится до полного списка CONSOLES.
import { describe, expect, it } from 'vitest';
import { migrateSave } from '../src/core/migrate';
import { CONSOLES } from '../src/core/data/db';
import { newGame } from '../src/core/engine';

describe('migrate: repair консолей (аудит-51 01-P2-7)', () => {
  it('пропавшая консоль добавляется по данным, существующие записи не трогаются', () => {
    const g = newGame(7);
    const keep = CONSOLES[0]!;
    const victim = CONSOLES[Math.min(3, CONSOLES.length - 1)]!;
    g.consoles[keep.id]!.base = 12345; // у «старой» записи свои значения
    delete g.consoles[victim.id]; // консоль появилась в данных позже старта партии

    const out = migrateSave(g);

    expect(out.consoles[victim.id]).toBeDefined();
    expect(out.consoles[victim.id]!.base).toBe(victim.installBase);
    expect(out.consoles[victim.id]!.licensed).toBe(victim.licenseCost === 0);
    expect(out.consoles[victim.id]!.availableAtWeek).toBeNull();
    expect(out.consoles[victim.id]!.removedAtWeek).toBeNull();
    // уже имеющаяся запись не перезаписана
    expect(out.consoles[keep.id]!.base).toBe(12345);
  });

  it('идемпотентность: повторный прогон не меняет сейв', () => {
    const g = newGame(7);
    const once = migrateSave(g);
    const snapshot = JSON.stringify(once.consoles);
    const twice = migrateSave(once);
    expect(JSON.stringify(twice.consoles)).toBe(snapshot);
  });
});
