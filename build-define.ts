// Версия игры для сборки И тестов (plan/23_Версионирование.md).
// Единственный источник — package.json; подключается в vite.config.ts и vitest.config.ts,
// иначе клиент и тесты разъедутся (тесты шли мимо define и видели заглушку).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

export const buildDefine: Record<string, string> = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
};
