// Версия игры и id сборки для /api/health (plan/23_Версионирование.md).
import { readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';

/** Версия игры: единственный источник — package.json рядом с релизом. */
export function gameVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Id сборки: имя каталога релиза (20260912-031102-962f90d) или 'dev' вне релиза. */
export function buildId(): string {
  try {
    const b = basename(realpathSync(process.cwd()));
    return /^\d{8}-\d{6}-/.test(b) ? b : 'dev';
  } catch {
    return 'dev';
  }
}
