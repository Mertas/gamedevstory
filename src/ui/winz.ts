// Слои окон: z живёт в узком диапазоне. Фиксированные планки интерфейса —
// Webamp 8998 (WebampLayer.tsx), панель задач 9000, меню «Пуск» 9500 (win95.css) —
// обязаны быть ВЫШЕ любого окна, иначе окна их перекрывают: счётчик окон растёт
// с каждым кликом и копится в сейве, доходило до 9834 — «Пуск» и Winamp уходили под окна.

export const WIN_Z_BASE = 10;
/** Планка: при её достижении слои окон сжимаются (должна быть ниже Webamp 8998). */
export const WIN_Z_CAP = 8000;

export interface WinZ {
  id: string;
  z: number;
}

/** Сжать слои окон в WIN_Z_BASE.. по текущему порядку (порядок сохраняется).
 *  Возвращает новый список и следующее значение счётчика. */
export function packWinZ<T extends WinZ>(ws: T[]): { wins: T[]; next: number } {
  const order = [...ws].sort((a, b) => a.z - b.z);
  const map = new Map<string, number>();
  order.forEach((w, i) => map.set(w.id, WIN_Z_BASE + i));
  return {
    wins: ws.map((w) => {
      const z = map.get(w.id) as number;
      return z === w.z ? w : { ...w, z };
    }),
    next: WIN_Z_BASE + order.length,
  };
}
