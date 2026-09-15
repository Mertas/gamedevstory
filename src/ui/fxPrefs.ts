// «Эффекты экрана» — уровни и подписи в одном месте: ПКМ-манею рабочего стола и приложению «Настройки».
import type { FxLevel } from '../shared/dev-anim';

/** M3.8 (plan/31 §9.8): уровни эффектов экрана разработки. */
export const FX_ROWS: Array<{ id: FxLevel; title: string; hint: string }> = [
  { id: 'full', title: 'Полно — вся вода', hint: 'капли, рябь, праздники, жизнь простоя (по умолчанию)' },
  { id: 'mid', title: 'Средне — без амбиента', hint: 'рабочая вода: капли и рябь; без сценок простоя, дождя и тряски' },
  { id: 'min', title: 'Минимум — сухо', hint: 'ничего не летит: числа и полоски сразу (для слабых машин)' },
];

/** M3.8: prefers-reduced-motion без падения там, где matchMedia нет (тесты/старые среды). */
export function safeReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
