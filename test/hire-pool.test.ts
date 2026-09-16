// M7: найм — «слои таланта» (метод поиска = свой круг кандидатов), платный поиск,
// список живёт в сейве до следующего поиска, спец-сотрудники открываются наградами.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import type { HireMethodId } from '../src/core/config';
import { newGame, tick, searchAction, hireFromSearchAction } from '../src/core/engine';
import { candidateBand } from '../src/core/systems/staff';
import { HIRE_BANDS, MYSTERY_IDS, MYSTERY_ORDER, unlockedMystery } from '../src/shared/hire';
import { STAFF } from '../src/core/data/db';
import { createRng } from '../src/core/rng';

const METHODS = Object.keys(CONFIG.HIRE_METHODS) as HireMethodId[];

/** партия, в которой PC уже продаётся (тик проходит календарь) */
function started(): ReturnType<typeof newGame> {
  const g = newGame(11);
  tick(g);
  return g;
}

describe('M7: слои таланта у методов поиска', () => {
  it('слои не пересекаются, все id существуют в справочнике', () => {
    const seen = new Set<string>();
    for (const m of METHODS) {
      for (const id of HIRE_BANDS[m]) {
        expect(STAFF.some((d) => d.id === id), `${m}: ${id} нет в STAFF`).toBe(true);
        expect(seen.has(id), `${id} в двух слоях`).toBe(false);
        seen.add(id);
      }
    }
  });

  it('все нанимаемые (кроме стартовых и спецов) разложены по слоям — данные не потеряны', () => {
    const covered = new Set(METHODS.flatMap((m) => HIRE_BANDS[m]));
    for (const d of STAFF) {
      if (MYSTERY_IDS.has(d.id)) continue;
      if (d.unlock === 'Initially available') continue;
      expect(covered.has(d.id), `${d.name} (${d.id}) не попал ни в один слой`).toBe(true);
    }
  });

  it('у «по знакомству» самые слабые, у Голливуда — самые сильные (Σ статов растёт с ценой)', () => {
    const strength = (m: HireMethodId): number => {
      const sum = HIRE_BANDS[m].reduce((a, id) => {
        const d = STAFF.find((x) => x.id === id)!;
        return a + d.stats.program + d.stats.scenario + d.stats.graphics + d.stats.sound;
      }, 0);
      return sum / HIRE_BANDS[m].length;
    };
    const order: HireMethodId[] = ['word-of-mouth', 'magazine', 'online', 'vocational', 'open-house', 'hollywood'];
    for (let i = 1; i < order.length; i++) {
      expect(strength(order[i]!), `слой ${order[i]} слабее предыдущего`).toBeGreaterThan(strength(order[i - 1]!));
    }
  });

  it('поиск списывает деньги сразу и даёт до 3 кандидатов из слоя', () => {
    const g = started();
    const before = g.money;
    const res = searchAction(g, 'magazine');
    expect(res.ok).toBe(true);
    expect(g.money).toBe(before - CONFIG.HIRE_METHODS.magazine.cost);
    expect(g.activeSearch?.method).toBe('magazine');
    expect(g.activeSearch?.ids.length).toBeGreaterThan(0);
    expect(g.activeSearch?.ids.length).toBeLessThanOrEqual(CONFIG.HIRE_CANDIDATES);
    for (const id of g.activeSearch!.ids) expect(HIRE_BANDS.magazine).toContain(id);
  });

  it('тот же сид — тот же поиск (детерминизм)', () => {
    const a = started();
    const b = started();
    expect(searchAction(a, 'online').candidates).toEqual(searchAction(b, 'online').candidates);
  });

  it('повторный поиск снова платный (дважды за журнал — двойная плата)', () => {
    const g = started();
    const before = g.money;
    searchAction(g, 'word-of-mouth');
    searchAction(g, 'word-of-mouth');
    expect(g.money).toBe(before - 2 * CONFIG.HIRE_METHODS['word-of-mouth'].cost);
  });

  it('поиск без денег отклоняется', () => {
    const g = started();
    g.money = 10;
    const res = searchAction(g, 'hollywood');
    expect(res.ok).toBe(false);
  });

  it('найм из списка: списывается только взнос, список живёт и уменьшается', () => {
    const g = started();
    searchAction(g, 'magazine');
    const ids = [...g.activeSearch!.ids];
    const first = STAFF.find((d) => d.id === ids[0])!;
    const before = g.money;
    const res = hireFromSearchAction(g, ids[0]!);
    expect(res.ok).toBe(true);
    expect(g.money).toBe(before - first.hireFee); // только взнос, поиск уже оплачен
    expect(g.staff.some((s) => s.id === ids[0])).toBe(true);
    expect(g.activeSearch!.ids).not.toContain(ids[0]);

    if (ids.length > 1) {
      const second = STAFF.find((d) => d.id === ids[1])!;
      const before2 = g.money;
      expect(hireFromSearchAction(g, ids[1]!).ok).toBe(true);
      expect(g.money).toBe(before2 - second.hireFee);
      expect(g.activeSearch!.ids.length).toBe(ids.length - 2);
    }
  });

  it('нанять кандидата не из списка нельзя', () => {
    const g = started();
    searchAction(g, 'magazine');
    // шумен: берём id из другого слоя
    const outsider = HIRE_BANDS.online.find((id) => !g.hiredIds.includes(id))!;
    expect(hireFromSearchAction(g, outsider).ok).toBe(false);
  });

  it('без поиска найм невозможен', () => {
    const g = started();
    const id = HIRE_BANDS['word-of-mouth'][0]!;
    const res = hireFromSearchAction(g, id);
    expect(res.ok).toBe(false);
  });
});

describe('M7: спец-сотрудники (Голливуд, по одному)', () => {
  it('пока награды нет — в списках не появляются', () => {
    const g = started();
    for (const id of MYSTERY_ORDER) {
      expect(candidateBand(g, 'hollywood')).not.toContain(id);
      expect(unlockedMystery(g)).toBeNull();
    }
    const rng = createRng(5);
    for (let i = 0; i < 20; i++) {
      const picks = [...g.activeSearch?.ids ?? []];
      void picks;
      const roll = searchAction(g, 'hollywood');
      if (roll.ok) for (const id of g.activeSearch!.ids) expect(MYSTERY_IDS.has(id)).toBe(false);
      void rng;
    }
  });

  it('2-й офис открывает Мистера X: он гарантированно в списке Голливуда', () => {
    const g = started();
    g.officeLevel = 3; // метод «Голливуд» требует офис 3 (Мистер X открывается уже во 2-м — награда придёт раньше канала найма)
    g.money = 20000;
    expect(unlockedMystery(g)).toBe('mister-x');
    const res = searchAction(g, 'hollywood');
    expect(res.ok).toBe(true);
    expect(g.activeSearch!.ids).toContain('mister-x');
  });

  it('нанял Мистера X — следующим открытым идёт Кинг Акбар (2-й офис + игра-миллионник)', () => {
    const g = started();
    g.officeLevel = 3;
    g.money = 20000;
    searchAction(g, 'hollywood');
    expect(hireFromSearchAction(g, 'mister-x').ok).toBe(true);
    expect(g.hiredIds).toContain('mister-x');
    expect(unlockedMystery(g)).toBeNull(); // Акбару нужен ещё миллионник
    g.history.push({ units: 1_000_000 } as (typeof g.history)[number]);
    expect(unlockedMystery(g)).toBe('king-ackbar');
  });

  it('Гран-при открывает Гризли/Чимпу/Кайробота по порядку, одновременно — один', () => {
    const g = started();
    g.officeLevel = 3;
    g.money = 20000;
    g.awards.grand = 5;
    g.history.push({ units: 1_000_000 } as (typeof g.history)[number]); // Акбар тоже открыт
    // порядок: сначала Мистер X (офис 2), затем Кинг Акбар, потом Гризли (1 Гран-при), Чимпа (3), Кайробот (5)
    expect(unlockedMystery(g)).toBe('mister-x');
    g.hiredIds.push('mister-x');
    expect(unlockedMystery(g)).toBe('king-ackbar');
    g.hiredIds.push('king-ackbar');
    expect(unlockedMystery(g)).toBe('grizzly-bearington');
    const res = searchAction(g, 'hollywood');
    expect(res.ok).toBe(true);
    const mysteries = g.activeSearch!.ids.filter((id) => MYSTERY_IDS.has(id));
    expect(mysteries).toEqual(['grizzly-bearington']);
  });

  it('спецы не появляются в других методах, только в Голливуде', () => {
    const g = started();
    g.officeLevel = 3;
    g.awards.grand = 5;
    for (const m of METHODS.filter((x) => x !== 'hollywood')) {
      const res = searchAction(g, m);
      if (res.ok) for (const id of g.activeSearch!.ids) expect(MYSTERY_IDS.has(id)).toBe(false);
    }
  });
});
