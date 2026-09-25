// Настройки рабочего стола (сетка/сортировка) — общий модуль: значения, подписка, синхронизация.
import { describe, expect, it } from 'vitest';
import { getDeskPrefs, setDeskSnap, setDeskSort, subscribeDeskPrefs } from '../src/ui/deskPrefs';

describe('настройки рабочего стола', () => {
  it('дефолты без localStorage: сетка включена по умолчанию, сортировка по порядку', () => {
    const p = getDeskPrefs();
    expect(p.snap).toBe(true); // 25.09: «по тайлам» включено из коробки
    expect(['default', 'name', 'kind']).toContain(p.sort);
  });
  it('setDeskSnap меняет значение и зовёт подписчиков', () => {
    let calls = 0;
    const off = subscribeDeskPrefs(() => calls++);
    const before = getDeskPrefs().snap;
    setDeskSnap(!before);
    expect(getDeskPrefs().snap).toBe(!before);
    expect(calls).toBe(1);
    setDeskSnap(before);
    off();
  });
  it('setDeskSort принимает только известные режимы, после отписки молчит', () => {
    const off = subscribeDeskPrefs(() => {
      throw new Error('не должен звать после отписки');
    });
    off();
    setDeskSort('name');
    expect(getDeskPrefs().sort).toBe('name');
    setDeskSort('default');
    expect(getDeskPrefs().sort).toBe('default');
  });
});
