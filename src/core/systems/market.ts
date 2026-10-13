// Рынок: продажи по дням, фанаты, жизненный цикл консолей, награды.
import { CONFIG } from '../config';
import { CONSOLES } from '../data/db';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GamedexOption, GameState } from '../types';
import { dateToDay, EVENT_CONSOLE_REQ } from '../../shared/consoles';

// дневные продажи выпущенных игр
export function dailySales(state: GameState): void {
  for (const game of state.released) {
    if (game.ended) continue;
    const cs = state.consoles[game.consoleId];
    const entry = game.sales.find((s) => s.week === state.week);
    if (!entry || (cs && cs.removedAtWeek !== null && cs.removedAtWeek <= state.week)) {
      game.ended = true;
      // PLAN-29: итог в архив — фактические цифры (для окна «Продажи»)
      const rec = state.history.find((h) => h.name === game.name && h.releaseWeek === game.releaseWeek);
      if (rec) {
        rec.paidUnits = Math.round(game.paidUnits ?? 0);
        rec.paidRevenue = Math.round(game.paidRevenue ?? 0);
      }
      log(state, `«${game.name}» снята с продаж (итого ${formatUnits(Math.round(game.paidUnits ?? game.totalUnits))}, ${Math.round(game.paidRevenue ?? game.totalRevenue)}K)`); // аудит-51 01-P3-7: факт, как в окне «Продажи»
      continue;
    }
    // медиа-события (статья/TV/баг) умножают остаток продаж игры
    const mult = game.mediaMult ?? 1;
    // PLAN-48: вечная рента партнёра режет доход от продаж игр (тихо; доля — в сейве)
    const rentPct = state.partnerRentPct ?? 0;
    const gross = entry.revenue * mult;
    state.money += rentPct > 0 ? gross * (1 - rentPct / 100) : gross;
    state.fans += entry.units * mult * CONFIG.FAN_PER_UNIT;
    // PLAN-29: фактический учёт для окна «Продажи» (механики не меняются — только цифры)
    game.paidUnits = (game.paidUnits ?? 0) + (entry.unitsF ?? entry.units) * mult;
    game.paidRevenue = (game.paidRevenue ?? 0) + entry.revenue * mult;
  }
  state.released = state.released.filter((g) => !g.ended);
}

// Медиа-события после релиза (plan/09 §2.4): случайно в первые 8 недель продаж
// статья (+8%) / TV-сюжет (+15%) / «найден баг» (−10%, только если баги на релизе > 0).
// Эффект — множитель на ОСТАТОК продаж; попап с паузой (info), как остальные события.
export function tickMediaEvents(state: GameState, rng: Rng): void {
  for (const game of state.released) {
    if (game.ended || game.releaseWeek === null) continue;
    if (state.week - game.releaseWeek >= CONFIG.MEDIA_WINDOW_DAYS) { game.pendingMedia = false; continue; }
    if (!game.pendingMedia && !rng.chance(CONFIG.MEDIA_CHANCE)) continue;
    // M9: попап-пауза уже висит — событие не теряем, отложим до свободного дня
    if (state.pendingEvent) { game.pendingMedia = true; continue; }
    game.pendingMedia = false;
    const buggy = game.bugs > 0;
    // баги > 0: три типа поровну; без багов: статья/TV
    const roll = buggy ? rng.int(0, 2) : rng.int(0, 1);
    let mult: number;
    let kind: string;
    if (buggy && roll === 2) {
      mult = CONFIG.MEDIA_BUG_MULT;
      kind = '🐞 Пресса нашла баг';
    } else if (roll === 1) {
      mult = CONFIG.MEDIA_TV_MULT;
      kind = '📺 Вышел TV-сюжет';
    } else {
      mult = CONFIG.MEDIA_ARTICLE_MULT;
      kind = '📰 Журнал написал статью';
    }
    game.mediaMult = (game.mediaMult ?? 1) * mult;
    const sign = mult >= 1 ? '+' : '−';
    const pct = Math.round(Math.abs(mult - 1) * 100);
    log(state, `${kind} об игре «${game.name}»: продажи ${sign}${pct}%`);
    state.pendingEvent = {
      type: 'info',
      title: 'СМИ о вашей игре',
      text: `${kind} об игре «${game.name}»!\nПродажи ${sign}${pct}% до конца продаж.`,
    };
    return; // одно событие за тик
  }
}

// Событийные консоли по наградам (пороги — shared/consoles, один источник для движка и UI):
// Юпитер 512 — после 2-го Гран-при; GameJohn — 5 Гран-при + 20M копий одной игры.
export function tryUnlockEventConsoles(state: GameState): void {
  for (const [id, req] of Object.entries(EVENT_CONSOLE_REQ)) unlockEventConsole(state, id, req);
}

function unlockEventConsole(state: GameState, id: string, req: { grand: number; units?: number }): void {
  const cs = state.consoles[id];
  if (!cs || cs.availableAtWeek !== null) return; // нет такой/уже доступна
  if (state.awards.grand < req.grand) return;
  const needUnits = req.units;
  if (needUnits && !state.history.some((h) => h.units >= needUnits)) return;
  const c = CONSOLES.find((x) => x.id === id);
  cs.availableAtWeek = state.week;
  log(state, `🔓 Консоль «${c?.name ?? id}» доступна для лицензирования${c ? ` (${Math.round(c.licenseCost)}K)` : ''}!`);
  if (!state.pendingEvent) {
    state.pendingEvent = {
      type: 'info',
      title: 'Новая консоль!',
      text: `🏭 Нам предложили выпуск консоли «${c?.name ?? id}»${c ? ` — лицензия ${Math.round(c.licenseCost)}K` : ''}!\nСтоит взять: новая платформа = новый рынок.`,
    };
  }
}

// жизненный цикл консолей: появление, снятие (с предупреждением за 21 день)
export function consoleEvents(state: GameState): void {
  for (const c of CONSOLES) {
    const cs = state.consoles[c.id];
    if (!cs) continue;
    if (Array.isArray(c.unlock) && cs.availableAtWeek === null && c.unlock[0] > 0) {
      const day = dateToDay(c.unlock);
      if (day === state.week + 21) {
        log(state, `Слух: консоль «${c.name}» появится в продаже через 3 недели`);
      } else if (day <= state.week) {
        // BUG-01: догон пропущенной даты (пауза/загрузка старого сейва) — событие не теряется
        cs.availableAtWeek = day;
        log(state, `Консоль «${c.name}» поступила в продажу! (база ${cs.base}K, лицензия ${c.licenseCost}K)`);
      }
    }
    if (Array.isArray(c.removed) && cs.removedAtWeek === null) {
      const day = dateToDay(c.removed);
      if (day === state.week + 21) {
        log(state, `Внимание: консоль «${c.name}» будет снята с производства через 3 недели!`);
      } else if (day <= state.week) {
        cs.removedAtWeek = day;
        log(state, `Консоль «${c.name}» снята с производства`);
      }
    }
  }
}

// реальный календарь: 1 апреля 1985 = день 1; год = 365 дней
// (MONTH_OFFSETS и dateToDay — в shared/consoles.ts: те же для движка и UI)

export { dateToDay } from '../../shared/consoles';

// фанаты: медленный спад
export function fanDecay(state: GameState): void {
  state.fans *= CONFIG.FAN_DECAY;
}

// ежегодная церемония наград (M12W3)
export function awardsCeremony(state: GameState, rng: Rng): void {
  // аудит-51 P1-8: окно участия — от прошлогодней церемонии до сегодняшней (раньше попадали
  // только игры первых 62 дней года — релиз «второй половины» года не мог выиграть никогда)
  const thisAwardsWeek = (state.year - 1) * CONFIG.YEAR_LENGTH + CONFIG.AWARDS_DAY;
  const yearGames = state.history.filter(
    (h) => h.releaseWeek > thisAwardsWeek - CONFIG.YEAR_LENGTH && h.releaseWeek <= thisAwardsWeek,
  );
  if (yearGames.length === 0) return;

  // зал славы: оценка ≥ HALL_OF_FAME (антипремия ниже смотрит на ВСЕ игры года)
  const eligible = yearGames.filter((h) => h.score >= CONFIG.HALL_OF_FAME);
  const year = state.year;

  if (eligible.length > 0) {
    const winner = [...eligible].sort((a, b) => b.score - a.score)[0]!;

    if (winner.score >= CONFIG.GRAND_PRIZE_SCORE && rng.chance(0.7)) {
      state.money += CONFIG.PRIZE_GRAND;
      state.awards.grand += 1;
      winner.awards.push(`Гран-при ${year}`);
      log(state, `🏆 ГРАН-ПРИ ${year}: «${winner.name}» (+${CONFIG.PRIZE_GRAND}K)!`);
    } else if (winner.score >= CONFIG.HALL_OF_FAME && rng.chance(0.4)) {
      state.money += CONFIG.PRIZE_RUNNER_UP;
      state.awards.runnerUp += 1;
      winner.awards.push(`Второе место ${year}`);
      log(state, `🥈 Второе место ${year}: «${winner.name}» (+${CONFIG.PRIZE_RUNNER_UP}K)`);
    }

    // дизайн/музыка
    // аудит-51 P1-12: лучшая по атрибуту среди eligible без абсолютного порога (150 — из старой
    // шкалы; после перекалибровки статов он делал эти награды почти недостижимыми)
    const design = [...eligible].sort((a, b) => b.attrs.graphics - a.attrs.graphics)[0]!;
    state.money += CONFIG.PRIZE_DESIGN;
    state.awards.design += 1;
    design.awards.push(`Лучший дизайн ${year}`);
    log(state, `🎨 Лучший дизайн ${year}: «${design.name}» (+${CONFIG.PRIZE_DESIGN}K)`);
    const music = [...eligible].sort((a, b) => b.attrs.sound - a.attrs.sound)[0]!;
    state.money += CONFIG.PRIZE_MUSIC;
    state.awards.music += 1;
    music.awards.push(`Лучшая музыка ${year}`);
    log(state, `🎵 Лучшая музыка ${year}: «${music.name}» (+${CONFIG.PRIZE_MUSIC}K)`);
  }

  // аудит-51 01-P2-3 / 05-P3-5: антипремия «Худшая игра года» — релиз с кучей багов (порог 50+,
  // plan/03:58: «50–60 багов на релизе → −$300K»). Смотрит на все игры года, не только зал славы;
  // в год без грязных релизов не выдаётся.
  const worst = [...yearGames].sort((a, b) => b.bugs - a.bugs)[0]!;
  if (worst.bugs >= CONFIG.WORST_BUGS_MIN) {
    state.money -= CONFIG.PRIZE_WORST;
    state.awards.worst += 1;
    worst.awards.push(`Худшая игра ${year}`);
    log(state, `💩 Худшая игра ${year}: «${worst.name}» (${worst.bugs} багов на релизе, −${CONFIG.PRIZE_WORST}K)`);
  }
}

// Gamedex (M5, plan/05 §6): выставка 1–7 июля (дни 92–98), офис 2+; приход = пауза (как продавец),
// выбор стенда через resolveGamedex; уехала 8 июля — авто-пропуск.
export function tickGamedex(state: GameState): void {
  const w = (state.week - 1) % CONFIG.YEAR_LENGTH;
  if (state.officeLevel < 2) return;
  if (w === CONFIG.GAMEDEX_DAY - 1 && !state.gamedexHere) {
    state.gamedexHere = true;
    if (!state.pendingEvent) {
      state.pendingEvent = { type: 'gamedex', year: state.year };
      log(state, '🎪 Gamedex открылась! Выберите стенд — известность поможет следующей игре');
    }
  }
  if (w === CONFIG.GAMEDEX_DAY_END - 1 && state.gamedexHere) {
    state.gamedexHere = false;
    if (state.pendingEvent?.type === 'gamedex') state.pendingEvent = null; // авто-пропуск
    log(state, '🎪 Gamedex уехала. До следующего июля');
  }
}

// выбор стенда: списание, известность к следующему проекту + фанаты; повтор опции «приедается»
export function resolveGamedex(state: GameState, option: GamedexOption, rng: Rng): ActionResult {
  const ev = state.pendingEvent;
  if (!ev || ev.type !== 'gamedex') return { ok: false, error: 'Gamedex не идёт' };
  const opt = CONFIG.GAMEDEX_OPTIONS[option];
  if (!opt) return { ok: false, error: 'Нет такого стенда' };
  if (state.money < opt.cost) return { ok: false, error: `Нужно ${opt.cost}K` };
  state.pendingEvent = null;
  state.gamedexHere = false;

  // повтор той же опции подряд — публика помнит прошлый раз (ротация, ×0.5)
  const repeat = state.lastGamedex !== null && state.lastGamedex.option === option && option !== 'none';
  const mult = repeat ? CONFIG.GAMEDEX_REPEAT_MULT : 1;

  state.money -= opt.cost;
  const fame = Math.round(opt.fame * mult);
  const fans = Math.round(opt.fans * mult);
  state.gamedexFame += fame;
  state.fans += fans;
  let news = '';
  if (opt.newsChance && rng.chance(opt.newsChance)) {
    state.fans += opt.newsFans ?? 0;
    news = `\n📰 Пресса пишет о вашем стенде: +${opt.newsFans ?? 0} фанатов!`;
  }
  state.lastGamedex = { year: ev.year, option };

  const label = opt.label ?? option;
  const parts: string[] = [];
  if (fame > 0) parts.push(`известность следующей игры +${fame}`);
  if (fans > 0) parts.push(`+${fans} фанатов`);
  const effect = parts.length ? ` (${parts.join(', ')})` : '';
  const repeatNote = repeat ? '\nПублика помнит прошлый раз — эффект слабее.' : '';
  log(state, `🎪 Gamedex: ${label} (−${opt.cost}K)${effect}`);
  state.pendingEvent = {
    type: 'info',
    title: 'Gamedex',
    text: `🎪 Стенд «${label}» (−${opt.cost}K)${effect}.${news}${repeatNote}`,
  };
  return { ok: true };
}

export function formatUnits(u: number): string {
  return u >= 1000 ? `${(u / 1000).toFixed(2)}M` : `${Math.round(u)}K`;
}
