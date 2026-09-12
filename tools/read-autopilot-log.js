// PLAN-26: читалка журнала промахов автопилота. Локально: node tools/read-autopilot-log.js <путь к users.db>
// На сервере: scp tools/read-autopilot-log.js gds-vdsina:/tmp/ && ssh gds-vdsina "node /tmp/read-autopilot-log.js"

const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[2] ?? '/srv/gds/shared/data/users.db', { readOnly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
console.log('таблицы:', tables.join(', '));
try {
  const n = db.prepare('SELECT COUNT(*) AS n FROM autopilot_log').get();
  console.log('строк в autopilot_log:', n.n);
  const rows = db.prepare('SELECT * FROM autopilot_log ORDER BY id DESC LIMIT 20').all();
  for (const r of rows) {
    const t = new Date(Number(r.ts)).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`[${t}] ${r.kind} | ${r.target ?? '-'} | ${r.label ?? '-'} | dom=${String(r.dom).slice(0, 120)}`);
  }
  if (!rows.length) console.log('(пока пусто — это нормально, лог появится при первом промахе)');
} catch (e) {
  console.log('autopilot_log недоступна:', e.message);
}
