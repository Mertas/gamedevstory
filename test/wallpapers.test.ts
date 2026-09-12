// PLAN-24: обои рабочего стола — описания в коде и файлы в репозитории должны совпадать.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { WALLPAPERS } from '../src/ui/wallpapers';

const P = (url: string) => new URL('../public' + url, import.meta.url);

describe('PLAN-24 обои рабочего стола', () => {
  it('список непустой, id уникальны, названия заполнены', () => {
    expect(WALLPAPERS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(WALLPAPERS.map((w) => w.id)).size).toBe(WALLPAPERS.length);
    for (const w of WALLPAPERS) {
      expect(w.title.length).toBeGreaterThan(2);
      expect(w.file.startsWith('/wallpapers/')).toBe(true);
      expect(w.thumb.startsWith('/wallpapers/thumbs/')).toBe(true);
    }
  });

  it('каждый файл и каждое превью реально лежат в public/', () => {
    const missing = WALLPAPERS.filter((w) => !existsSync(P(w.file)) || !existsSync(P(w.thumb)));
    expect(missing.map((w) => w.id)).toEqual([]);
  });
});
