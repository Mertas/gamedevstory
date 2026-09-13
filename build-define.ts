// Версия игры для сборки И тестов (plan/23_Версионирование.md).
// Единственный источник — package.json; подключается в vite.config.ts и vitest.config.ts,
// иначе клиент и тесты разъедутся (тесты шли мимо define и видели заглушку).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };

/**
 * PLAN-33: дата и время последнего коммита — для штампа версии в углу экрана.
 * В деплое git-истории нет (релиз — это git archive), поэтому post-receive передаёт GDS_COMMIT_AT.
 */
function commitAt(): string {
  const fromEnv = (process.env.GDS_COMMIT_AT ?? '').trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('git log -1 --format=%cd --date=format:%d.%m.%Y_%H:%M', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .replace('_', ' ');
  } catch {
    return '';
  }
}

export const buildDefine: Record<string, string> = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  __COMMIT_AT__: JSON.stringify(commitAt()),
};
