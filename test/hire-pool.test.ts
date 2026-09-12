// PLAN-25: пул кандидатов у движка и у интерфейса — ОДИН и тот же список.
// Раньше правило было скопировано в двух местах и разошлось: автопилот выбирал кандидата,
// которого UI не показывал, и кнопки «Нанять» для него не существовало.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame, tick } from '../src/core/engine';
import { candidatePool as corePool } from '../src/core/systems/staff';
import { candidatePool as uiPool, type MetaData } from '../src/shared/meta';
import { STAFF } from '../src/core/data/db';

const meta = { staff: STAFF } as unknown as MetaData;

describe('PLAN-25: пул кандидатов один для движка и интерфейса', () => {
  it('по каждому методу найма списки совпадают и порядок тот же', () => {
    const g = newGame(11);
    tick(g); // PC поступила в продажу
    for (const method of Object.keys(CONFIG.HIRE_METHODS) as (keyof typeof CONFIG.HIRE_METHODS)[]) {
      const core = corePool(g, method);
      const ui = uiPool(g, meta, CONFIG.HIRE_METHODS[method].pool);
      expect(ui, `метод ${method}`).toEqual(core);
    }
  });

  it('«сразу доступные» попадают в методы с пулом Word of Mouth (Dee Coder в «Объявлении в журнале»)', () => {
    const g = newGame(11);
    tick(g);
    expect(g.hiredIds).not.toContain('dee-coder'); // стартовая пара — не Dee Coder
    expect(uiPool(g, meta, CONFIG.HIRE_METHODS.magazine.pool)).toContain('dee-coder');
  });

  it('нанятый сотрудник выпадает из пула у обоих', () => {
    const g = newGame(11);
    tick(g);
    g.hiredIds.push('dee-coder');
    expect(corePool(g, 'magazine')).not.toContain('dee-coder');
    expect(uiPool(g, meta, CONFIG.HIRE_METHODS.magazine.pool)).not.toContain('dee-coder');
  });
});
