// M8 «Железо»: даты консолей, пороги событийных консолей, компоненты своей консоли —
// один источник для движка и UI (src/shared/consoles.ts).
import { describe, expect, it } from 'vitest';
import { dateToDay, EVENT_CONSOLE_REQ, ownConsoleDays, OWN_CONSOLE_CPUS, OWN_CONSOLE_MEDIA } from '../src/shared/consoles';
import { CONFIG } from '../src/core/config';

describe('shared/consoles: даты и пороги', () => {
  it('dateToDay: старт года — день 1, границы месяцев сходятся', () => {
    expect(dateToDay([1, 1, 1])).toBe(1); // 1 апреля 1985
    expect(dateToDay([1, 2, 1])).toBe(31); // 1 мая = 30 дней апреля + 1
    expect(dateToDay([1, 11, 1])).toBe(307); // 306 (сумма апрель..январь) + 1 = 1 февраля 1986
    expect(dateToDay([2, 1, 1])).toBe(366); // второй игровой год
  });

  it('пороги событийных консолей — из CONFIG (единый источник)', () => {
    expect(EVENT_CONSOLE_REQ['jupiter-512']).toEqual({ grand: CONFIG.GRAND_CONSOLE_JUPITER });
    expect(EVENT_CONSOLE_REQ.gamejohn).toEqual({ grand: CONFIG.GRAND_CONSOLE_GAMEJOHN, units: CONFIG.GAMEJOHN_UNITS_K });
  });

  it('ownConsoleDays: базовый срок 12 недель, топ-компоненты — сильно дольше', () => {
    expect(ownConsoleDays(0, 0)).toBe(CONFIG.OWN_CONSOLE_WEEKS_BASE * 7);
    const top = ownConsoleDays(
      OWN_CONSOLE_CPUS.findIndex((c) => c.id === 'potato-chip'),
      OWN_CONSOLE_MEDIA.findIndex((m) => m.id === 'punch-cards'),
    );
    expect(top).toBe((CONFIG.OWN_CONSOLE_WEEKS_BASE + 7 * CONFIG.OWN_CONSOLE_WEEKS_PER_INDEX) * 7);
    expect(top).toBeGreaterThan(ownConsoleDays(0, 0));
  });
});
