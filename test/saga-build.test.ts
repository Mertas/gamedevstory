// аудит-51 04-P2-5: тест на дрейф автогена — `src/shared/saga-data.ts` должен байт-в-байт
// совпадать с пересборкой из `quest-test/saga.json` (аналог test/difficulty.test.ts для difficulty).
// Косяк в каноне саги или ручная правка автогена без пересборки — тест падает с подсказкой.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(tmpdir(), `gds-saga-draft-${process.pid}.ts`);
const norm = (s: string): string => s.replace(/\r\n/g, '\n');

describe('saga-data.ts ↔ quest-test/saga.json', () => {
  it('пересборка генератором совпадает с закоммиченным файлом (дрейфа нет)', () => {
    try {
      execFileSync(process.execPath, ['tools/build-saga.mjs', '--out', OUT], { cwd: ROOT, stdio: 'pipe' });
      const fresh = norm(readFileSync(OUT, 'utf8'));
      const current = norm(readFileSync(join(ROOT, 'src', 'shared', 'saga-data.ts'), 'utf8'));
      expect(
        fresh === current,
        'src/shared/saga-data.ts устарел: контент правлен в quest-test/saga.json без пересборки (или автоген правили руками). Запустите: pnpm saga:build',
      ).toBe(true);
    } finally {
      rmSync(OUT, { force: true });
    }
  }, 60_000);
});
