// CLI-прогон: pnpm play [seed] [days] [easy|normal|hard] (или GDS_DIFFICULTY=hard pnpm play)
import { newGame, tick } from '../src/core/engine';
import { applyDifficulty, isDifficultyId, type DifficultyId } from '../src/core/difficulty';
import { createPlayer, type PolicyStats } from '../src/core/sim/policy';
import { CONFIG } from '../src/core/config';

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 730);
// M6: уровень сложности — третьим аргументом или переменной окружения (по умолчанию «нормальный»)
const levelArg: unknown = process.argv[4] ?? process.env.GDS_DIFFICULTY ?? 'normal';
const level: DifficultyId = isDifficultyId(levelArg) ? levelArg : 'normal';
applyDifficulty(level);

const state = newGame(seed);
const player = createPlayer();
const stats: PolicyStats = { hires: 0, fires: 0, releases: 0, boostAccepts: 0, licenses: 0 };

for (let i = 0; i < days; i++) {
  if (state.bankrupt) break;
  player.turn(state, stats);
  tick(state);
}

console.log(`=== ИТОГ (уровень: ${level}) ===`);
console.log(`Сид ${seed}, дней: ${state.week - 1} (год ${state.year})`);
console.log(`Деньги: ${Math.round(state.money)}K | PR: ${Math.round(state.research)} | Фанаты: ${Math.round(state.fans)}`);
console.log(`Сотрудники: ${state.staff.length} | Наймов: ${stats.hires} | Релизов: ${stats.releases} | Бустов: ${stats.boostAccepts} | Лицензий: ${stats.licenses}`);
console.log(`Банкрот: ${state.bankrupt} | Награды: GP ${state.awards.grand}, Design ${state.awards.design}, Music ${state.awards.music}`);
console.log('--- История игр ---');
for (const h of state.history) {
  console.log(
    `Y${h.year} D${h.releaseWeek % 365} «${h.name}» ${h.score}/100 ${h.score >= CONFIG.HALL_OF_FAME ? '🏆' : ''} | продано ${(h.units / 1000).toFixed(2)}M (${Math.round(h.revenue)}K) | баги на релизе ${h.bugs}`,
  );
}
console.log('--- Последние события ---');
for (const l of state.log.slice(-25)) {
  console.log(`Y${l.year} D${l.week % 365} ${l.text}`);
}
// PLAN-52 M1/M2: портфель франшиз и линии мерча (медиа-империя) — контроль метрики «пассив ≤ 30%»
const fr = Object.values(state.franchises ?? {});
console.log('--- Империя ---');
console.log(`Франшиз: ${fr.length} | линий мерча: ${fr.filter((f) => f.merch).length}`);
for (const f of fr.sort((a, b) => b.brand - a.brand).slice(0, 8)) {
  const line = f.merch ? ` · ${CONFIG.MERCH_LINES[f.merch.line].name} (${CONFIG.MERCH_BUDGETS[f.merch.budget].name})` : '';
  console.log(`«${f.name}» бренд ${Math.round(f.brand)}/100 · релизов ${f.releases.length}${line}`);
}
