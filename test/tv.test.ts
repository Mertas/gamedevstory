// PLAN-52 M2b: телевидение — каналы, предложения, сезоны, каннибализация — юнит-тесты.
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { newGame } from '../src/core/engine';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import type { Rng } from '../src/core/rng';
import { onGameReleased, studioYear, tickFranchises } from '../src/core/systems/franchise';
import { dailySales } from '../src/core/systems/market';
import { acceptTvOffer, declineTvOffer, deferTvOffer, tickTv } from '../src/core/systems/tv';
import type { GameRecord, GameState } from '../src/core/types';

/** запись архива для теста (в франшизе читаются только эти поля) */
function rec(name: string, genreId: string, typeId: string, score: number, releaseWeek: number): GameRecord {
  return { name, genreId, typeId, score, releaseWeek } as unknown as GameRecord;
}

/** rng-заглушка: next() идёт по последовательности; int(a,b) — min или max */
function stubRng(nexts: number[], pick: 'min' | 'max' = 'min'): Rng {
  let i = 0;
  return {
    next: () => nexts[Math.min(i++, nexts.length - 1)],
    int: (a: number, b: number) => (pick === 'max' ? b : a),
    chance: (p: number) => p > 0,
    state: 0,
  } as unknown as Rng;
}

/** партия 1991 года с франшизой «Космо-Рейнджеры» (бренд 85), ТВ готово принять оффер */
function tvState(week = 6 * 365 + 40): GameState {
  const g = newGame(11);
  g.week = week;
  g.franchises = {};
  onGameReleased(g, rec('Космо-Рейнджеры', 'rpg', 'action', 85, 40));
  g.tv = { show: null, offer: null, nextOfferWeek: week };
  return g;
}

describe('PLAN-52 M2b: предложения каналов', () => {
  it('до 1991-го каналов ещё нет — предложений не бывает', () => {
    const g = tvState(5 * 365 + 10); // 1990
    expect(studioYear(g)).toBe(1990);
    tickTv(g, stubRng([0.1]));
    expect(g.tv!.offer).toBeNull();
    expect(g.pendingEvent).toBeNull();
  });

  it('канал предлагает сериал по сильной франшизе — попап с паузой', () => {
    const g = tvState();
    tickTv(g, stubRng([0.1]));
    const off = g.tv!.offer!;
    expect(off).toBeTruthy();
    expect(off.channelId).toBe('svetlyachok');
    expect(off.franchiseKey).toBe('rpg|action');
    expect(g.pendingEvent).toEqual({ type: 'tv', stage: 'offer' });
    // следующий оффер — не раньше, чем через полтора года
    expect(g.tv!.nextOfferWeek).toBeGreaterThanOrEqual(g.week + CONFIG.TV_OFFER_GAP_MIN);
  });

  it('слабая франшиза предложения не получает — канал подождёт', () => {
    const g = tvState();
    g.franchises!['rpg|action']!.brand = 30;
    tickTv(g, stubRng([0.1]));
    expect(g.tv!.offer).toBeNull();
    expect(g.tv!.nextOfferWeek).toBe(g.week + 90);
  });

  it('пока висит другое событие — оффер не рождается (не перебиваем попап)', () => {
    const g = tvState();
    g.pendingEvent = { type: 'info', title: 'т', text: 'x' };
    tickTv(g, stubRng([0.1]));
    expect(g.tv!.offer).toBeNull();
  });

  it('оффер сгорает за TV_OFFER_TTL; попап при этом снимается', () => {
    const g = tvState();
    tickTv(g, stubRng([0.1]));
    expect(g.pendingEvent).toEqual({ type: 'tv', stage: 'offer' });
    g.week += CONFIG.TV_OFFER_TTL + 2;
    tickTv(g, stubRng([0.1]));
    expect(g.tv!.offer).toBeNull();
    expect(g.pendingEvent).toBeNull();
  });

  it('«Позже» оставляет оффер, «Отклонить» — снимает', () => {
    const g = tvState();
    tickTv(g, stubRng([0.1]));
    deferTvOffer(g);
    expect(g.pendingEvent).toBeNull();
    expect(g.tv!.offer).toBeTruthy();
    declineTvOffer(g);
    expect(g.tv!.offer).toBeNull();
  });
});

describe('PLAN-52 M2b: сезон — эфир, финал, каннибализация', () => {
  it('принятие: сезон в эфире; ставка, фанаты и известность капают ежедневно', () => {
    const g = tvState();
    tickTv(g, stubRng([0.1]));
    const res = acceptTvOffer(g, stubRng([0.5]));
    expect(res.ok).toBe(true);
    const ch = CONFIG.TV_CHANNELS.svetlyachok;
    const sh = g.tv!.show!;
    expect(sh.channelId).toBe('svetlyachok');
    expect(sh.name).toContain('Космо-Рейнджеры');
    expect(sh.weeksLeft).toBe(ch.lengthWeeks * 7);
    expect(sh.rate).toBe(ch.rate);
    expect(g.pendingEvent).toBeNull();
    expect(g.franchises!['rpg|action']!.lastShowWeek).toBe(g.week);

    // эфирный день: деньги, фанаты, известность текущего проекта
    g.activeGame = { phase: 'dev', fame: 0 } as unknown as GameState['activeGame'];
    const money0 = g.money, fans0 = g.fans;
    tickTv(g, stubRng([0.5]));
    expect(g.money).toBeCloseTo(money0 + ch.rate / 7, 6);
    expect(g.fans).toBeCloseTo(fans0 + ch.fansPerWeek / 7, 6);
    expect(g.activeGame!.fame).toBeCloseTo(CONFIG.TV_FAME_PER_WEEK / 7, 6);
    expect(g.tv!.show!.weeksLeft).toBe(ch.lengthWeeks * 7 - 1);
    expect(g.tv!.offer).toBeNull(); // во время эфира новых офферов нет
  });

  it('финал-легенда (рейтинг 80+): бренд растёт, волна фанатов и премия канала', () => {
    const g = tvState();
    tickTv(g, stubRng([0.1]));
    acceptTvOffer(g, stubRng([0.5]));
    const f = g.franchises!['rpg|action']!;
    g.tv!.show!.weeksLeft = 1; // последний день сезона
    const fans0 = g.fans, money0 = g.money;
    tickTv(g, stubRng([0.99], 'max')); // int(±8) -> +8: 85 − 8 + 8 = 85 → легенда
    const ch = CONFIG.TV_CHANNELS.svetlyachok;
    const r = g.tv!.lastResult!;
    expect(r.rating).toBe(85);
    expect(r.outcome).toBe('legend');
    expect(f.brand).toBeCloseTo(85 + CONFIG.TV_RESULTS.legend.brand);
    const seasonFans = (ch.fansPerWeek / 7) * ch.lengthWeeks * 7;
    const wave = Math.round(seasonFans * CONFIG.TV_RESULTS.legend.fansMult);
    expect(g.fans - fans0).toBeCloseTo(wave + ch.fansPerWeek / 7, 5);
    expect(g.money - money0).toBeCloseTo(ch.rate / 7 + ch.rate * CONFIG.TV_RESULTS.legend.premium, 5);
    expect(g.tv!.show).toBeNull();
    expect(g.pendingEvent).toEqual({ type: 'tv', stage: 'result' });
  });

  it('финал-провал: бренд просаживается, волны фанатов нет', () => {
    const g = tvState();
    g.franchises!['rpg|action']!.brand = 45;
    g.tv!.offer = { channelId: 'svetlyachok', franchiseKey: 'rpg|action', week: g.week };
    acceptTvOffer(g, stubRng([0.5]));
    g.tv!.show!.weeksLeft = 1;
    const fans0 = g.fans;
    tickTv(g, stubRng([0.99])); // int(±8) -> −8: 45 − 8 − 8 = 29 → провал
    const ch = CONFIG.TV_CHANNELS.svetlyachok;
    const r = g.tv!.lastResult!;
    expect(r.outcome).toBe('flop');
    expect(r.rating).toBeLessThan(40);
    expect(g.franchises!['rpg|action']!.brand).toBeCloseTo(45 + CONFIG.TV_RESULTS.flop.brand);
    expect(g.fans - fans0).toBeCloseTo(ch.fansPerWeek / 7, 5); // только эфирный день
  });

  it('во время эфира продажи игр режутся на TV_CANNIBALIZE%', () => {
    const mk = (withShow: boolean): GameState => {
      const g = newGame(5);
      g.week = 500;
      const game = {
        name: 'Тестовая', ended: false, consoleId: 'jupiter',
        sales: [{ week: 500, units: 1000, revenue: 1000 }],
        mediaMult: 1, paidUnits: 0, paidRevenue: 0, releaseWeek: 400,
      };
      g.released = [game as unknown as GameState['released'][number]];
      if (withShow) {
        g.tv = {
          show: {
            channelId: 'svetlyachok', franchiseKey: 'rpg|action', name: 'x',
            weeksLeft: 10, lengthDays: 112, rate: 25, fansPerWeek: 700, startedWeek: 490,
          },
          offer: null, nextOfferWeek: 0,
        };
      }
      return g;
    };
    const off = mk(false);
    const offMoney0 = off.money, offFans0 = off.fans;
    dailySales(off);
    const baseMoney = off.money - offMoney0;

    const on = mk(true);
    const money0 = on.money, fans0 = on.fans;
    dailySales(on);
    expect(on.money - money0).toBeCloseTo(baseMoney * (1 - CONFIG.TV_CANNIBALIZE / 100), 6);
    expect(on.fans - fans0).toBeCloseTo((off.fans - offFans0) * (1 - CONFIG.TV_CANNIBALIZE / 100), 6);
  });

  it('эфир освежает франшизу: забвение идёт от последнего показа', () => {
    const g = tvState();
    const f = g.franchises!['rpg|action']!;
    f.lastReleaseWeek = g.week - 2 * 365;
    tickFranchises(g);
    expect(f.brand).toBeCloseTo(85 - 2 * CONFIG.FRANCHISE_IDLE_DECAY);
    // сериал по серии: счётчик забвения обнуляется, начинается отсчёт от эфира
    g.tv!.offer = { channelId: 'svetlyachok', franchiseKey: 'rpg|action', week: g.week };
    acceptTvOffer(g, stubRng([0.5]));
    expect(f.decayed).toBe(0);
    expect(f.lastShowWeek).toBe(g.week);
    const brand0 = f.brand;
    g.week += 300; // полгода спустя, но эфир был свежий
    tickFranchises(g);
    expect(f.brand).toBeCloseTo(brand0);
  });
});

describe('PLAN-52 M2b: миграция и новая партия', () => {
  it('миграция v21: старым сейвам появляется телевидение', () => {
    const g = newGame(1);
    g.tv = undefined;
    g.saveVersion = 20;
    migrateSave(g);
    expect(g.saveVersion).toBe(SAVE_VERSION);
    expect(g.tv).toEqual({ show: null, offer: null, nextOfferWeek: g.week + 30 });
  });

  it('новая партия: ТВ на месте, первый оффер — не раньше 1991-го', () => {
    const g = newGame(3);
    expect(g.tv!.show).toBeNull();
    expect(g.tv!.offer).toBeNull();
    expect(g.tv!.nextOfferWeek).toBe(6 * CONFIG.YEAR_LENGTH + 30);
  });
});
