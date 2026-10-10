// Аудит-51 (02-P1-3): прод-зависимости с уязвимостями critical/high останавливают `pnpm check`.
// Сбой самого аудита (нет сети, реестр недоступен) деплой НЕ блокирует — только предупреждение:
// недоступность npm-реестра не должна ронять выкладку игры.
import { spawnSync } from 'node:child_process';

const res = spawnSync('pnpm', ['audit', '--prod', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const out = String(res.stdout ?? '');
let vulns = null;
try {
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  vulns = JSON.parse(start >= 0 && end > start ? out.slice(start, end + 1) : '{}').metadata?.vulnerabilities ?? null;
} catch {
  /* не JSON — ветка «аудит недоступен» ниже */
}
if (!vulns) {
  console.warn('[audit-guard] отчёт аудита недоступен (реестр/сеть?) — проверка пропущена');
  process.exit(0);
}
const critical = Number(vulns.critical ?? 0);
const high = Number(vulns.high ?? 0);
if (critical + high > 0) {
  console.error(`[audit-guard] уязвимости прод-зависимостей: critical=${critical}, high=${high} — исправьте до деплоя`);
  process.exit(1);
}
console.log(`[audit-guard] прод-зависимости чистые: critical=0, high=0 (moderate=${Number(vulns.moderate ?? 0)})`);
