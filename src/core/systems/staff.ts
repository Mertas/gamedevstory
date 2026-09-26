// Система персонала: стартовая команда, найм, увольнение, зарплаты, POWER.
import { CONFIG, type HireMethodId } from '../config';
import { STAFF } from '../data/db';
import { salaryWithLevels } from '../formulas';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, Staff, StaffHistoryEntry } from '../types';
import { HIRE_BANDS, HIRE_METHOD_LABELS, unlockedMystery } from '../../shared/hire';
import { CAREER_LABELS } from '../../shared/careers';
import { capInit } from '../../shared/train';

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
    caps: capInit(d.stats),
    history: [],
    trainCount: {},
    restDays: 0,
  };
}

/** PLAN-41: запись в историю сотрудника (кольцо — храним последние 60 записей) */
export function pushHistory(s: Staff, week: number, kind: StaffHistoryEntry['kind'], text: string): void {
  s.history ??= [];
  s.history.push({ week, kind, text });
  if (s.history.length > 60) s.history.splice(0, s.history.length - 60);
}

const AVATAR_COUNT = 48; // public/avatars/avatar-01..48.png (tools/make-avatars.ts)

export function pickAvatar(rng: Rng): string {
  return `avatars/avatar-${String(rng.int(1, AVATAR_COUNT)).padStart(2, '0')}.png`;
}

// пул кандидатов метода: слой таланта (M7) — не нанятые сотрудники слоя
export function candidateBand(state: GameState, method: HireMethodId): string[] {
  const band = HIRE_BANDS[method] ?? [];
  return band.filter((id) => !state.hiredIds.includes(id));
}

// список кандидатов поиска: до HIRE_CANDIDATES случайных из слоя; открытый спец-сотрудник
// ЭТОГО метода — гарантированно в списке (M7: «заплатил — увидел героя», максимум один).
// mysteryId передаётся из startSearch (посчитан ДО списания за поиск — «10 млн на балансе»)
export function rollCandidates(state: GameState, method: HireMethodId, rng: Rng, mysteryId?: string | null): string[] {
  const picks: string[] = [];
  const m = mysteryId !== undefined ? mysteryId : unlockedMystery(state, method);
  if (m) picks.push(m);
  const copy = candidateBand(state, method).filter((id) => !picks.includes(id));
  while (picks.length < CONFIG.HIRE_CANDIDATES && copy.length > 0) {
    picks.push(copy.splice(rng.int(0, copy.length - 1), 1)[0]!);
  }
  return picks;
}

/** M7: поиск сотрудников — платный; результат (список) хранится в сейве и живёт
 *  до следующего поиска; найм из списка — отдельно, по взносу кандидата. */
export function startSearch(
  state: GameState, method: HireMethodId, rng: Rng,
): ActionResult & { candidates?: string[] } {
  const cfg = CONFIG.HIRE_METHODS[method];
  if (state.officeLevel < cfg.office) return { ok: false, error: `Нужен офис ${cfg.office}` };
  if (state.money < cfg.cost) return { ok: false, error: 'Не хватает денег на поиск' };
  const band = candidateBand(state, method);
  const mystery = unlockedMystery(state, method); // до списания: «10 млн на балансе» — на момент поиска
  if (band.length === 0 && !mystery) return { ok: false, error: 'Кандидатов нет' };

  state.money -= cfg.cost;
  const candidates = rollCandidates(state, method, rng, mystery);
  state.activeSearch = { method, ids: candidates, week: state.week };
  log(state, `Поиск (${HIRE_METHOD_LABELS[method]}): −${cfg.cost}K, кандидатов: ${candidates.length}`);
  return { ok: true, candidates };
}

// нанять кандидата из текущего списка поиска (выбор игрока в окне «Найм»)
export function hireFromSearch(
  state: GameState, staffId: string, rng: Rng,
): ActionResult & { staffId?: string } {
  const search = state.activeSearch;
  if (!search || !search.ids.includes(staffId)) return { ok: false, error: 'Кандидата нет в текущем списке поиска' };
  if (state.hiredIds.includes(staffId)) return { ok: false, error: 'Этот кандидат уже не доступен' };
  const d = STAFF.find((x) => x.id === staffId);
  if (!d) return { ok: false, error: 'Нет такого кандидата' };
  if (state.staff.length >= CONFIG.OFFICE_CAPACITY[state.officeLevel]) {
    return { ok: false, error: 'Нет мест в офисе' };
  }
  if (state.money < d.hireFee) return { ok: false, error: 'Не хватает денег на взнос' };

  const staff = makeStaffFromData(staffId);
  if (!staff) return { ok: false, error: 'Ошибка данных' };
  staff.avatar = pickAvatar(rng);
  state.money -= d.hireFee;
  state.staff.push(staff);
  state.hiredIds.push(staff.id);
  search.ids = search.ids.filter((id) => id !== staffId);
  log(state, `Нанят: ${staff.name} (${staff.activeCareer} Lv${staff.careers[staff.activeCareer]}, взнос ${staff.hireFee}K, зарплата ${staff.salary}K/год)`);
  pushHistory(staff, state.week, 'hire', `Нанят: ${CAREER_LABELS[staff.activeCareer] ?? staff.activeCareer} Lv${staff.careers[staff.activeCareer] ?? 1}, взнос ${staff.hireFee}K`);
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

export function bankrupt(state: GameState): void {
  state.bankrupt = true;
  state.money = 0;
}

// POWER: работа тратит (1 за 7 дней работы), простой/дом восстанавливает (раз в 7 дней)
export function dailyPower(state: GameState, worked: boolean, rng: Rng): void {
  if (state.week % 7 !== 1) return; // обновляем раз в 7 дней (как было еженедельно)
  for (const s of state.staff) {
    if ((s.restDays ?? 0) > 0) continue; // PLAN-41: в отпуске — POWER не тратит и не копит (вернётся полным)
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

/** M9: кто занят на несданном контракте — эти люди не работают над проектом
 *  и не могут быть назначены на второй контракт. */
export function busyStaffIds(state: GameState): Set<string> {
  const busy = new Set<string>();
  for (const c of state.contracts) {
    if (c.done) continue;
    for (const id of c.staffIds) busy.add(id);
  }
  return busy;
}

// ─── PLAN-41: отпуск («отправить на отдых») ───

/** отправить сотрудника в отпуск: CONFIG.REST_DAYS дней, по возвращении POWER полный */
export function restStaff(state: GameState, staffId: string): ActionResult {
  const s = state.staff.find((x) => x.id === staffId);
  if (!s) return { ok: false, error: 'Нет такого сотрудника' };
  if ((s.restDays ?? 0) > 0) return { ok: false, error: `${s.name} уже в отпуске (${s.restDays} дн.)` };
  if (s.homeWeeks > 0) return { ok: false, error: `${s.name} сейчас дома (вымотался)` };
  if (busyStaffIds(state).has(s.id)) return { ok: false, error: `${s.name} занят на контракте` };
  if (s.power >= s.maxPower) return { ok: false, error: 'POWER и так на максимуме' };
  s.restDays = CONFIG.REST_DAYS;
  log(state, `🧳 ${s.name} уходит в отпуск (${CONFIG.REST_DAYS} дн.) — POWER восстановится полностью`);
  pushHistory(s, state.week, 'rest', `Отпуск ${CONFIG.REST_DAYS} дн. (POWER ${Math.round(s.power)}/${s.maxPower})`);
  return { ok: true };
}

/** ежедневный тик отпуска (вызывается из tick): отсчёт дней и полное восстановление POWER */
export function tickRest(state: GameState): void {
  for (const s of state.staff) {
    if ((s.restDays ?? 0) <= 0) continue;
    s.restDays -= 1;
    if (s.restDays === 0) {
      s.power = s.maxPower;
      log(state, `🧳 ${s.name} вернулся из отпуска (POWER ${s.maxPower}/${s.maxPower})`);
      pushHistory(s, state.week, 'back', `Вернулся из отпуска — POWER полный (${s.maxPower})`);
    }
  }
}
