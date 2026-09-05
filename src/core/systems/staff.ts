// Система персонала: стартовая команда, найм, увольнение, зарплаты, POWER.
import { CONFIG, type HireMethodId } from '../config';
import { STAFF } from '../data/db';
import { salaryWithLevels } from '../formulas';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, Staff } from '../types';

export function makeStaffFromData(id: string): Staff | null {
  const d = STAFF.find((s) => s.id === id);
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    gender: d.gender as 'M' | 'F',
    salary: d.salary,
    hireFee: d.hireFee,
    maxPower: d.maxPower,
    power: d.maxPower,
    stats: { ...d.stats },
    careers: { ...d.careers },
    activeCareer: d.activeCareer,
    levelUps: 0,
    boosterUses: {},
    avatar: '',
    homeWeeks: 0,
    lastRole: null,
  };
}

export const AVATAR_COUNT = 48; // public/avatars/avatar-01..48.png (tools/make-avatars.ts)

export function pickAvatar(rng: Rng): string {
  return `avatars/avatar-${String(rng.int(1, AVATAR_COUNT)).padStart(2, '0')}.png`;
}

// пул кандидатов для метода найма: не нанятые сотрудники, чей unlock подходит
export function candidatePool(state: GameState, method: HireMethodId): string[] {
  const cfg = CONFIG.HIRE_METHODS[method];
  return STAFF.filter(
    (d) =>
      !state.hiredIds.includes(d.id) &&
      cfg.pool.some((p) => d.unlock.includes(p) || (p === 'Word of Mouth' && d.unlock === 'Initially available')),
  ).map((d) => d.id);
}

export function hireStaff(
  state: GameState, method: HireMethodId, rng: Rng,
  opts?: { maxFee?: number },
): ActionResult & { staffId?: string } {
  const cfg = CONFIG.HIRE_METHODS[method];
  if (state.officeLevel < cfg.office) return { ok: false, error: `Нужен офис ${cfg.office}` };
  if (state.staff.length >= CONFIG.OFFICE_CAPACITY[state.officeLevel]) {
    return { ok: false, error: 'Нет мест в офисе' };
  }
  if (state.money < cfg.cost) return { ok: false, error: 'Не хватает денег на поиск' };
  const pool = candidatePool(state, method);
  if (pool.length === 0) return { ok: false, error: 'Кандидатов нет' };

  // показываем 3 кандидатов, игрок выбирает; для политики — случайный выбор
  const picks: string[] = [];
  const poolCopy = [...pool];
  for (let i = 0; i < Math.min(CONFIG.HIRE_CANDIDATES, poolCopy.length); i++) {
    const idx = rng.int(0, poolCopy.length - 1);
    picks.push(poolCopy.splice(idx, 1)[0]!);
  }
  // бюджетный фильтр: дешёвые кандидаты, если задан потолок взноса
  const affordable = opts?.maxFee ? picks.filter((id) => (STAFF.find((d) => d.id === id)?.hireFee ?? 0) <= opts.maxFee!) : picks;
  const chosenPool = affordable.length > 0 ? affordable : picks;
  const chosen = chosenPool[rng.int(0, chosenPool.length - 1)]!;
  return hireStaffById(state, chosen, method, rng, opts);
}

// нанять КОНКРЕТНОГО кандидата (выбранного игроком в окне «Найм»)
export function hireStaffById(
  state: GameState, staffId: string, method: HireMethodId, rng: Rng, opts?: { maxFee?: number },
): ActionResult & { staffId?: string } {
  const cfg = CONFIG.HIRE_METHODS[method];
  const d = STAFF.find((x) => x.id === staffId);
  if (!d) return { ok: false, error: 'Нет такого кандидата' };
  if (state.hiredIds.includes(staffId)) return { ok: false, error: 'Этот кандидат уже не доступен' };
  const pool = candidatePool(state, method);
  if (!pool.includes(staffId)) return { ok: false, error: 'Кандидат не из этого пула' };
  if (opts?.maxFee && d.hireFee > opts.maxFee) return { ok: false, error: 'Слишком дорогой кандидат' };
  if (state.money < cfg.cost + d.hireFee) return { ok: false, error: 'Не хватает денег' };

  const staff = makeStaffFromData(staffId);
  if (!staff) return { ok: false, error: 'Ошибка данных' };
  staff.avatar = pickAvatar(rng);
  state.money -= cfg.cost + d.hireFee;
  state.staff.push(staff);
  state.hiredIds.push(staff.id);
  log(state, `Нанят: ${staff.name} (${staff.activeCareer} Lv${staff.careers[staff.activeCareer]}, взнос ${staff.hireFee}K, зарплата ${staff.salary}K/год)`);
  return { ok: true, staffId: staff.id };
}

export function fireStaff(state: GameState, staffId: string): ActionResult {
  const i = state.staff.findIndex((s) => s.id === staffId);
  if (i < 0) return { ok: false, error: 'Нет такого сотрудника' };
  const s = state.staff[i]!;
  state.staff.splice(i, 1);
  // аудит 05.09: уволенный возвращается в пул кандидатов (раньше hiredIds.push() делал
  // обратное заявленному — повторный найм был невозможен, плюс копились дубли)
  state.hiredIds = state.hiredIds.filter((id) => id !== s.id);
  log(state, `Уволен: ${s.name}`);
  return { ok: true };
}

// годовая зарплата (конец марта); 1-й год бесплатно
// рост +20% только за повышения уровня ПОСЛЕ найма (уровни из данных уже в базовой зарплате)
export function paySalaries(state: GameState): void {
  if (state.year === 1 && CONFIG.FIRST_YEAR_FREE) return;
  const total = state.staff.reduce((a, s) => a + salaryWithLevels(s.salary, s.levelUps), 0);
  if (state.money >= total) {
    state.money -= total;
    log(state, `Выплачены зарплаты: ${Math.round(total)}K`);
  } else if (!state.emergencyFundUsed) {
    state.emergencyFundUsed = true;
    state.money += CONFIG.EMERGENCY_FUND - total;
    log(state, `Не хватило на зарплаты (${Math.round(total)}K)! Использован резервный фонд $150K`);
    if (state.money < 0) bankrupt(state);
  } else {
    log(state, `Не хватило на зарплаты (${Math.round(total)}K) — банкротство!`);
    bankrupt(state);
  }
}

export function careerLevelSum(s: Staff): number {
  return Object.values(s.careers).reduce((a, b) => a + b, 0);
}

export function bankrupt(state: GameState): void {
  state.bankrupt = true;
  state.money = 0;
}

// POWER: работа тратит (1 за 7 дней работы), простой/дом восстанавливает (раз в 7 дней)
export function dailyPower(state: GameState, worked: boolean, rng: Rng): void {
  if (state.week % 7 !== 1) return; // обновляем раз в 7 дней (как было еженедельно)
  for (const s of state.staff) {
    if (s.homeWeeks > 0) {
      s.homeWeeks--;
      s.power = Math.min(s.maxPower, s.power + 3);
      if (s.homeWeeks === 0) log(state, `${s.name} вернулся в офис`);
      continue;
    }
    if (worked) s.power -= 1;
    else s.power = Math.min(s.maxPower, s.power + 3);
    if (s.power <= 0) {
      s.power = 0;
      s.homeWeeks = rng.int(1, 2);
      log(state, `${s.name} вымотался и ушёл домой`);
    }
  }
}
