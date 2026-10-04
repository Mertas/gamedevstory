// v1.47.9: слои окон — сжатие в 10..N. Счётчик z растёт с каждым кликом и копится в сейве;
// в реальной партии он дошёл до 9834 и окна перекрыли меню «Пуск» (9500) и Webamp (8998).
import { describe, expect, it } from 'vitest';
import { WIN_Z_BASE, WIN_Z_CAP, packWinZ } from '../src/ui/winz';

const win = (id: string, z: number) => ({ id, z });

describe('сжатие слоёв окон (packWinZ)', () => {
  it('порядок слоёв сохраняется, диапазон 10..N, счётчик у верха', () => {
    const { wins, next } = packWinZ([win('a', 9834), win('b', 109), win('c', 9833)]);
    const z = (id: string) => wins.find((w) => w.id === id)!.z;
    expect(z('b')).toBe(WIN_Z_BASE);
    expect(z('c')).toBe(WIN_Z_BASE + 1);
    expect(z('a')).toBe(WIN_Z_BASE + 2);
    expect(next).toBe(WIN_Z_BASE + 3);
  });

  it('после сжатия счётчик всегда ниже планки Webamp/Пуска', () => {
    const many = Array.from({ length: 40 }, (_, i) => win(`w${i}`, 9800 + i));
    const { next } = packWinZ(many);
    expect(next).toBeLessThan(WIN_Z_CAP);
    expect(next).toBeLessThan(8998); // Webamp
    expect(next).toBeLessThan(9500); // меню «Пуск»
  });

  it('пустой список — не падает, счётчик у базы', () => {
    const { wins, next } = packWinZ([]);
    expect(wins).toEqual([]);
    expect(next).toBe(WIN_Z_BASE);
  });

  it('равные z не роняют порядок (стабильная сортировка)', () => {
    const { wins, next } = packWinZ([win('a', 5), win('b', 5)]);
    expect(wins.map((w) => w.id)).toEqual(['a', 'b']);
    expect(next).toBe(WIN_Z_BASE + 2);
  });
});
