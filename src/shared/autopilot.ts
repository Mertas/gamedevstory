// Типы автопилота (plan/14): общие для сервера (решение/шаги) и клиента (хореография).
// API по замечанию пользователя: LLM отдаёт ОДИН JSON со всеми параметрами новой игры,
// а все движения виртуальной мыши и нажатия разруливает UI.

export interface AutopilotPlan {
  genreId: string;
  typeId: string;
  consoleId: string;
  mode: 'normal' | 'speed' | 'quality' | 'research' | 'budget';
  direction: Record<string, number>;
  proposalStaffId: string;
  assignments: { program: string[]; graphics: string[]; sound: string[]; debug: string[] };
}

/** Клики по осям направления, чтобы из current попасть в want (визард стартует с прошлого проекта):
 *  сначала все «−» (освобождаем бюджет), потом все «+» — «+» заблокирован при исчерпанных очках.
 *  Оси без изменений не трогаем: курсор не «обнуляет всё и поднимает заново». */
export function planDirClicks(
  current: Record<string, number>,
  want: Record<string, number>,
  axes: readonly string[],
): { axis: string; sign: 1 | -1 }[] {
  const norm = (v: number | undefined): number => Math.max(0, Math.round(v ?? 0));
  const clicks: { axis: string; sign: 1 | -1 }[] = [];
  for (const axis of axes) {
    for (let i = 0; i < norm(current[axis]) - norm(want[axis]); i++) clicks.push({ axis, sign: -1 });
  }
  for (const axis of axes) {
    for (let i = 0; i < norm(want[axis]) - norm(current[axis]); i++) clicks.push({ axis, sign: 1 });
  }
  return clicks;
}

/** Максимум одной оси направления (как в визарде). */
export const DIRECTION_AXIS_MAX = 8;

/** Добить упор до бюджета партии: ведущие (ненулевые) оси — до максимума, затем свободные
 *  оси «пакетами» по 8 в порядке списка (ось ≤ 8, как в визарде). Автопилот распределяет
 *  ВЕСЬ доступный пул — свободных очков не остаётся. */
export function topUpDirection(
  direction: Record<string, number>,
  directionPoints: number,
  axes: readonly string[],
): void {
  let spent = Object.values(direction).reduce((a, b) => a + b, 0);
  const raise = (axis: string, onlyExisting: boolean): void => {
    if (spent >= directionPoints) return;
    const cur = Math.max(0, Math.round(direction[axis] ?? 0));
    if (cur >= DIRECTION_AXIS_MAX) return;
    if (onlyExisting && cur <= 0) return;
    const add = Math.min(DIRECTION_AXIS_MAX - cur, directionPoints - spent);
    direction[axis] = cur + add;
    spent += add;
  };
  for (const axis of axes) raise(axis, true); // ведущие оси упора — до максимума
  for (const axis of axes) raise(axis, false); // свободные оси — пакетами по 8
}

/** Шаг хореографии: сервер описывает, клиент показывает мышкой. */
export type AutopilotStep =
  | { kind: 'open'; app: string } // открыть окно приложения (id из APP_DEFS)
  | { kind: 'plan'; plan: AutopilotPlan } // заполнить визард значениями решения
  // мышка к элементу [data-autopilot]; cosmetic — действие уже применено сервером:
  // жмём «витринно» (волна+утопление) без повторного клика; quick — короткий перелёт
  | { kind: 'click'; target: string; label: string; cosmetic?: boolean; quick?: boolean }
  | { kind: 'card'; staffId: string; app: string; label?: string } // реальный клик по карточке в окне приложения
  | { kind: 'select'; target: string; value: string; label?: string }; // выбор в <select> (напр. кому бустер)
