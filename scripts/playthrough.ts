// CLI-прогон: pnpm play [seed] [days]
import { newGame, tick } from '../src/core/engine';
import { createPlayer, type PolicyStats } from '../src/core/sim/policy';

const seed = Number(process.argv[2] ?? 1);
const days = Number(process.argv[3] ?? 730);

const state = newGame(seed);
const player = createPlayer();
const stats: PolicyStats = { hires: 0, releases: 0, boostAccepts: 0, licenses: 0 };

for (let i = 0; i < days; i++) {
  if (state.bankrupt) break;
  player.turn(state, stats);
  tick(state);
}

console.log('=== ИТОГ ===');
console.log(`Сид ${seed}, дней: ${state.week - 1} (год ${state.year})`);
console.log(`Деньги: ${Math.round(state.money)}K | PR: ${Math.round(state.research)} | Фанаты: ${Math.round(state.fans)}`);
console.log(`Сотрудники: ${state.staff.length} | Наймов: ${stats.hires} | Релизов: ${stats.releases} | Бустов: ${stats.boostAccepts} | Лицензий: ${stats.licenses}`);
console.log(`Банкрот: ${state.bankrupt} | Награды: GP ${state.awards.grand}, Design ${state.awards.design}, Music ${state.awards.music}`);
console.log('--- История игр ---');
for (const h of state.history) {
  console.log(
    `Y${h.year} D${h.releaseWeek % 365} «${h.name}» ${h.score}/40 ${h.score >= 32 ? '🏆' : ''} | продано ${(h.units / 1000).toFixed(2)}M (${Math.round(h.revenue)}K) | баги на релизе ${h.bugs}`,
  );
}
console.log('--- Последние события ---');
for (const l of state.log.slice(-25)) {
  console.log(`Y${l.year} D${l.week % 365} ${l.text}`);
}
