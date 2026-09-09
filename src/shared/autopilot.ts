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

/** Шаг хореографии: сервер описывает, клиент показывает мышкой. */
export type AutopilotStep =
  | { kind: 'open'; app: string } // открыть окно приложения (id из APP_DEFS)
  | { kind: 'plan'; plan: AutopilotPlan } // заполнить визард значениями решения
  | { kind: 'click'; target: string; label: string }; // мышка к элементу [data-autopilot]
