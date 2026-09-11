// Версия формата сейва и миграции.
// ПРАВИЛО: новое поле GameState = поднять SAVE_VERSION + миграция здесь; ручные
// нормализации — тоже здесь (их зовут SaveManager.read/importPayload), не в game.ts.
import type { GameState, Staff } from './types';

export const SAVE_VERSION = 5; // 5: название студии (studioName); 4: Gamedex; 3: письма (mail); 2: реклама; 1 = всё до 04.09.2026

export function migrateSave(state: GameState): GameState {
  const v = state.saveVersion ?? 1; // сейвы без saveVersion — v1

  if (v < 2) {
    state.adFansGained = state.adFansGained ?? {};
  }
  if (v < 3) {
    state.mail = state.mail ?? [];
    state.mailId = state.mailId ?? 0;
  }
  if (v < 4) {
    state.gamedexHere = state.gamedexHere ?? false;
    state.lastGamedex = state.lastGamedex ?? null;
    state.gamedexFame = state.gamedexFame ?? 0;
  }
  if (v < 5) {
    state.studioName = state.studioName || 'Game Dev Studio';
  }

  // repair-нормализации, не зависящие от версии (висящие инварианты легаси-сейвов):
  // продавец ушёл, а пауза-событие осталось — иначе игра встанет навсегда
  if (state.pendingEvent?.type === 'salesman' && !state.salesmanHere) state.pendingEvent = null;

  state.saveVersion = SAVE_VERSION;
  return state;
}

/** SRV-02: схемная проверка сейва перед подменой живой партии (только структура, без семантики). */
export function isValidGameState(x: unknown): x is GameState {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const s = x as Partial<GameState>;
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!num(s.week) || !num(s.year) || !num(s.money) || !num(s.fans) || !num(s.research)) return false;
  if (!Array.isArray(s.staff) || !Array.isArray(s.history)) return false;
  if (!s.staff.every((st) => !!st && typeof st.id === 'string' && typeof st.name === 'string')) return false;
  if (s.mail !== undefined && !Array.isArray(s.mail)) return false;
  if (s.consoles !== undefined && (typeof s.consoles !== 'object' || s.consoles === null || Array.isArray(s.consoles))) return false;
  if (s.log !== undefined && !Array.isArray(s.log)) return false;
  // сейв «из будущего» не грузим: миграций вперёд нет
  if (s.saveVersion !== undefined && (!num(s.saveVersion) || s.saveVersion > SAVE_VERSION)) return false;
  return true;
}

// ─── легаси: игра начата до введения счётчика вклада — восстановить приблизительно ───
// Точную историю восстановить нельзя (она не хранилась); оцениваем по текущим очкам
// проекта и долям сотрудников в «котле» (роль — профильный навык, безролевой — средний).
export function normalizeLegacyContrib(state: GameState): void {
  const g = state.activeGame;
  if (!g || g.contribTotal) return;
  g.contribTotal = {};
  const sumPoints =
    (g.points?.fun ?? 0) + (g.points?.creativity ?? 0) + (g.points?.graphics ?? 0) + (g.points?.sound ?? 0);
  if (sumPoints <= 0) return;
  // котёл как в devTick: роль даёт профильный навык, безролевой — средний, debug не вкладчик
  const ROLE_STAT: Record<string, keyof Staff['stats']> = {
    proposal: 'scenario', program: 'program', graphics: 'graphics', sound: 'sound',
  };
  const assignedRoles: Record<string, string[]> = {};
  for (const [role, ids] of Object.entries(g.assignments ?? {})) for (const id of ids ?? []) (assignedRoles[id] ??= []).push(role);
  let total = 0;
  const statOf: Record<string, number> = {};
  for (const s of state.staff) {
    const roles = assignedRoles[s.id] ?? [];
    if (!s.stats) continue;
    const st = s.stats;
    let stat = 0;
    for (const r of roles) {
      const key = ROLE_STAT[r];
      if (key) stat += st[key] ?? 0;
    }
    if (stat === 0) stat = (st.program + st.scenario + st.graphics + st.sound) / 4; // безролевой-универсал
    statOf[s.id] = stat;
    total += stat;
  }
  if (total <= 0) return;
  for (const s of state.staff) g.contribTotal[s.id] = ((sumPoints * (statOf[s.id] ?? 0)) / total) || 0;
}
