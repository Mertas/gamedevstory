// Версия формата сейва и миграции.
// ПРАВИЛО: новое поле GameState = поднять SAVE_VERSION + миграция здесь; ручные
// нормализации — тоже здесь (их зовут SaveManager.read/importPayload), не в game.ts.
import type { GameState, Staff } from './types';
import { staffNameRu } from './data/staff-ru';
import { capInit } from '../shared/train';
import { ownConsoleStartBase } from '../shared/consoles';
import { avatarGender } from '../shared/hero';
import { CONSOLES } from './data/db';
import { buildFranchises } from './systems/franchise';

export const SAVE_VERSION = 19; // 19: PLAN-52 M1 медиа-империя — франшизы (выводятся из history); 18: аудит-51 05-P2-6 финал партии (finale; ставит тик) и письмо двадцатилетия (anniversary20); 17: v1.54.9 бустеры-заряды (применение требует неиспользованной покупки, аудит-51); 16: PLAN-49 Э3 числа саги (startWeek/lastWeek/lastGap — «эпоха» и «прошло» в текстах); 15: PLAN-49 сага «Синяя Комета» (опциональное поле saga; старт после первого релиза); 14: пол героя по аватарке и родовые формы текстов (11.10.2026); 13: PLAN-48 главный герой и партнёр (поля необязательные у старых сейвов); 12: v1.40 процедурные квесты (годовой слот nextQuestWeek); 11: PLAN-44 сюжетные линии (арки событий); 10: v1.34 своя консоль (стартовая база от фанатов, резолв в мастере); 9: PLAN-41 пороги статов (caps, история, автотренировка, отпуск); 8: запас руководств по смене профессии; 7: русские имена сотрудников; 6: PLAN-30 оценки прессы /100 (10 критиков); 5: studioName; 4: Gamedex; 3: mail; 2: реклама; 1 = до 04.09.2026

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
  if (v < 6) {
    // PLAN-30: старая шкала оценок — сумма 12–40 (4 рецензента); на экране была ×2.5.
    // Переводим архив в новую шкалу 30–100 (10 критиков), чтобы числа не «съехали».
    for (const h of state.history) h.score = Math.round(h.score * 2.5);
    if (state.activeGame?.score != null) state.activeGame.score = Math.round(state.activeGame.score * 2.5);
    for (const letter of state.mail ?? []) {
      if (letter?.score != null && letter.score <= 40) letter.score = Math.round(letter.score * 2.5);
    }
  }
  if (v < 7) {
    // 16.09: имена сотрудников в UI — на русские (по id; в данных имена остаются английскими)
    for (const s of state.staff) s.name = staffNameRu(s.id, s.name);
  }
  if (v < 8) {
    // запас руководств по смене профессии (новое поле; старые сейвы — 0)
    state.careerManuals = typeof state.careerManuals === 'number' ? state.careerManuals : 0;
  }
  if (v < 9) {
    // PLAN-41: пороги статов (caps), история сотрудника, счётчики обучения, отпуск.
    // Порог не ниже текущего стата (max(стат×2, стат+10)) — легаси-сейвы ничего не теряют.
    for (const st of state.staff) {
      st.caps = st.caps ?? capInit(st.stats);
      st.history = Array.isArray(st.history) ? st.history : [];
      st.trainCount = st.trainCount ?? {};
      st.restDays = typeof st.restDays === 'number' ? st.restDays : 0;
      for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
        st.caps[k] = Math.max(st.caps[k] ?? 0, st.stats[k] ?? 0);
      }
      // легаси-фикс: активная профессия с уровнем 0 (её нельзя было качать) — с Lv1
      if ((st.careers[st.activeCareer] ?? 0) < 1) st.careers[st.activeCareer] = 1;
    }
  }
  if (v < 10) {
    // v1.34: своя консоль — стартовая база от фанатов. У старых сейвов база 0 (первая игра
    // продавала 0 копий); компоненты/имя не восстановить — консоль получит базовую силу ×8.
    for (const [id, cs] of Object.entries(state.consoles)) {
      if (id.startsWith('own-') && cs.base === 0) cs.base = ownConsoleStartBase(state.fans ?? 0);
    }
  }

  // repair-нормализации, не зависящие от версии (висящие инварианты легаси-сейвов):
  // v1.43: продавец — тост-заметка без паузы; висящий salesman-попап снимаем всегда —
  // в новых клиентах его нет, иначе игра встала бы навсегда
  if (state.pendingEvent?.type === 'salesman') state.pendingEvent = null;

  // аудит-51 01-P2-7: консоли, добавленные в данные ПОСЛЕ старта партии, у старых сейвов
  // отсутствуют в state.consoles — движок молча их не видит. Repair не зависит от версии:
  // доводим сейв до полного списка CONSOLES (существующие записи не трогаем).
  state.consoles ??= {};
  for (const c of CONSOLES) {
    state.consoles[c.id] ??= {
      licensed: c.licenseCost === 0,
      base: c.installBase,
      availableAtWeek: null,
      removedAtWeek: null,
    };
  }

  if (v < 11) {
    // PLAN-44: сюжетные линии — каркас состояния (старые сейвы без арок)
    state.story = state.story ?? { arcs: {}, flags: {} };
  }
  if (v < 12) {
    // v1.40: процедурные квесты — раз в год; старым партиям слот выдаём не сразу
    const st = state.story ?? (state.story = { arcs: {}, flags: {} });
    if (!st.flags.nextQuestWeek) st.flags.nextQuestWeek = state.week + 60;
  }
  if (v < 13) {
    // PLAN-48: главный герой и партнёр живут только в новых партиях; старым — ренты нет
    state.partnerRentPct = typeof state.partnerRentPct === 'number' ? state.partnerRentPct : 0;
  }
  if (v < 14) {
    // 11.10.2026: пол героя — по аватарке. До v14 герой всегда создавался с 'M' (даже с женской
    // аватаркой); выравниваем. Нечётные player-NN — парни, чётные — девушки (shared/hero).
    for (const s of state.staff) {
      if (s.hero && s.avatarId) s.gender = avatarGender(s.avatarId);
    }
  }
  if (v < 15) {
    // PLAN-49: сага «Синяя Комета» — новое опциональное поле saga; в новых партиях его создаёт
    // движок (старт после первого релиза), старым сейвам заполнять нечего. Защита от мусора:
    // неполное состояние саги (чужой формат/обрыв) — сбрасываем, сага начнётся заново.
    if (state.saga && (!state.saga.node || !Array.isArray(state.saga.flags))) state.saga = undefined;
  }
  if (v < 16) {
    // PLAN-49 Э3: числа саги — опорные точки времени для {≈эпоха}/{≈прошло}. Старым сейвам:
    // старт «сейчас», пауза 0 — первая интерлюдия покажет фактический скачок.
    if (state.saga) {
      state.saga.startWeek = state.saga.startWeek ?? state.week;
      state.saga.lastWeek = state.saga.lastWeek ?? state.week;
      state.saga.lastGap = state.saga.lastGap ?? 0;
    }
  }
  if (v < 17) {
    // аудит-51: бустеры получили расходник-«заряд» (применение без купленного бустера закрыто).
    // Старым сейвам выдаём заряд за каждую историческую покупку — раньше они применялись свободно,
    // так игрок ничего не теряет; дальше заряд тратится по одному на применение.
    const charges: Record<string, number> = {};
    for (const [type, n] of Object.entries(state.boosterPurchases ?? {})) charges[type] = n;
    state.boosterCharges = state.boosterCharges ?? charges;
  }
  if (v < 18) {
    // аудит-51 05-P2-6: финал партии (finale ставит тик) и письмо двадцатилетия.
    // Старым сейвам за 20 лет письмо задним числом не шлём — фиксируем факт юбилея.
    if (state.week >= 20 * 365) state.anniversary20 = true;
  }
  if (v < 19) {
    // PLAN-52 M1: франшизы и мерч (медиа-империя) — выводим из архива игр тем же путём, что
    // живые релизы: сильные игры (80+) рождают франшизы, повторы комбо — сиквелы. Ничего не теряется.
    state.franchises = buildFranchises(state);
  }
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
