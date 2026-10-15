// PLAN-40: что показывать в игре с прогрессом. Принцип босса: недоступное не рисуется вообще —
// никаких серых кнопок, элемент либо есть, либо его нет.
// Пороги утверждены в plan/40; авторежим — победа (100/100, аккаунт).

export interface UnlockCtx {
  /** релизов в текущем сейве (game.history.length) */
  saveReleases: number;
  /** релизов за всю историю аккаунта (все сейвы) — пороги скоростей */
  accountReleases: number;
  /** победа: 100/100 хотя бы раз (аккаунт) */
  victory: boolean;
  officeLevel: number;
  /** офисы, которых требуют известные заказы (meta.contracts → office ?? 1) */
  contractOffices: number[];
  /** PLAN-52 M1: в сейве есть хотя бы одна франшиза (игра 80+) */
  hasFranchise: boolean;
}

/**
 * Скорости таскбара: база [пауза, ½, 1×] + награды за релизы аккаунта —
 * ×2 после 100-го, ×4 и ×8 после 500-го (решение босса 25.09.2026, plan/40).
 */
export function speedOptions(accountReleases: number): number[] {
  const out = [0, 0.5, 1];
  if (accountReleases >= 100) out.push(2);
  if (accountReleases >= 500) out.push(4, 8);
  return out;
}

/** Видимость приложения рабочего стола / меню «Пуск» (plan/40, раздел Б). */
export function isAppVisible(id: string, ctx: UnlockCtx): boolean {
  switch (id) {
    case 'archive':
    case 'mail':
      // хранить/писать/получать письма до первого релиза нечего
      return ctx.saveReleases >= 1;
    case 'contracts':
      // появляется вместе с первым доступным заказом (офис дотянулся)
      return ctx.contractOffices.some((o) => ctx.officeLevel >= o);
    case 'empire':
      // PLAN-52 M1: «Империя» открывается вместе с первой франшизой (игра 80+)
      return ctx.hasFranchise;
    default:
      // маркетинг и остальные — с начала игры (plan/40, п.7)
      return true;
  }
}
