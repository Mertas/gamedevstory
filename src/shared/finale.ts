// аудит-51 05-P2-6: данные итогового экрана партии («счёт по активам» — капитал).
// Чистая функция: значения только из переданного состояния — клиент рисует, тесты сверяют.
import type { GameState } from '../core/types';

export interface FinaleReportData {
  /** капитал на момент завершения истории (K) — «счёт по активам» */
  worth: number;
  /** сколько лет студия в деле (1-based игровой год) */
  years: number;
  /** календарные годы работы: «1985–2011» */
  yearsLabel: string;
  /** релизов в архиве (история хранит последние 32 игры) */
  gamesCount: number;
  /** лучшая игра по оценке прессы (при равенстве — по копиям) */
  best: { name: string; score: number; units: number } | null;
  awards: { grand: number; design: number; music: number; runnerUp: number };
  fans: number;
  /** своя консоль, если выпускали */
  consoleName: string | null;
}

export function finaleReport(game: GameState): FinaleReportData {
  // полные годы работы: день 7300 = ровно 20 лет; партия стартует 1 апреля 1985
  const years = Math.floor(game.week / 365);
  const fromYear = 1985;
  const toYear = 1985 + years;

  let best: FinaleReportData['best'] = null;
  for (const h of game.history) {
    if (!h?.name) continue;
    const cand = {
      name: h.name,
      score: Math.round(h.score ?? 0), // score уже /100 (PLAN-30)
      units: Math.round(h.paidUnits ?? h.units ?? 0),
    };
    if (!best || cand.score > best.score || (cand.score === best.score && cand.units > best.units)) best = cand;
  }

  return {
    worth: Math.round(game.finale?.worth ?? game.money),
    years,
    yearsLabel: `${fromYear}–${toYear}`,
    gamesCount: game.history.length,
    best,
    awards: {
      grand: game.awards.grand,
      design: game.awards.design,
      music: game.awards.music,
      runnerUp: game.awards.runnerUp,
    },
    fans: game.fans,
    consoleName: game.ownConsole?.name ?? null,
  };
}
