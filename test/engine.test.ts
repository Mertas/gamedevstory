// Регрессионные тесты на проводки, которые были сломаны:
// 1) жизненный цикл консолей (появление по дате + анонсы в логе);
// 2) хайп/известность реально влияют на продажи при релизе;
// 3) семантика буста: отказ ≠ использован, успех = +хайп, провал = только баги.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { advanceWeeks, newGame, releaseAction, resolveBoostAction, resolveEventAction, resolveGamedexAction, startProjectAction, tick } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { autopilotProjectInput } from '../src/core/sim/policy';
import { isUnlocked } from '../src/shared/rules';
import { levelUpNotice, nextRank, RANKS, rankFor } from '../src/shared/rank';
import { resolveBoost } from '../src/core/systems/dev';
import { consoleAvailable } from '../src/core/systems/dev';
import { dateToDay, dailySales, tickMediaEvents } from '../src/core/systems/market';
import { tickFanLetters } from '../src/core/systems/mail';
import { isValidGameState, migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { dateLabel as sharedDateLabel } from '../src/shared/meta';
import type { ActiveGame, GameRecord, GameState } from '../src/core/types';

// исход буста после resolveBoost — читается отдельной функцией: сужение свойства
// g.pendingEvent не сбрасывается вызовом, внутри функции тип честный
function boostResultOutcome(g: GameState): 'success' | 'fail' | null {
  const ev = g.pendingEvent;
  return ev?.type === 'boost_result' ? ev.outcome : null;
}

// тип текущего события (тот же приём: сужение свойства не переживает вызовы/присваивания)
function pendingType(g: GameState): string | null {
  return g.pendingEvent?.type ?? null;
}

// активный проект в фазе debug (как после разработки) — для релиза без прогона 100+ дней
function debugGame(g: GameState, hype: number): ActiveGame {
  const ag: ActiveGame = {
    consoleId: 'pc-game', genreId: 'table', typeId: 'pirate', mode: 'normal',
    comboGrade: 'C', direction: { cute: 0, realism: 0, approach: 5, niche: 0, simple: 0, innovation: 0, world: 0, polish: 5 },
    points: { fun: 300, creativity: 200, graphics: 150, sound: 150 },
    totalCost: 300, progress: 1, bugs: 0, weekStarted: 1, phase: 'debug',
    proposalStaffId: g.staff[1]!.id,
    assignments: { proposal: [g.staff[1]!.id], program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    contribTotal: {},
    boostOffered: true, boostUsed: false, fame: 10, hype,
    name: '', score: null, judgeScores: [], reviewMessages: [], releaseWeek: null,
    sales: [], totalUnits: 0, totalRevenue: 0, ended: false,
  };
  g.activeGame = ag;
  return ag;
}

describe('25.09: архив хранит все игры — история релизов не режется', () => {
  it('новый релиз не вытесняет старые записи (старого предела 32 нет)', () => {
    const g = newGame(1);
    g.money = 5000;
    for (let i = 0; i < 40; i++) {
      const old: GameRecord = {
        name: `Старая-${i + 1}`, genreId: 'rpg', typeId: 'fantasy', consoleId: 'pc-game',
        score: 80, units: 100, revenue: 1000, releaseWeek: 10 + i, year: 1,
        attrs: { fun: 1, creativity: 1, graphics: 1, sound: 1 }, bugs: 0, bugsTotal: 0, awards: [],
      };
      g.history.push(old);
    }
    debugGame(g, 10);
    const res = releaseAction(g);
    expect(res.ok).toBe(true);
    expect(g.history).toHaveLength(41); // 40 старых + новый релиз
    expect(g.history[0]!.name).toBe('Старая-1'); // самая первая запись на месте
  });
});

describe('консоли: жизненный цикл (появление по дате выхода)', () => {
  it('недоступна до даты, появляется в день выхода с анонсами в логе', () => {
    const g = newGame(1);
    const day = dateToDay([1, 11, 1]); // exodus — 1-е числа 11-го месяца (январь года 2) = день 307
    expect(g.consoles['exodus']?.availableAtWeek).toBeNull();
    expect(consoleAvailable(g, 'exodus')).toBe(false);

    advanceWeeks(g, day); // прогон до дня выхода включительно

    expect(g.consoles['exodus']?.availableAtWeek).toBe(day);
    expect(consoleAvailable(g, 'exodus')).toBe(true);
    // анонсы снова работают (раньше ветка была недостижима: дата проставлялась в newGame)
    expect(g.log.some((l) => l.text.includes('поступила в продажу') && l.text.includes('Exodus'))).toBe(true);
    expect(g.log.some((l) => l.text.includes('Слух'))).toBe(true);
  });

  it('консоль дня 1 (PC) доступна сразу после старта партии — без тика и на паузе (BUG-01)', () => {
    const g = newGame(1);
    expect(g.consoles['pc-game']?.availableAtWeek).toBe(1);
    expect(consoleAvailable(g, 'pc-game')).toBe(true);
  });

  it('пропущенная дата выхода догоняется первым же тиком (пауза/старый сейв)', () => {
    const g = newGame(1);
    advanceWeeks(g, 320); // ушли за день выхода exodus (307)
    g.consoles['exodus']!.availableAtWeek = null; // событие было потеряно (партия стояла)
    tick(g);
    expect(g.consoles['exodus']?.availableAtWeek).toBe(dateToDay([1, 11, 1]));
    expect(consoleAvailable(g, 'exodus')).toBe(true);
  });
});

describe('релиз: хайп/известность влияют на продажи', () => {
  function releaseWithHype(hype: number) {
    const g = newGame(1);
    g.money = 5000;
    debugGame(g, hype);
    const res = releaseAction(g);
    expect(res.ok).toBe(true);
    return g.history[0]!;
  }

  it('PLAN-30: пресса сохраняется в записи релиза (10 оценок и 10 отзывов)', () => {
    const rec = releaseWithHype(10);
    expect(rec.judgeScores).toHaveLength(10);
    expect(rec.reviewMessages).toHaveLength(10);
    expect(rec.score).toBeGreaterThanOrEqual(30);
    expect(rec.score).toBeLessThanOrEqual(100);
    expect(rec.judgeScores!.every((s) => s >= 3 && s <= 10)).toBe(true);
  });

  it('больше накопленного хайпа (реклама/бустеры) → больше продаж', () => {
    const low = releaseWithHype(10); // без рекламы/бустеров
    const high = releaseWithHype(60); // ~10 кампаний рекламы за разработку
    expect(high.units).toBeGreaterThan(low.units);
    expect(high.revenue).toBeGreaterThan(low.revenue);
  });
});

describe('буст-событие: семантика приёма/отказа', () => {
  it('отказ не помечает буст использованным и не даёт хайпа', () => {
    const g = newGame(7);
    g.research = 100;
    const ag = debugGame(g, 10);
    g.pendingEvent = { type: 'boost', staffId: g.staff[0]!.id, cost: 10 };
    const res = resolveBoostAction(g, false);
    expect(res.ok).toBe(true);
    expect(g.pendingEvent).toBeNull();
    expect(ag.boostUsed).toBe(false);
    expect(ag.hype).toBe(10);
  });
  it('успех даёт +10 хайпа (BOOST_HYPE_GAIN), провал — только баги', () => {
    // шанс успеха при максимальной ставке = 0.8: ищем сиды с обоими исходами
    // (p(не найти успех/провал за 200 сидов) ≈ 0.2^200 / 0.8^200 ≈ 0)
    let successHype: number | null = null;
    let failHype: number | null = null;
    let failBugs = 0;
    for (let seed = 1; seed <= 200 && (successHype === null || failHype === null); seed++) {
      const g = newGame(seed);
      g.research = 99999;
      const ag = debugGame(g, 10);
      g.pendingEvent = { type: 'boost', staffId: g.staff[0]!.id, cost: 10 };
      const res = resolveBoost(g, createRng(seed * 7 + 1), true, 99999);
      expect(res.ok).toBe(true);
      const outcome = boostResultOutcome(g);
      if (outcome === null) continue;
      if (outcome === 'success' && successHype === null) successHype = ag.hype;
      if (outcome === 'fail' && failHype === null) {
        failHype = ag.hype;
        failBugs = ag.bugs;
      }
    }
    expect(successHype).toBe(10 + CONFIG.BOOST_HYPE_GAIN);
    expect(failHype).toBe(10); // провал ожидания не повышает
    expect(failBugs).toBeGreaterThan(0);
  });
  it('нехватка PR не съедает событие и не ставит boostUsed (аудит 05.09)', () => {
    const g = newGame(7);
    g.research = 5;
    const ag = debugGame(g, 10);
    g.pendingEvent = { type: 'boost', staffId: g.staff[0]!.id, cost: 10 };
    const res = resolveBoostAction(g, true, 100); // просим больше, чем есть
    expect(res.ok).toBe(false);
    expect(g.pendingEvent?.type).toBe('boost'); // событие осталось — игрок может выбрать меньше
    expect(g.research).toBe(5);
    expect(ag.boostUsed).toBe(false);
    expect(ag.hype).toBe(10);
  });
});

describe('старт проекта: первый доступный жанр/консоль', () => {
  it('после первого тика можно стартовать проект на PC', () => {
    const g = newGame(1);
    tick(g); // PC «поступила в продажу»
    const res = startProjectAction(g, {
      consoleId: 'pc-game',
      genreId: 'table', typeId: 'pirate',
      mode: 'normal',
      direction: { approach: 5, polish: 5 },
      proposalStaffId: g.staff[1]!.id,
      assignments: { program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    });
    expect(res.ok).toBe(true);
    expect(g.activeGame?.phase).toBe('proposal');
  });

  it('SRV-23: мусор в очках направления отбрасывается (NaN/отрицательные/чужие оси)', () => {
    const g = newGame(1);
    tick(g);
    const res = startProjectAction(g, {
      consoleId: 'pc-game',
      genreId: 'table', typeId: 'pirate',
      mode: 'normal',
      direction: { approach: 5, polish: 5, niche: Number.NaN, vibes: 7, cute: -3 } as never,
      proposalStaffId: g.staff[1]!.id,
      assignments: { program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    });
    expect(res.ok).toBe(true);
    const d = g.activeGame!.direction as unknown as Record<string, number>;
    expect(d.niche).toBe(0); // NaN не прошёл
    expect(d.cute).toBe(0); // отрицательное не прошло
    expect(d.vibes).toBeUndefined(); // чужая ось отброшена
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBe(10); // бюджет не тронут
    expect(JSON.stringify(d)).not.toContain('null'); // и в сейв не утечёт NaN → null
  });
});

describe('миграции сейва (saveVersion)', () => {
  it('v1 (без saveVersion/adFansGained/mail/gamedex) → v4: поля создаются, repair паузы работает', () => {
    const g = newGame(1);
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    // имитация легаси-сейва v1: полей нет, висит пауза продавца после его ухода
    delete (old as Partial<GameState>).saveVersion;
    delete (old as { adFansGained?: unknown }).adFansGained;
    delete (old as { mail?: unknown }).mail;
    delete (old as { mailId?: unknown }).mailId;
    delete (old as { gamedexHere?: unknown }).gamedexHere;
    delete (old as { lastGamedex?: unknown }).lastGamedex;
    delete (old as { gamedexFame?: unknown }).gamedexFame;
    old.pendingEvent = { type: 'salesman' };
    old.salesmanHere = false;

    const mig = migrateSave(old);

    expect(mig.saveVersion).toBe(SAVE_VERSION);
    expect(mig.adFansGained).toEqual({});
    expect(mig.mail).toEqual([]);
    expect(mig.mailId).toBe(0);
    expect(mig.gamedexHere).toBe(false);
    expect(mig.lastGamedex).toBeNull();
    expect(mig.gamedexFame).toBe(0);
    expect(mig.pendingEvent).toBeNull(); // иначе игра встала бы навсегда
  });

  it('v1.43: висящий salesman-попап снимается и когда продавец ещё в городе', () => {
    const g = newGame(1);
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    old.pendingEvent = { type: 'salesman' };
    old.salesmanHere = true;

    const mig = migrateSave(old);

    expect(mig.salesmanHere).toBe(true); // сам продавец остаётся в городе
    expect(mig.pendingEvent).toBeNull(); // а пауза-попап уходит — в новых клиентах его нет
  });

  it('v2 → v3: письма создаются, старые поля не трогаются', () => {
    const g = newGame(1);
    const old = JSON.parse(JSON.stringify(g)) as GameState;
    delete (old as { mail?: unknown }).mail;
    delete (old as { mailId?: unknown }).mailId;
    old.adFansGained[5] = 123;
    old.saveVersion = 2;
    migrateSave(old);
    expect(old.mail).toEqual([]);
    expect(old.mailId).toBe(0);
    expect(old.adFansGained[5]).toBe(123);
    expect(old.saveVersion).toBe(SAVE_VERSION);
  });

  it('текущий сейв миграцией не ломается', () => {
    const g = newGame(7);
    g.adFansGained[3] = 100;
    migrateSave(g);
    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.adFansGained[3]).toBe(100);
  });
});

describe('M5: медиа-события после релиза (plan/09 §2.4)', () => {
  // игра в продаже (10 дней после релиза, баги 0) — для поиска сида со срабатыванием
  function mediaGame(g: GameState, buggy: boolean, ageDays: number): ActiveGame {
    const ag = debugGame(g, 10);
    ag.phase = 'released';
    ag.name = 'Media Test';
    ag.releaseWeek = g.week - ageDays;
    ag.bugs = buggy ? 5 : 0;
    ag.sales = [{ week: g.week, units: 10, revenue: 200 }];
    ag.totalUnits = 10;
    ag.totalRevenue = 2000;
    return ag;
  }

  it('событие в окне 8 недель: множитель остатка продаж + попап-пауза', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const g = newGame(seed);
      const ag = mediaGame(g, false, 10);
      g.released = [ag];
      tickMediaEvents(g, createRng(seed * 13 + 5));
      if (ag.mediaMult === undefined) continue;
      // без багов только статья/TV (множитель ≥ 1)
      expect([CONFIG.MEDIA_ARTICLE_MULT, CONFIG.MEDIA_TV_MULT]).toContain(ag.mediaMult);
      expect(g.pendingEvent?.type).toBe('info');
      expect(g.log.some((l) => l.text.includes('продажи +'))).toBe(true);
      return; // сид найден
    }
    throw new Error('ни один сид не дал медиа-событие (шанс 1.7%/день)');
  });

  it('«найден баг» возможен только у игры с багами на релизе', () => {
    let sawBug = false;
    for (let seed = 1; seed <= 1500; seed++) {
      const g = newGame(seed);
      const ag = mediaGame(g, true, 10);
      g.released = [ag];
      tickMediaEvents(g, createRng(seed * 13 + 7));
      if (ag.mediaMult === undefined) continue;
      if (ag.mediaMult === CONFIG.MEDIA_BUG_MULT) sawBug = true;
      expect(g.pendingEvent?.type).toBe('info');
      if (sawBug) break;
    }
    expect(sawBug).toBe(true);
  });

  it('после окна 8 недель событий нет', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const g = newGame(seed);
      const ag = mediaGame(g, false, 100); // 100 дней после релиза — вне окна
      g.released = [ag];
      tickMediaEvents(g, createRng(seed * 13 + 9));
      expect(ag.mediaMult).toBeUndefined();
    }
  });

  it('M9: висящий попап не съедает событие — медиа откладывается до свободного дня', () => {
    const g = newGame(1);
    const ag = mediaGame(g, false, 10);
    g.released = [ag];
    for (let seed = 1; seed <= 500; seed++) {
      g.pendingEvent = { type: 'disaster', text: 'занято' }; // какой-то попап висит
      ag.mediaMult = undefined;
      ag.pendingMedia = false;
      tickMediaEvents(g, createRng(seed * 13 + 5));
      if (!ag.pendingMedia) continue; // на этом сиде шанс не сработал
      // сработало при висящем попапе: эффекта ещё нет, событие отложено
      expect(ag.mediaMult).toBeUndefined();
      expect(g.pendingEvent.text).toBe('занято');
      // попап убрали — событие приходит в тот же тик, без нового броска шанса
      g.pendingEvent = null;
      tickMediaEvents(g, createRng(999));
      expect(ag.mediaMult).toBeDefined();
      expect((g.pendingEvent as { type: string } | null)?.type).toBe('info');
      expect(ag.pendingMedia).toBe(false);
      return;
    }
    throw new Error('ни один сид не отложил медиа-событие (шанс 1.7%/день)');
  });

  it('dailySales применяет множитель к деньгам и фанатам', () => {
    const g = newGame(1);
    const ag = mediaGame(g, false, 5);
    ag.mediaMult = 1.5;
    g.released = [ag];
    g.money = 0;
    g.fans = 0;
    dailySales(g);
    expect(g.money).toBe(300); // 200 × 1.5
    expect(g.fans).toBe(10 * 1.5 * CONFIG.FAN_PER_UNIT);
  });
});

describe('M5: событийные консоли (анлоки Гран-при)', () => {
  it('Jupiter 512 доступна после 2-го Гран-при, GameJohn — после 5-го + 20M копий', () => {
    const g = newGame(1);
    tick(g); // консоли дня 1 поступили
    expect(consoleAvailable(g, 'jupiter-512')).toBe(false);
    expect(consoleAvailable(g, 'gamejohn')).toBe(false);

    g.awards.grand = 2; // два Гран-при за плечами
    tick(g);
    expect(g.consoles['jupiter-512']?.availableAtWeek).not.toBeNull();
    expect(consoleAvailable(g, 'jupiter-512')).toBe(true);
    expect(consoleAvailable(g, 'gamejohn')).toBe(false); // 5 Гран-при ещё нет
    expect(g.log.some((l) => l.text.includes('Jupiter 512'))).toBe(true);
    g.pendingEvent = null; // закрываем попап «Новая консоль!»

    // 5 Гран-при, но без 20M-хита — GameJohn закрыт
    g.awards.grand = 5;
    g.pendingEvent = null;
    tick(g);
    expect(consoleAvailable(g, 'gamejohn')).toBe(false);

    // появляется 20M-хит в истории — GameJohn открывается
    g.history.push({
      name: 'Mega Hit', genreId: 'table', typeId: 'pirate', consoleId: 'pc-game',
      score: 40, units: 25000, revenue: 500000, releaseWeek: g.week - 5, year: g.year,
      attrs: { fun: 300, creativity: 300, graphics: 300, sound: 300 }, bugs: 0, awards: ['Гран-при 1'],
    });
    tick(g);
    expect(consoleAvailable(g, 'gamejohn')).toBe(true);
    expect(pendingType(g)).toBe('info');
  });
});

describe('M5: письма фанатов (движок)', () => {
  // релизнутая игра в окне писем (5 дней назад) с заданной оценкой
  function mailGame(g: GameState, score: number, ageDays = 5): ActiveGame {
    const ag = debugGame(g, 10);
    ag.phase = 'released';
    ag.name = 'Mail Game';
    ag.score = score;
    ag.releaseWeek = g.week - ageDays;
    ag.sales = [];
    return ag;
  }

  // ищем сид, на котором письмо приходит (шанс 7%/день — за ~100 сидов гарантированно)
  function findLetter(score: number): { g: GameState; ag: ActiveGame } {
    for (let seed = 1; seed <= 500; seed++) {
      const g = newGame(seed);
      g.fans = 1000;
      const ag = mailGame(g, score);
      g.released = [ag];
      tickFanLetters(g, createRng(seed * 17 + 3));
      if (g.mail.length === 1) return { g, ag };
    }
    throw new Error(`письмо не пришло ни на одном сиде (score ${score})`);
  }

  it('высокая оценка → восторженное письмо: +фанаты, заготовка текста есть', () => {
    const { g } = findLetter(33); // ≥25 — love
    const l = g.mail[0]!;
    expect(l.sentiment).toBe('love');
    expect(l.fansDelta).toBeGreaterThanOrEqual(CONFIG.LETTER_LOVE_MIN);
    expect(l.fansDelta).toBeLessThanOrEqual(CONFIG.LETTER_LOVE_MAX);
    expect(g.fans).toBe(1000 + l.fansDelta);
    expect(l.text.length).toBeGreaterThan(10);
    expect(l.text).toContain('Mail Game');
    expect(l.llm).toBe(false); // текст допишет LLM на сервере
  });

  it('низкая оценка → гневное письмо: −фанаты', () => {
    const { g } = findLetter(15); // ≤19 — hate
    const l = g.mail[0]!;
    expect(l.sentiment).toBe('hate');
    expect(l.fansDelta).toBeLessThan(0);
    expect(g.fans).toBe(1000 + l.fansDelta);
  });

  it('средняя оценка → нейтральное письмо без эффекта', () => {
    const { g } = findLetter(22);
    expect(g.mail[0]!.sentiment).toBe('neutral');
    expect(g.mail[0]!.fansDelta).toBe(0);
    expect(g.fans).toBe(1000);
  });

  it('одно письмо за тик; вне окна 21 день писем нет', () => {
    // три игры в продаже — письмо всё равно максимум одно за тик
    for (let seed = 1; seed <= 300; seed++) {
      const g = newGame(seed);
      g.released = [mailGame(g, 30), mailGame(g, 33), mailGame(g, 28)];
      tickFanLetters(g, createRng(seed * 17 + 5));
      expect(g.mail.length).toBeLessThanOrEqual(1);
      if (g.mail.length === 1) break;
    }
    // вне окна шанс даже не проверяется
    for (let seed = 1; seed <= 50; seed++) {
      const g = newGame(seed);
      const ag = mailGame(g, 33, 100);
      g.released = [ag];
      tickFanLetters(g, createRng(seed * 17 + 7));
      expect(g.mail.length).toBe(0);
    }
  });
});

describe('даты (календарь с 1 апреля 1985)', () => {
  // обе реализации (серверная market / клиентская shared) должны совпадать
  const cases: Array<[number, string]> = [
    [1, '1 апреля 1985'], // старт
    [275, '31 декабря 1985'],
    [279, '4 января 1986'], // январь игрового года 1 = календарный 1986 (был баг: 1985)
    [365, '31 марта 1986'],
    [366, '1 апреля 1986'], // начало игрового года 2
    [571, '23 октября 1986'], // день 206 игрового года 2
  ];
  it('границы годов: январь–март уже следующий календарный год', () => {
    for (const [week, expected] of cases) {
      expect(sharedDateLabel(week), `shared ${week}`).toBe(expected);
    }
  });
});

describe('M5: Gamedex (выставка в июле, офис 2+)', () => {
  function toJuly1(g: GameState): void {
    for (let i = 0; i < CONFIG.GAMEDEX_DAY; i++) tick(g); // 92 тика: обработан день 92 (w = 91 = GAMEDEX_DAY−1)
  }

  it('1 июля приходит приглашение (офис 2); офис 1 — молчит', () => {
    const g = newGame(1);
    g.officeLevel = 2;
    toJuly1(g);
    expect(g.pendingEvent).toEqual({ type: 'gamedex', year: g.year });

    const g1 = newGame(2);
    toJuly1(g1); // офис 1 (по умолчанию)
    expect(g1.pendingEvent).toBeNull();
    expect(g1.gamedexHere).toBe(false);
  });

  it('выбор стенда: списание денег, известность к следующей игре; повтор той же опции — ×0.5', () => {
    const g = newGame(1);
    g.officeLevel = 2;
    toJuly1(g);
    g.money = 50000; // звезда — 7000K; стартовых 500K не хватило бы
    const before = g.money;
    const r = resolveGamedexAction(g, 'star');
    expect(r.ok).toBe(true);
    expect(g.money).toBe(before - CONFIG.GAMEDEX_OPTIONS.star!.cost);
    expect(g.gamedexFame).toBe(100);
    expect(g.lastGamedex).toEqual({ year: g.year, option: 'star' });
    expect(g.gamedexHere).toBe(false);
    expect(g.pendingEvent?.type).toBe('info'); // итог — обычным попапом
    resolveEventAction(g);

    // следующий год — снова звезда: публика помнит (ротация, ×0.5)
    g.pendingEvent = { type: 'gamedex', year: g.year + 1 };
    resolveGamedexAction(g, 'star');
    expect(g.gamedexFame).toBe(150);
    resolveEventAction(g);
    // другая опция — полный эффект
    g.pendingEvent = { type: 'gamedex', year: g.year + 2 };
    resolveGamedexAction(g, 'booth');
    expect(g.gamedexFame).toBe(160);
  });

  it('нет денег — отказ, приглашение остаётся', () => {
    const g = newGame(1);
    g.officeLevel = 2;
    toJuly1(g);
    g.money = 100;
    const r = resolveGamedexAction(g, 'star');
    expect(r.ok).toBe(false);
    expect(g.pendingEvent?.type).toBe('gamedex'); // можно выбрать дешевле
    const r2 = resolveGamedexAction(g, 'none');
    expect(r2.ok).toBe(true);
    expect(g.money).toBe(100);
  });

  it('не выбрал за неделю — выставка уезжает (авто-пропуск)', () => {
    const g = newGame(1);
    g.officeLevel = 2;
    toJuly1(g);
    expect(g.pendingEvent?.type).toBe('gamedex');
    // 92..98: тики до 8 июля (w = 98 = GAMEDEX_DAY_END−1)
    for (let i = 0; i < 7; i++) tick(g);
    expect(g.pendingEvent).toBeNull();
    expect(g.gamedexHere).toBe(false);
    expect(g.gamedexFame).toBe(0);
    expect(g.money).toBe(newGame(1).money); // ничего не потрачено
  });

  it('известность Gamedex уходит на первый же следующий проект', () => {
    const g = newGame(1);
    tick(g); // PC «поступила в продажу»
    g.gamedexFame = 40;
    const res = startProjectAction(g, {
      consoleId: 'pc-game',
      genreId: 'table', typeId: 'pirate',
      mode: 'normal',
      direction: { approach: 5, polish: 5 },
      proposalStaffId: g.staff[1]!.id,
      assignments: { program: [g.staff[0]!.id], graphics: [], sound: [], debug: [] },
    });
    expect(res.ok).toBe(true);
    expect(g.activeGame?.fame).toBe(CONFIG.PROJECT_FAME_BASE + 40);
    expect(g.gamedexFame).toBe(0); // списана
  });
});

// ─── SRV-02: схемная проверка сейва — импорт/загрузка не подменяют живую партию огрызком ───
describe('isValidGameState', () => {
  it('принимает настоящий GameState', () => {
    expect(isValidGameState(newGame(1))).toBe(true);
  });

  it('принимает легаси-сейв без полей, которые допишет миграция', () => {
    const g = newGame(1) as Partial<GameState>;
    delete g.mail;
    delete g.log;
    delete g.saveVersion;
    expect(isValidGameState(g)).toBe(true);
  });

  it('отклоняет не-объекты и огрызки', () => {
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState('строка')).toBe(false);
    expect(isValidGameState([])).toBe(false);
    expect(isValidGameState({})).toBe(false);
    expect(isValidGameState({ week: 1 })).toBe(false);
    expect(isValidGameState({ ...newGame(1), week: Number.NaN })).toBe(false);
    expect(isValidGameState({ ...newGame(1), money: '1000' })).toBe(false);
    expect(isValidGameState({ ...newGame(1), staff: 'нет' })).toBe(false);
    expect(isValidGameState({ ...newGame(1), staff: [{}] })).toBe(false);
    expect(isValidGameState({ ...newGame(1), history: null })).toBe(false);
    expect(isValidGameState({ ...newGame(1), consoles: [] })).toBe(false);
  });

  it('отклоняет сейв «из будущего» (saveVersion > SAVE_VERSION)', () => {
    expect(isValidGameState({ ...newGame(1), saveVersion: SAVE_VERSION + 1 })).toBe(false);
  });
});


// 4 тона письма (10.09.2026): движок выбирает стиль (восторг/ностальгия/разбор/идеи) и жанр для конкретики.
describe('M5: 4 тона писем (движок)', () => {
  function letterFor(score: number) {
    for (let seed = 1; seed <= 500; seed++) {
      const g = newGame(seed);
      g.fans = 1000;
      const ag = debugGame(g, 10);
      ag.phase = 'released';
      ag.name = 'Mail Game';
      ag.score = score;
      ag.releaseWeek = g.week - 5;
      ag.sales = [];
      g.released = [ag];
      tickFanLetters(g, createRng(seed * 17 + 3));
      if (g.mail.length === 1) return g.mail[0]!;
    }
    throw new Error(`письмо не пришло (score ${score})`);
  }

  it('стиль согласован с чувством, жанр заполнен, заготовка по стилю', () => {
    const love = letterFor(33);
    expect(['delight', 'nostalgia']).toContain(love.style);
    expect(love.genre).toBeTruthy();
    expect(love.text).toContain('Mail Game');
    expect(letterFor(15).style).toBe('rant');
    expect(letterFor(22).style).toBe('ideas');
  });
});

describe('AP-13: отладка копит дробный прогресс (слабая команда не застревает)', () => {
  it('команда с Program=5 у каждого закрывает баги, хотя rate < 0.5 в день', () => {
    const g = newGame(3);
    for (const st of g.staff) {
      st.homeWeeks = 0; // дома сидят — в отладке не участвуют (как и было задумано)
      st.power = st.maxPower;
      st.stats.program = 5;
    }
    const ag = debugGame(g, 10);
    ag.bugs = 10;
    ag.assignments.debug = []; // никто не назначен → вес 0.7 у всех
    const sum = g.staff.reduce((a, st) => a + st.stats.program * 0.7, 0);
    const rate = sum * CONFIG.DEBUG_RATE; // копилка: без неё округление в день давало 0 (AP-13)
    expect(rate).toBeLessThan(0.5); // округление в день давало 0 — это и был баг на проде
    for (let d = 0; d < 7; d++) { tick(g); g.pendingEvent = null; }
    expect(ag.bugs).toBeLessThan(10); // копилка сработала
    // копилка — «ящик» округления round(): остаток всегда в пределах ±полубага (M6: было >0)
    expect(Math.abs(ag.debugCarry ?? 0)).toBeLessThanOrEqual(0.5 + 1e-9);
    // убирается ровно столько, сколько накопилось (допуск на округления по дням)
    const removed = 10 - ag.bugs;
    expect(removed).toBeGreaterThanOrEqual(Math.round(rate * 7) - 1);
    expect(removed).toBeLessThanOrEqual(Math.round(rate * 7) + 1);
  });
});

describe('PLAN-22: открытые комбо (набор аккаунта, вне сейва)', () => {
  it('запуск проекта записывает пару «жанр|тип» в состояние игры', () => {
    const g = newGame(5);
    expect(g.openedCombos ?? []).toEqual([]);
    const input = autopilotProjectInput(g)!;
    expect(startProjectAction(g, input).ok).toBe(true);
    expect(g.openedCombos).toContain(`${input.genreId}|${input.typeId}`);
  });

  it('открытая пара доступна в новой партии, даже если должность не прокачана', () => {
    const g = newGame(6);
    expect(isUnlocked(g, 'director', 1, null, 'sim-rpg|pirate')).toBe(false);
    g.openedCombos = ['sim-rpg|pirate'];
    expect(isUnlocked(g, 'director', 1, null, 'sim-rpg|pirate')).toBe(true);
  });
});

describe('PLAN-22: лестница званий', () => {
  it('пороги растут, покрывают всю шкалу, вершина — последнее звание', () => {
    expect(RANKS[0]!.from).toBe(0);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.from).toBeGreaterThan(RANKS[i - 1]!.from);
    expect(RANKS.length).toBeGreaterThanOrEqual(40); // порогов много — звание меняется часто
    expect(rankFor(0).name).toBe(RANKS[0]!.name);
    expect(rankFor(1).name).toBe('Лукас Поуп');
    expect(rankFor(1580).name).toBe(RANKS[RANKS.length - 1]!.name);
    expect(rankFor(99999)).toBe(rankFor(1580)); // выше вершины — та же легенда
    expect(nextRank(0)?.need).toBe(1);
    expect(nextRank(1580)).toBeNull();
  });
});

describe('PLAN-22: тост нового уровня', () => {
  it('обычный шаг — просто уровень и путь до звания; переход порога — звание и заслуга', () => {
    // в начале лестницы почти каждый комбо — новый порог (0,1,2,…), «обычный» шаг ищем там,
    // где шаг больше единицы: 20 → 21 (Нобуо Уэмацу держится до 22)
    const plain = levelUpNotice(20, 21, 'RPG × Пиратский');
    expect(plain.title).toBe('Уровень 21');
    expect(plain.crossed).toBe(false);
    expect(plain.icon).toBe('🎼'); // Нобуо Уэмацу держится с 20 до 21
    expect(plain.text).toContain('RPG × Пиратский');
    expect(plain.text).toContain('До звания');

    const step = levelUpNotice(21, 22, 'Сим × Пиратский'); // 22 — порог Хидэтаки Миядзаки
    expect(step.title).toContain('Уровень 22');
    expect(step.title).toContain('Хидэтака Миядзаки');
    expect(step.text).toContain('Dark Souls');

    const top = levelUpNotice(1579, 1580, 'что угодно');
    expect(top.title).toContain('Нолан Бушнелл');
    expect(top.text).toContain('Atari');
  });
});
