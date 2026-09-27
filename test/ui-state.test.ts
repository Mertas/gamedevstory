// PLAN-24/41: sanitizeUi — валидация ui-патча с клиента. Ключи иконок включают staff:<id>
// (PLAN-42-fix): двоеточие допустимо, иначе позиции иконок сотрудников выпадали из сейва.
import { describe, expect, it } from 'vitest';
import { sanitizeUi } from '../src/server/ui-state';

describe('sanitizeUi: иконки рабочего стола', () => {
  it('позиции staff:<id> сохраняются (двоеточие в ключе)', () => {
    const out = sanitizeUi({ icons: { code: { x: 4, y: 4 }, 'staff:newb-ownerton': { x: 172, y: 244 } } }, undefined);
    expect(out.icons).toEqual({ code: { x: 4, y: 4 }, 'staff:newb-ownerton': { x: 172, y: 244 } });
  });

  it('мусорные ключи отбрасываются, координаты зажимаются и округляются', () => {
    const longKey = 'a'.repeat(41);
    const out = sanitizeUi({
      icons: {
        '../evil': { x: 1, y: 2 },
        BAD: { x: 1, y: 2 },
        [longKey]: { x: 1, y: 2 },
        code: { x: -99999, y: 999999 },
        broken: { x: 'нет', y: 2 },
      },
    }, undefined);
    expect(Object.keys(out.icons ?? {})).toEqual(['code']);
    expect(out.icons?.code).toEqual({ x: -2000, y: 20000 });
  });

  it('не-объектные icons игнорируются, prev сохраняется', () => {
    const prev = { icons: { code: { x: 4, y: 4 } } };
    const out = sanitizeUi({ icons: 'мусор' }, prev);
    expect(out.icons).toEqual(prev.icons);
  });

  it('типовой ui с иконками приложений и сотрудников проходит санитайз без потерь', () => {
    const ui = {
      wallpaper: null,
      windows: [{ id: 'code', x: 40, y: 30, w: 640, h: 420, z: 1, minimized: false, maximized: false, closed: false }],
      icons: { code: { x: 4, y: 4 }, 'staff:newb-ownerton': { x: 88, y: 164 } },
    };
    expect(sanitizeUi(ui, undefined)).toEqual(ui);
  });
});
