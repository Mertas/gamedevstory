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

/** Шаг хореографии: сервер описывает, клиент показывает мышкой. */
export type AutopilotStep =
  | { kind: 'open'; app: string } // открыть окно приложения (id из APP_DEFS)
  | { kind: 'plan'; plan: AutopilotPlan } // заполнить визард значениями решения
  | { kind: 'click'; target: string; label: string }; // мышка к элементу [data-autopilot]
