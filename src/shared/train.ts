// PLAN-41: общие формулы порогов статов (ядро, UI и автопилот используют ОДНИ числа).
// Пороги (caps) — персональные для каждого сотрудника; обучение не может их превысить.
import { CONFIG } from '../core/config';

export type StatKey = 'program' | 'scenario' | 'graphics' | 'sound';
export const STAT_KEYS: StatKey[] = ['program', 'scenario', 'graphics', 'sound'];
export const STAT_SHORT: Record<StatKey, string> = { program: 'Пр', scenario: 'Сц', graphics: 'Гр', sound: 'Зв' };
export const STAT_LONG: Record<StatKey, string> = { program: 'Программирование', scenario: 'Сценарий', graphics: 'Графика', sound: 'Звук' };

export interface StatCaps { program: number; scenario: number; graphics: number; sound: number }

/** стартовые пороги сотрудника по его базовым статам: max(стат×2, стат+10) */
export function capInit(stats: StatCaps): StatCaps {
  const one = (v: number) => Math.max(Math.round(v * CONFIG.CAP_INIT_MULT), Math.round(v) + CONFIG.CAP_INIT_FLAT);
  return { program: one(stats.program), scenario: one(stats.scenario), graphics: one(stats.graphics), sound: one(stats.sound) };
}

/** масштаб тренировки: floor(порог/100), минимум ×1 */
export function trainScale(cap: number): number {
  return Math.max(1, Math.floor((cap || 0) / CONFIG.TRAIN_SCALE_DIV));
}

/** фактический прирост тренировки для стата с данным порогом (плюсы И минусы масштабируются) */
export function effTrainDelta(base: number | null | undefined, cap: number): number {
  const b = base ?? 0;
  if (b === 0) return 0;
  return Math.round(b * trainScale(cap));
}

/** прирост порога за событие: вес профессии × mult (левелап ×1 / смена ×CAP_CHANGE_MULT),
 *  с бонусом «залит до максимума» (×CAP_MAX_BONUS) */
export function capGain(weight: number, mult: number, maxed: boolean): number {
  return Math.round((weight || 0) * mult * (maxed ? CONFIG.CAP_MAX_BONUS : 1));
}
