// Раскладка иконок рабочего стола по плиткам (сетка 84×80, отступ 4).
// Вынесено из Desktop.tsx, чтобы правила были чистыми и тестируемыми:
// новые иконки (открывшиеся с прогрессом) встают на ПЕРВУЮ СВОБОДНУЮ плитку.
export interface TilePos {
  x: number;
  y: number;
}

export const TILE_W = 84;
export const TILE_H = 80;
export const TILE_X0 = 4;
export const TILE_Y0 = 4;

/** Ключ плитки по позиции (округление к ближайшей ячейке — как при снапе). */
export function tileKey(x: number, y: number): string {
  return `${Math.round((x - TILE_X0) / TILE_W)}:${Math.round((y - TILE_Y0) / TILE_H)}`;
}

/** Позиция плитки по её индексу: порядок раскладки — сверху вниз, затем следующий столбец. */
export function tilePos(i: number, rows: number): TilePos {
  return { x: TILE_X0 + Math.floor(i / rows) * TILE_W, y: TILE_Y0 + (i % rows) * TILE_H };
}

/**
 * Первые свободные плитки для count новых иконок: сканируем по порядку раскладки и
 * пропускаем занятые. Несколько новых иконок получают разные плитки (порядок ids важен).
 */
export function firstFreeTiles(occupied: TilePos[], count: number, rows: number): TilePos[] {
  const busy = new Set(occupied.map((p) => tileKey(p.x, p.y)));
  const out: TilePos[] = [];
  let i = 0;
  while (out.length < count) {
    const p = tilePos(i, rows);
    if (!busy.has(tileKey(p.x, p.y))) {
      out.push(p);
      busy.add(tileKey(p.x, p.y));
    }
    i++;
    if (i > 100_000) break; // страховка от бесконечного цикла (недостижимо на практике)
  }
  return out;
}
