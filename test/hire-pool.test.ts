// M7: найм — «слои таланта» (метод поиска = свой круг кандидатов), платный поиск,
// список живёт в сейве до следующего поиска, спец-сотрудники открываются наградами.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import type { HireMethodId } from '../src/core/config';
import { newGame, tick, searchAction, hireFromSearchAction } from '../src/core/engine';
import { candidateBand } from '../src/core/systems/staff';
import { HIRE_BANDS, MYSTERY_IDS, MYSTERY_ORDER, unlockedMystery } from '../src/shared/hire';
import { STAFF } from '../src/core/data/db';

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

describe('M7: спец-сотрудники: награды, по одному, в своём методе', () => {
  it('пока награды нет — не появляются нигде (9 млн — ещё не 10)', () => {
    const g = started();
    g.money = 9_000;
    for (const m of METHODS) expect(unlockedMystery(g, m)).toBeNull();
    for (const id of MYSTERY_ORDER) expect(candidateBand(g, 'hollywood')).not.toContain(id);
  });

  it('Мистер X: 10 млн на балансе — появляется в Профучилище и только там', () => {
    const g = started();
    g.officeLevel = 2; // профучилище доступно со 2-го офиса
    g.money = 10_000;
    expect(unlockedMystery(g, 'vocational')).toBe('mister-x');
    expect(unlockedMystery(g, 'hollywood')).toBeNull();
    expect(unlockedMystery(g, 'open-house')).toBeNull();
    const res = searchAction(g, 'vocational');
    expect(res.ok).toBe(true);
    expect(g.activeSearch!.ids).toContain('mister-x');
  });

  it('Кинг Акбар: 2-й офис + игра-миллионник — появляется в «Дне открытых дверей»', () => {
    const g = started();
    g.officeLevel = 2;
    g.money = 20_000;
    expect(unlockedMystery(g, 'open-house')).toBeNull(); // миллионника ещё нет
    g.history.push({ units: 1_000_000, score: 50 } as (typeof g.history)[number]);
    expect(unlockedMystery(g, 'open-house')).toBe('king-ackbar');
    expect(unlockedMystery(g, 'vocational')).toBe('mister-x'); // X открыт, но он в своём методе
    const res = searchAction(g, 'open-house');
    expect(res.ok).toBe(true);
    expect(g.activeSearch!.ids).toContain('king-ackbar');
  });

  it('Гризли: 100 млн на балансе; Чимпа: 99/100; Кайробот: 100/100 — Голливуд, по одному', () => {
    const g = started();
    g.officeLevel = 3;
    g.money = 100_000;
    expect(unlockedMystery(g, 'hollywood')).toBe('grizzly-bearington');
    g.hiredIds.push('grizzly-bearington');
    expect(unlockedMystery(g, 'hollywood')).toBeNull(); // Чимпа/Кайробот оценкой ещё не открыты
    g.history.push({ units: 5, score: 99 } as (typeof g.history)[number]);
    expect(unlockedMystery(g, 'hollywood')).toBe('chimpan-z-force');
    g.hiredIds.push('chimpan-z-force');
    expect(unlockedMystery(g, 'hollywood')).toBeNull();
    g.history.push({ units: 5, score: 100 } as (typeof g.history)[number]);
    expect(unlockedMystery(g, 'hollywood')).toBe('kairobot');
    const res = searchAction(g, 'hollywood');
    expect(res.ok).toBe(true);
    const mysteries = g.activeSearch!.ids.filter((id) => MYSTERY_IDS.has(id));
    expect(mysteries).toEqual(['kairobot']);
  });

  it('в чужих методах спецы не показываются (X — только профучилище и т.д.)', () => {
    const g = started();
    g.officeLevel = 3;
    g.money = 200_000; // с запасом: поиск тоже тратит баланс, а Гризли требует 100 млн НА БАЛАНСЕ
    g.history.push({ units: 1_000_000, score: 100 } as (typeof g.history)[number]); // все награды взяты
    const own: Record<string, string> = { vocational: 'mister-x', 'open-house': 'king-ackbar', hollywood: 'grizzly-bearington' };
    for (const m of METHODS) {
      const res = searchAction(g, m);
      const picks = res.ok ? g.activeSearch!.ids.filter((id) => MYSTERY_IDS.has(id)) : [];
      const want = own[m];
      if (want) expect(picks, `метод ${m}`).toEqual([want]);
      else expect(picks, `метод ${m}`).toEqual([]);
    }
  });
});
