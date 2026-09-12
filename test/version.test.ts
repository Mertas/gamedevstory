// PLAN-23: версия игры — из package.json, у клиента через vite define.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_VERSION, BUILD_DATE, versionLabel, versionTitle } from '../src/shared/version';
import { gameVersion, buildId } from '../src/server/version';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('PLAN-23 версионирование', () => {
  it('версия одна для клиента, сервера и package.json', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION).toBe(pkg.version);
    expect(gameVersion()).toBe(pkg.version);
  });

  it('подпись версии — «vX.Y.Z · ДД.ММ.ГГГГ»', () => {
    expect(versionLabel()).toMatch(/^v\d+\.\d+\.\d+/);
    if (BUILD_DATE) expect(versionLabel()).toContain(BUILD_DATE.split('-').reverse().join('.'));
    expect(versionTitle()).toContain(versionLabel());
  });

  it('id сборки вне релиза — dev (в релизе это имя каталога)', () => {
    expect(buildId() === 'dev' || /^\d{8}-\d{6}-/.test(buildId())).toBe(true);
  });
});
