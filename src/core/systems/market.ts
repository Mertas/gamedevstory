// Рынок: еженедельные продажи, фанаты, жизненный цикл консолей, награды.
import { CONFIG } from '../config';
import { CONSOLES } from '../data/db';
import type { Rng } from '../rng';
import type { GameState } from '../types';

// дневные продажи выпущенных игр
export function dailySales(state: GameState): void {
  for (const game of state.released) {
    if (game.ended) continue;
    const cs = state.consoles[game.consoleId];
    const entry = game.sales.find((s) => s.week === state.week);
    if (!entry || (cs && cs.removedAtWeek !== null && cs.removedAtWeek <= state.week)) {
      game.ended = true;
      log(state, `«${game.name}» снята с продаж (итого ${formatUnits(game.totalUnits)}, ${Math.round(game.totalRevenue)}K)`);
      continue;
    }
    state.money += entry.revenue;
    state.fans += entry.units * CONFIG.FAN_PER_UNIT;
  }
  state.released = state.released.filter((g) => !g.ended);
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
      } else if (day === state.week) {
        cs.availableAtWeek = day;
        log(state, `Консоль «${c.name}» поступила в продажу! (база ${cs.base}K, лицензия ${c.licenseCost}K)`);
      }
    }
    if (Array.isArray(c.removed) && cs.removedAtWeek === null) {
      const day = dateToDay(c.removed);
      if (day === state.week + 21) {
        log(state, `Внимание: консоль «${c.name}» будет снята с производства через 3 недели!`);
      } else if (day === state.week) {
        cs.removedAtWeek = day;
        log(state, `Консоль «${c.name}» снята с производства`);
      }
    }
  }
}

// реальный календарь: 1 апреля 1985 = день 1; год = 365 дней
// месяцы (апрель..март): 30,31,30,31,31,30,31,30,31,31,28,31
const MONTH_OFFSETS = [0, 30, 61, 91, 122, 153, 183, 214, 244, 275, 306, 334]; // первое число месяца (день года, 1-based)
export const MONTH_NAMES_RU = ['апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря', 'января', 'февраля', 'марта'];
const MONTH_DAYS = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31];

export function dateToDay(date: [number, number, number]): number {
  // date = [год, месяц (1=апрель), день]; год 1 = 1985
  return (date[0] - 1) * CONFIG.YEAR_LENGTH + (MONTH_OFFSETS[date[1] - 1] ?? 0) + date[2];
}

// день года (1..365) → { месяц (0..11, от апреля), день месяца }
export function dayToDate(dayInYear: number): { month: number; day: number } {
  for (let m = 0; m < 12; m++) {
    const start = MONTH_OFFSETS[m]!;
    const len = MONTH_DAYS[m]!;
    if (dayInYear <= start + len) return { month: m, day: dayInYear - start };
  }
  return { month: 11, day: 31 };
}

// человекочитаемая дата: «15 июня 1986» (week = игровой день)
export function dateLabel(week: number): string {
  const year = Math.floor((week - 1) / CONFIG.YEAR_LENGTH) + 1985;
  const dayInYear = ((week - 1) % CONFIG.YEAR_LENGTH) + 1;
  const { month, day } = dayToDate(dayInYear);
  return `${day} ${MONTH_NAMES_RU[month]} ${year}`;
}

// фанаты: медленный спад
export function fanDecay(state: GameState): void {
  state.fans *= CONFIG.FAN_DECAY;
}

// ежегодная церемония наград (M12W3)
export function awardsCeremony(state: GameState, rng: Rng): void {
  const yearStart = (state.year - 1) * CONFIG.YEAR_LENGTH + 1;
  const eligible = state.history.filter(
    (h) => h.releaseWeek >= yearStart && h.score >= CONFIG.HALL_OF_FAME,
  );
  if (eligible.length === 0) return;

  const winner = [...eligible].sort((a, b) => b.score - a.score)[0]!;
  const year = state.year;

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
  const design = [...eligible].sort((a, b) => b.attrs.graphics - a.attrs.graphics)[0]!;
  if (design.attrs.graphics >= 150) {
    state.money += CONFIG.PRIZE_DESIGN;
    state.awards.design += 1;
    design.awards.push(`Лучший дизайн ${year}`);
    log(state, `🎨 Лучший дизайн ${year}: «${design.name}» (+${CONFIG.PRIZE_DESIGN}K)`);
  }
  const music = [...eligible].sort((a, b) => b.attrs.sound - a.attrs.sound)[0]!;
  if (music.attrs.sound >= 150) {
    state.money += CONFIG.PRIZE_MUSIC;
    state.awards.music += 1;
    music.awards.push(`Лучшая музыка ${year}`);
    log(state, `🎵 Лучшая музыка ${year}: «${music.name}» (+${CONFIG.PRIZE_MUSIC}K)`);
  }
}

function formatUnits(u: number): string {
  return u >= 1000 ? `${(u / 1000).toFixed(2)}M` : `${Math.round(u)}K`;
}

function log(state: GameState, text: string): void {
  state.log.push({ week: state.week, year: state.year, text });
  if (state.log.length > CONFIG.LOG_CAP) state.log.splice(0, state.log.length - CONFIG.LOG_CAP);
}
