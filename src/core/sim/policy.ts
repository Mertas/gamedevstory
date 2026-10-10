// Скриптованный игрок («разумная» политика) — для баланс-тестов и CLI-прогона.
// Стратегия: дешёвые S-комбо, ротация ролей, найм при деньгах, отладка до ≤5 багов.
import { CONFIG, type HireMethodId } from '../config';
import { ADS, STAFF, TRAININGS } from '../data/db';
import { CONSOLES, GENRES, TYPES } from '../data/db';
import type { GameState, Staff, StartProjectInput } from '../types';
import { comboGrade, consoleAvailable, genreById, typeById } from '../systems/dev';
import { BOOSTER_KEY_JOB, boosterPrice } from '../systems/progression';
import { salaryWithLevels } from '../formulas';
import { candidateBand } from '../systems/staff';
import { SAGA_NODES } from '../../shared/saga-data';
import { sagaCondOk } from '../../shared/saga-text';
import { unlockedMystery } from '../../shared/hire';
import { DIRECTION_ORDER } from '../types';
import { hasTraining } from '../../shared/rules';
import { DIRECTION_AXIS_MAX, topUpDirection } from '../../shared/autopilot';
import { STORY_ARCS } from '../../shared/storylines';
import {
  applyBoosterAction, buyAdAction, buyBoosterAction, dismissSalesmanAction, fireAction, searchAction,
  hireFromSearchAction, levelUpAction,
  moveOfficeAction, releaseAction, resolveBoostAction, resolveEventAction, resolveFinaleAction, resolveGamedexAction, resolveSagaAction, resolveStoryAction,
  skipMinigame, startProjectAction, trainAction,
} from '../engine';

export interface PolicyStats {
  hires: number;
  /** AP-09: увольнения автопилота (замена слабейшего сильным кандидатом) */
  fires: number;
  releases: number;
  boostAccepts: number;
  licenses: number;
}

// Скриптованный игрок: контекст на запуск (lastCombo — без глобального состояния,
// иначе прогоны не детерминированы)
/** Видимость автопилота: что политика РЕАЛЬНО сделала за ход (сервер → шаги мыши). */
export type PolicyAction =
  | { type: 'levelup'; staffId: string }
  | { type: 'train'; staffId: string; trainingId: number }
  | { type: 'ad'; adId: number }
  | { type: 'office' }
  | { type: 'search'; method: HireMethodId }
  | { type: 'hire'; staffId?: string; method?: HireMethodId }
  | { type: 'fire'; staffId: string; name?: string }
  | { type: 'license'; consoleId: string }
  | { type: 'booster'; boosterType: string; staffId: string };

export interface ScriptedPlayer {
  turn(state: GameState, stats: PolicyStats, journal?: PolicyAction[]): void;
}

export interface PlayerOptions {
  /** SRV-04: автопилот не стартует проекты сам — только резолвит события (старт — через чат-решение) */
  resolveOnly?: boolean;
}

/**
 * PLAN-25: резолв висящего события (бусты, продавец, Gamedex, инфо-попапы, релиз).
 * Вынесено из turn(): сервер решает события на РЕАЛЬНОМ состоянии, а «хозяйство»
 * (прокачка, найм, лицензии) — на копии, чтобы клики мыши применяли действия ПОСЛЕ показа.
 */
export function resolvePendingEvent(state: GameState, stats: PolicyStats, journal?: PolicyAction[]): void {
      // PLAN-39: мини-игру автопилот не играет — закрывает нейтрально (0)
      if (state.pendingEvent?.type === 'minigame') skipMinigame(state, 'автопилот');
      // буст — принимаем с разумной ставкой (до 30 PR), продавца — прогоняем
      if (state.pendingEvent?.type === 'boost') {
        // аудит 05.09: ставка должна быть ≤ research И ≥ 1, иначе resolveBoost
        // оставляет событие висеть (валидация до мутаций) и политика зацикливается
        const amount = Math.min(Math.floor(state.research), 30);
        const accept = amount >= 1;
        resolveBoostAction(state, accept, amount);
        if (accept) stats.boostAccepts++;
      }
      // PLAN-44: сюжетные арки — автопилот берёт первый доступный вариант (по деньгам)
      if (state.pendingEvent?.type === 'story') {
        const ev = state.pendingEvent;
        // v1.40: у процедурных квестов опции лежат в состоянии, у авторских — в STORY_ARCS
        const step = STORY_ARCS[ev.arcId]?.steps[ev.step - 1];
        const opts = state.story?.arcs[ev.arcId]?.gen?.options ?? step?.options ?? [];
        const opt = opts.find((o) => o.cost == null || state.money >= o.cost);
        resolveStoryAction(state, opt?.id ?? '');
      }
      // PLAN-49: глава саги — «разумный игрок»: вариант без трат (если есть), иначе первый
      // доступный. Покупка сувениров в кредит истории не нужна (story-арки — тоже «по деньгам»).
      if (state.pendingEvent?.type === 'saga') {
        const s = state.saga;
        const node = s ? SAGA_NODES[s.node] : undefined;
        let idx: number | null = null;
        if (s && node && s.stage === 'choice') {
          for (let i = 0; i < node.choices.length; i++) {
            const c = node.choices[i]!;
            if (!sagaCondOk(state, c.cond)) continue;
            const costly = (c.effects ?? []).some((e) => e.k === 'money' && e.v < 0);
            if (!costly) { idx = i; break; }
          }
        }
        resolveSagaAction(state, idx == null ? '' : String(idx));
      }
      // 05-P2-6: итог партии — автопилот закрывает («свободная игра» после истории)
      if (state.pendingEvent?.type === 'finale') resolveFinaleAction(state);
      // AP-06: продавец — не просто «прогоняем»: пока он в городе, берём бустеры (при деньгах)
      if (state.pendingEvent?.type === 'salesman' || state.salesmanHere) {
        buyBoosterForAutopilot(state, journal);
        if (state.pendingEvent?.type === 'salesman') dismissSalesmanAction(state);
      }
      // Gamedex: лучший доступный стенд (запас 300K на зарплаты), нет денег — не участвуем
      if (state.pendingEvent?.type === 'gamedex') {
        const afford = (Object.entries(CONFIG.GAMEDEX_OPTIONS) as Array<[keyof typeof CONFIG.GAMEDEX_OPTIONS, (typeof CONFIG.GAMEDEX_OPTIONS)[keyof typeof CONFIG.GAMEDEX_OPTIONS]]>)
          .filter(([id, o]) => id !== 'none' && state.money >= o.cost + 300)
          .sort((a, b) => b[1].cost - a[1].cost);
        resolveGamedexAction(state, afford[0] ? afford[0][0] : 'none');
      }
      // info-попапы движка (медиа-события, анлоки консолей) и результаты действий
      if (state.pendingEvent?.type === 'disaster' || state.pendingEvent?.type === 'boost_result'
        || state.pendingEvent?.type === 'release_result' || state.pendingEvent?.type === 'info') {
        resolveEventAction(state);
      }
      if (state.pendingEvent?.type === 'ready_to_release') {
        const res = releaseAction(state);
        if (res.ok) stats.releases++;
      }
      if (state.pendingEvent?.type === 'release_result') resolveEventAction(state);
}

export function createPlayer(opts: PlayerOptions = {}): ScriptedPlayer {
  let lastCombo: { genreId: string; typeId: string } | null = null;
  // AP-09: уволенных автопилотом обратно не нанимаем — иначе «карусель» слабейших
  // (в движке уволенный возвращается в пул кандидатов — это механика, её не трогаем)
  const turnedDown = new Set<string>();

  return {
    turn(state: GameState, stats: PolicyStats, journal?: PolicyAction[]): void {
      // без гейта: ветка продавца (бустеры) работает и без попапа события
      resolvePendingEvent(state, stats, journal);

// M3: прокачка — левел-ап, если PR хватает (приоритет активной профессии)
      if (state.research >= 40) {
        for (const s of [...state.staff].sort((a, b) => b.stats.scenario + b.stats.program - (a.stats.scenario + a.stats.program))) {
          const lv = s.careers[s.activeCareer] ?? 0;
          if (lv >= 5) continue;
          const price = CONFIG.LEVEL_PR[s.activeCareer]?.[lv - 1];
          if (price && state.research >= price && price <= 55) {
            const res = levelUpAction(state, s.id);
            if (res.ok) journal?.push({ type: 'levelup', staffId: s.id });
            break;
          }
        }
      }

      // M3: обучение — дешёвые тренинги при деньгах и POWER
      if (state.money > 200 && state.week % 28 === 0) { // раз в 4 недели
        const s = [...state.staff].sort((a, b) => b.power - a.power)[0];
        if (s && s.power >= 2 && state.money > 100) {
          // pinball (анлок Mahjong) раз в 12 недель, иначе anime
          const wantPinball = !hasTraining(state.unlockedTrainings, 'pinball') && state.week % 84 === 0;
          const t = TRAININGS.find((x) => x.id === (wantPinball ? 7 : 4));
          if (t) {
            const res = trainAction(state, s.id, t.id);
            if (res.ok) journal?.push({ type: 'train', staffId: s.id, trainingId: t.id });
          }
        }
      }

      // M4: реклама — доступный тип (по деньгам/офису/не исчерпан), не чаще раза в неделю
      if (state.money > 800 && state.activeGame && state.activeGame.phase !== 'released' && state.week % 7 === 0) {
        const ad = ADS.find(
          (a) =>
            state.officeLevel >= (a.office ?? 1) &&
            (state.adFansGained[a.id] ?? 0) < (CONFIG.AD_FAN_CAPS[a.id] ?? 0) &&
            state.money > (a.costWan ?? 0) / 10 + 300,
        );
        if (ad) {
          const res = buyAdAction(state, ad.id);
          if (res.ok) journal?.push({ type: 'ad', adId: ad.id });
        }
      }

      // AP-06: переезд офиса, когда движок считает готовым (год 4+/1000K, затем 7+/3500K) —
      // до найма, чтобы новые места были доступны уже в этом ходу
      if (state.officeLevel < 3) {
        const res = moveOfficeAction(state);
        if (res.ok) journal?.push({ type: 'office' });
      }

      // AP-06: лицензии — всё поступившее в продажу, по одной за ход, с резервом 800K
      // на жизнь (раньше — только Microx SX; она остаётся первой как самая дешёвая)
      if (state.money > 1500) {
        const next = CONSOLES.filter((c) => {
          const cs = state.consoles[c.id];
          return !!cs && !cs.licensed && c.licenseCost > 0
            && consoleAvailable(state, c.id)
            && state.money - c.licenseCost >= 800;
        }).sort((a, b) => a.licenseCost - b.licenseCost)[0];
        if (next && buyLicenseSafe(state, next.id)) {
          stats.licenses++;
          journal?.push({ type: 'license', consoleId: next.id });
        }
      }

      // AP-09: найм и увольнения — команда растёт до вместимости офиса (решения 11.09):
      // лучшие по статам с приоритетом слабой специализации, метод — дороже по деньгам,
      // увольнение — только на замену (офис полон и кандидат заметно сильнее). Найм — ПОСЛЕ
      // лицензий: без консоли студия не работает, а лицензия дешевле и важнее (тест AP-06).
      hireAndFire(state, stats, journal, turnedDown);

      // проект
      if (!state.activeGame) {
        if (opts.resolveOnly) return; // SRV-04: решение о новой игре принимает чат, не политика
        startNextProject(state, lastCombo, (combo) => {
          lastCombo = combo;
        });
        return;
      }
      if (state.activeGame.phase === 'debug' && (state.activeGame.bugs <= 5 || state.money < 150)) {
        const res = releaseAction(state);
        if (res.ok) stats.releases++;
      }
    },
  };
}

// ─── AP-09: найм и увольнения (решения пользователя 11.09) ───
// кого нанимать: лучших по статам, приоритет — слабая специализация команды;
// метод: самый дорогой, который тянем (сильнее пул); увольнять — только на замену.

const STAT_KEYS = ['program', 'scenario', 'graphics', 'sound'] as const;
type StatKey = (typeof STAT_KEYS)[number];

/** Максимум команды по каждой специализации — «где у нас слабо». */
function teamBest(state: GameState): Record<StatKey, number> {
  const best: Record<StatKey, number> = { program: 0, scenario: 0, graphics: 0, sound: 0 };
  for (const s of state.staff) for (const k of STAT_KEYS) best[k] = Math.max(best[k], s.stats[k]);
  return best;
}

/** Слабая специализация команды (по ней приоритет кандидату). */
export function weakKey(state: GameState): StatKey {
  const best = teamBest(state);
  return STAT_KEYS.reduce((a, b) => (best[b] < best[a] ? b : a), STAT_KEYS[0]);
}

/** Оценка сотрудника/кандидата: сумма статов + 1.5 × стат слабой специализации команды. */
export function staffScore(state: GameState, stats: Record<StatKey, number>): number {
  const weak = weakKey(state);
  const total = STAT_KEYS.reduce((a, k) => a + stats[k], 0);
  return total + 1.5 * stats[weak];
}

/** AP-09 (11.09): годовой фонд зарплат — найм не имеет права съесть деньги на зарплаты.
 *  Живой случай: 8 нанятых с фондом 3.06M против 1.4M в кассе — студия обнулилась
 *  на конец марта (день зарплат). Резерв найма = фонд (не меньше 500K — старт игры). */
function payroll(state: GameState): number {
  return state.staff.reduce((a, s) => a + salaryWithLevels(s.salary, s.levelUps), 0);
}

/** Резерв на жизнь: годовой фонд зарплат студии, но не меньше 500K (начало игры). */
function hireReserve(state: GameState): number {
  return Math.max(500, Math.round(payroll(state)));
}

/** Самый дорогой метод, который тянем (слой сильнее) — иначе null. */
function pickHireMethod(state: GameState): HireMethodId | null {
  const reserve = hireReserve(state);
  const methods = (Object.keys(CONFIG.HIRE_METHODS) as HireMethodId[])
    .filter((m) => state.officeLevel >= CONFIG.HIRE_METHODS[m].office)
    .filter((m) => state.money - CONFIG.HIRE_METHODS[m].cost >= reserve)
    .filter((m) => candidateBand(state, m).length > 0 || unlockedMystery(state, m) !== null)
    .sort((a, b) => CONFIG.HIRE_METHODS[b].cost - CONFIG.HIRE_METHODS[a].cost);
  return methods[0] ?? null;
}

/** Лучший кандидат из ТЕКУЩЕГО (оплаченного) списка поиска (уволенных автопилотом не берём). */
function pickBestCandidate(state: GameState, method: HireMethodId, turnedDown: Set<string>, reserve: number): string | null {
  const search = state.activeSearch;
  if (!search || search.method !== method) return null;
  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const id of search.ids) {
    if (turnedDown.has(id)) continue;
    const d = STAFF.find((x) => x.id === id);
    if (!d) continue;
    // хватает на взнос, на жизнь (резерв) и на зарплату новичка (годовой фонд растёт)
    if (state.money - d.hireFee < reserve + d.salary) continue;
    const score = staffScore(state, d.stats);
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

/** Слабейший в команде по той же оценке статов (ГГ и партнёр неприкосновенны — PLAN-48). */
function pickWeakest(state: GameState): Staff | null {
  let weak: Staff | null = null;
  let least = Infinity;
  for (const s of state.staff) {
    if (s.hero || typeof s.partnerPct === 'number') continue; // автопилот не трогает ГГ и партнёра
    const score = staffScore(state, s.stats);
    if (score < least) {
      least = score;
      weak = s;
    }
  }
  return weak;
}

/** AP-09: найм до вместимости офиса; увольнение — только под замену сильнее. */
function hireAndFire(state: GameState, stats: PolicyStats, journal: PolicyAction[] | undefined, turnedDown: Set<string>): void {
  const capacity = CONFIG.OFFICE_CAPACITY[state.officeLevel] ?? 4;
  const method = pickHireMethod(state);
  const reserve = hireReserve(state);

  // M7: сначала платный поиск (если списка этого метода ещё нет). Пустой поиск не оплачиваем:
  // смотрим, есть ли в слое кто-то по средствам (или открытый спец-сотрудник в Голливуде).
  if (method && (!state.activeSearch || state.activeSearch.method !== method || state.activeSearch.ids.length === 0)) {
    const affordable = candidateBand(state, method).some((id) => {
      const d = STAFF.find((x) => x.id === id);
      return !!d && state.money - (CONFIG.HIRE_METHODS[method].cost + d.hireFee) >= reserve + d.salary;
    });
    const mysteryId = unlockedMystery(state, method);
    const mysteryD = mysteryId ? STAFF.find((x) => x.id === mysteryId) : undefined;
    const mysteryOk = !!mysteryD
      && state.money - (CONFIG.HIRE_METHODS[method].cost + mysteryD.hireFee) >= reserve + mysteryD.salary;
    if (!affordable && !mysteryOk) return;
    const sres = searchAction(state, method);
    if (!sres.ok) return;
    journal?.push({ type: 'search', method });
  }

  const bestId = method ? pickBestCandidate(state, method, turnedDown, reserve) : null;
  const cand = bestId ? STAFF.find((x) => x.id === bestId) : undefined;

  // замена: офис полон и кандидат ЗАМЕТНО сильнее слабейшего (иначе — никакой «карусели»)
  if (method && cand && bestId && state.staff.length >= capacity && state.staff.length > 2) {
    const weak = pickWeakest(state);
    if (weak && weak.id !== bestId && staffScore(state, cand.stats) >= staffScore(state, weak.stats) * 1.2) {
      const res = fireAction(state, weak.id);
      if (res.ok) {
        stats.fires++;
        turnedDown.add(weak.id);
        journal?.push({ type: 'fire', staffId: weak.id, name: weak.name });
      }
    }
  }
  if (method && bestId && state.staff.length < CONFIG.OFFICE_CAPACITY[state.officeLevel]) {
    const res = hireFromSearchAction(state, bestId);
    if (res.ok) {
      stats.hires++;
      journal?.push({ type: 'hire', staffId: bestId, method }); // PLAN-25: метод нужен шагам — от него зависит список кандидатов
    }
  }
}

function buyLicenseSafe(state: GameState, consoleId: string): boolean {
  const c = CONSOLES.find((x) => x.id === consoleId);
  const cs = state.consoles[consoleId];
  if (!c || !cs || cs.licensed || state.money < c.licenseCost) return false;
  state.money -= c.licenseCost;
  cs.licensed = true;
  return true;
}

// AP-06: бустеры у продавца — покупаем по одному за ход и сразу несём в текущую
// разработку; цель — профильный сотрудник с неисчерпанным запасом (лимит 2 на тип)
function buyBoosterForAutopilot(state: GameState, journal?: PolicyAction[]): void {
  if (!state.salesmanHere) return;
  const g = state.activeGame;
  if (!g || g.phase === 'released') return;
  const options: Array<{ type: string; price: number; target: string }> = [];
  for (const type of CONFIG.BOOSTER_TYPES) {
    const price = boosterPrice(state, type);
    if (price === null || state.money < price + 1000) continue; // резерв 1000K на жизнь
    const target = boosterTarget(state, type);
    if (target) options.push({ type, price, target });
  }
  const pick = options.sort((a, b) => a.price - b.price)[0];
  if (!pick) return;
  if (!buyBoosterAction(state, pick.type).ok) return;
  applyBoosterAction(state, pick.target, pick.type);
  journal?.push({ type: 'booster', boosterType: pick.type, staffId: pick.target });
}

// AP-06: кому применять бустер — профильному сотруднику (полный эффект), иначе лучшему из любых
function boosterTarget(state: GameState, type: string): string | null {
  const keyJob = BOOSTER_KEY_JOB[type];
  const alive = [...state.staff]
    .filter((s) => (s.boosterUses[type] ?? 0) < 2)
    .sort((a, b) => b.power - a.power);
  return (alive.find((s) => s.activeCareer === keyJob) ?? alive[0])?.id ?? null;
}

interface ComboCandidate {
  genreId: string;
  typeId: string;
  grade: string;
  cost: number;
}

// лучшая доступная комбинация: максимум градации (S>A>B), минимум стоимости.
// AP-04: avoidGenreId — жанр свежего фан-разгрома: не берём его, пока есть альтернатива.
export function pickBestCombo(
  state: GameState,
  last: { genreId: string; typeId: string } | null,
  avoidGenreId?: string | null,
): ComboCandidate | null {
  const unlockedGenres = GENRES.filter((g) => {
    if (g.unlockJob && g.unlockLevel) {
      return state.staff.some((s) => (s.careers[g.unlockJob as keyof typeof s.careers] ?? 0) >= g.unlockLevel!);
    }
    return true;
  });
  const unlockedTypes = TYPES.filter((t) => {
    if (t.unlockJob && t.unlockLevel) {
      if (!state.staff.some((s) => (s.careers[t.unlockJob as keyof typeof s.careers] ?? 0) >= t.unlockLevel!)) return false;
    }
    if (!hasTraining(state.unlockedTrainings, t.unlockTraining)) {
      return false;
    }
    return true;
  });

  const consoleData = bestConsole(state);
  const gradeRank = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
  const search = (avoid: string | null): ComboCandidate | null => {
    let best: ComboCandidate | null = null;
    for (const g of unlockedGenres) {
      if (avoid && g.id === avoid) continue;
      for (const t of unlockedTypes) {
        if (last && last.genreId === g.id && last.typeId === t.id) continue; // избегаем дубля подряд
        const grade = comboGrade(g.id, t.id);
        if (grade === 'C') continue; // «Nothing» не интересен
        const genreLevel = state.genreLevels[g.id] ?? 0;
        const typeLevel = state.typeLevels[t.id] ?? 0;
        const cost =
          (g.costWan * 0.1 * (1 + 0.5 * genreLevel) + CONFIG.TYPE_COST_DEFAULT * (1 + 0.3 * typeLevel)) *
          consoleData.costMult *
          CONFIG.MODE.normal.cost;
        if (cost > state.money) continue; // игрок тратит всё, но не больше, чем есть
        const cand: ComboCandidate = { genreId: g.id, typeId: t.id, grade, cost };
        if (!best) best = cand;
        else {
          const br = gradeRank[best.grade as keyof typeof gradeRank] ?? 3;
          const cr = gradeRank[grade as keyof typeof gradeRank] ?? 3;
          if (cr < br || (cr === br && cand.cost < best.cost)) best = cand;
        }
      }
    }
    // fallback: дубль разрешён, если ничего не нашли
    if (!best) {
      for (const g of unlockedGenres) {
        if (avoid && g.id === avoid) continue;
        for (const t of unlockedTypes) {
          const grade = comboGrade(g.id, t.id);
          if (grade === 'C') continue;
          const cost =
            (g.costWan * 0.1 + CONFIG.TYPE_COST_DEFAULT) * consoleData.costMult * CONFIG.MODE.normal.cost;
          if (cost > state.money) continue;
          const cand: ComboCandidate = { genreId: g.id, typeId: t.id, grade, cost };
          if (!best || gradeRank[cand.grade as keyof typeof gradeRank]! < gradeRank[best.grade as keyof typeof gradeRank]!) {
            best = cand;
          }
        }
      }
    }
    return best;
  };
  if (!avoidGenreId) return search(null);
  // альтернатив у избегаемого жанра нет — жанр остаётся в игре (иначе автопилот встанет)
  return search(avoidGenreId) ?? search(null);
}

/** Комбо-кандидат для конкретной пары жанр×тип — если жанр/тип ещё открыты и влезаем в бюджет. */
function candidateFor(state: GameState, genreId: string, typeId: string): ComboCandidate | null {
  const g = GENRES.find((x) => x.id === genreId);
  const t = TYPES.find((x) => x.id === typeId);
  if (!g || !t) return null;
  const unlockedGenres = GENRES.filter((x) => {
    if (x.unlockJob && x.unlockLevel) return state.staff.some((s) => (s.careers[x.unlockJob as keyof typeof s.careers] ?? 0) >= x.unlockLevel!);
    return true;
  });
  const unlockedTypes = TYPES.filter((x) => {
    if (x.unlockJob && x.unlockLevel) {
      if (!state.staff.some((s) => (s.careers[x.unlockJob as keyof typeof s.careers] ?? 0) >= x.unlockLevel!)) return false;
    }
    if (!hasTraining(state.unlockedTrainings, x.unlockTraining)) return false;
    return true;
  });
  if (!unlockedGenres.some((x) => x.id === genreId) || !unlockedTypes.some((x) => x.id === typeId)) return null;
  const grade = comboGrade(genreId, typeId);
  if (grade === 'C') return null; // «Nothing» и как сиквел не нужен
  const cost = comboCostK(state, genreId, typeId, bestConsole(state).id, 'normal');
  if (cost > state.money) return null;
  return { genreId, typeId, grade, cost };
}

/** Сиквелы (AP-05): комбо уже блистало в Зале славы — продолжение узнаваемо и дешевле
 *  в продвижении. Возвращаем последнюю удачную игру этого жанра×типа (или null). */
export function sequelOpportunity(state: GameState): { genreId: string; typeId: string; score: number } | null {
  let best: { genreId: string; typeId: string; score: number } | null = null;
  for (const h of state.history) {
    if (h.score < CONFIG.HALL_OF_FAME) continue;
    if (!best || h.score > best.score) best = { genreId: h.genreId, typeId: h.typeId, score: h.score };
  }
  return best;
}

/** AP-04: жанр свежего фан-разгрома (последнее hate-письмо не старше HATE_MEMORY_WEEKS) —
 *  фанатам не зашла последняя игра жанра: в следующий проект его не берём, пока есть альтернатива. */
const HATE_MEMORY_WEEKS = 48;
function hatedGenre(state: GameState): string | null {
  const letter = [...state.mail].reverse().find((l) => l.sentiment === 'hate');
  if (!letter || state.week - letter.week > HATE_MEMORY_WEEKS) return null;
  const rec = [...state.history].reverse().find((h) => h.name === letter.gameName);
  if (rec) return rec.genreId;
  const gen = GENRES.find((g) => g.ru === letter.genre || g.name === letter.genre);
  return gen?.id ?? null;
}

/** Доступные консоли (по времени и с купленной лицензией), отсортированы по установленной базе. */
function availableConsoles(state: GameState): (typeof CONSOLES)[number][] {
  // PLAN-25: раньше знали только PC и Microx SX — игры для остальных купленных консолей не делались.
  // Консоль годится, если доступна по времени И лицензия куплена (consoleAvailable лицензию не смотрит).
  const avail = CONSOLES.filter((c) => consoleAvailable(state, c.id) && Boolean(state.consoles[c.id]?.licensed));
  const pc = CONSOLES.find((c) => c.id === 'pc-game')!;
  return (avail.length ? avail : [pc]).slice().sort((a, b) => b.installBase - a.installBase);
}

function bestConsole(state: GameState): (typeof CONSOLES)[number] {
  return availableConsoles(state)[0]!;
}

/**
 * PLAN-25: лучшая консоль, на которой проект ещё влезает в деньги. Без этой проверки автопилот
 * выбрал бы самую крупную консоль и на слабой студии не смог бы стартовать проект вовсе.
 */
function bestConsoleFor(
  state: GameState, genreId: string, typeId: string, mode: 'normal' | 'speed' | 'quality' | 'research' | 'budget',
): (typeof CONSOLES)[number] {
  const list = availableConsoles(state);
  return list.find((c) => comboCostK(state, genreId, typeId, c.id, mode) <= state.money) ?? list[0]!;
}

// ─── помощники для автопилота (server/autopilot.ts): стоимость комбо и готовый
// стартовый ввод проекта — без мутаций состояния ───
export function comboCostK(state: GameState, genreId: string, typeId: string, consoleId: string, mode: 'normal' | 'speed' | 'quality' | 'research' | 'budget' = 'normal'): number {
  const g = genreById(genreId);
  const t = typeById(typeId);
  const c = CONSOLES.find((x) => x.id === consoleId);
  if (!g || !t || !c) return Infinity;
  const genreLevel = state.genreLevels[genreId] ?? 0;
  const typeLevel = state.typeLevels[typeId] ?? 0;
  return (g.costWan * 0.1 * (1 + 0.5 * genreLevel) + CONFIG.TYPE_COST_DEFAULT * (1 + 0.3 * typeLevel)) * c.costMult * CONFIG.MODE[mode].cost;
}

/** Упор по умолчанию для фолбэка без LLM: доступность и полировка поровну, остаток —
 *  пакетами по 8 в свободные оси. Весь пул распределяется полностью (ось ≤ 8, как в визарде). */
function defaultDirection(state: GameState): Record<string, number> {
  const points = Math.max(0, state.directionPoints);
  const approach = Math.min(DIRECTION_AXIS_MAX, Math.ceil(points / 2));
  const direction = { approach, polish: Math.min(DIRECTION_AXIS_MAX, points - approach) };
  topUpDirection(direction, points, DIRECTION_ORDER);
  return direction;
}

/** Ввод проекта для автопилота-фолбэка: лучшая доступная комбинация + роли (как у политики). */
export function autopilotProjectInput(state: GameState): StartProjectInput | null {
  // AP-05: удачное комбо прошлого (зал славы) важнее «лучшей градации»: сиквел продаётся лучше
  const seq = sequelOpportunity(state);
  const sequel = seq ? candidateFor(state, seq.genreId, seq.typeId) : null;
  // AP-04: свежий фан-разгром — этот жанр в следующий проект не берём, если есть альтернатива
  const avoid = hatedGenre(state);
  let combo: ComboCandidate | null = sequel && sequel.genreId !== avoid ? sequel : null;
  if (!combo && avoid) combo = pickBestCombo(state, null, avoid);
  if (!combo) combo = sequel ?? pickBestCombo(state, null);
  if (!combo) return null;
  const mode = state.money > 600 ? 'quality' : 'normal';
  const consoleData = bestConsoleFor(state, combo.genreId, combo.typeId, mode);
  if (!consoleAvailable(state, consoleData.id)) return null;
  const proposalStaff = [...state.staff]
    .sort((a, b) => {
      const rot = (a.lastRole === 'proposal' ? 1 : 0) - (b.lastRole === 'proposal' ? 1 : 0);
      return rot !== 0 ? rot : b.stats.scenario - a.stats.scenario;
    })[0];
  if (!proposalStaff) return null;
  return {
    consoleId: consoleData.id,
    genreId: combo.genreId,
    typeId: combo.typeId,
    mode,
    direction: defaultDirection(state),
    proposalStaffId: proposalStaff.id,
    assignments: assignRoles(state, proposalStaff.id),
  };
}

// назначение ролей: каждый сотрудник на одной роли, по лучшему стату, с ротацией
function assignRoles(state: GameState, proposalStaffId: string): StartProjectInput['assignments'] {
  // пул свободных: выбранный на роль сотрудник выбывает из пула (одна роль на человека)
  const pool = state.staff.filter((s) => s.id !== proposalStaffId);
  const pick = (role: 'program' | 'graphics' | 'sound', statKey: 'program' | 'graphics' | 'sound'): string[] => {
    const sorted = [...pool]
      .filter((s) => s.stats[statKey] >= 10)
      .sort((a, b) => {
        const rot = (a.lastRole === role ? 1 : 0) - (b.lastRole === role ? 1 : 0);
        return rot !== 0 ? rot : b.stats[statKey] - a.stats[statKey];
      });
    const picked = sorted.slice(0, role === 'program' ? 2 : 1);
    for (const s of picked) {
      s.lastRole = role;
      pool.splice(pool.indexOf(s), 1); // и в других ролях этот сотрудник больше не участвует
    }
    return picked.map((s) => s.id);
  };
  const program = pick('program', 'program');
  const graphics = pick('graphics', 'graphics');
  const sound = pick('sound', 'sound');
  // отладка: оставшиеся с лучшим program
  const used = new Set([proposalStaffId, ...program, ...graphics, ...sound]);
  const debug = pool
    .filter((s) => !used.has(s.id))
    .sort((a, b) => b.stats.program - a.stats.program)
    .slice(0, 2)
    .map((s) => {
      s.lastRole = 'debug';
      return s.id;
    });
  return { program, graphics, sound, debug };
}

export function startNextProject(
  state: GameState,
  lastCombo: { genreId: string; typeId: string } | null,
  onStart: (combo: { genreId: string; typeId: string }) => void,
): void {
  if (state.bankrupt) return;
  const combo = pickBestCombo(state, lastCombo);
  if (!combo) return;
  const mode = state.money > 600 ? 'quality' : 'normal';
  const consoleData = bestConsoleFor(state, combo.genreId, combo.typeId, mode);
  if (!consoleAvailable(state, consoleData.id)) return;

  // сценарист: лучший scenario, с ротацией
  const proposalStaff = [...state.staff]
    .sort((a, b) => {
      const rot = (a.lastRole === 'proposal' ? 1 : 0) - (b.lastRole === 'proposal' ? 1 : 0);
      return rot !== 0 ? rot : b.stats.scenario - a.stats.scenario;
    })[0];
  if (!proposalStaff) return;
  proposalStaff.lastRole = 'proposal';

  const input: StartProjectInput = {
    consoleId: consoleData.id,
    genreId: combo.genreId,
    typeId: combo.typeId,
    mode,
    direction: defaultDirection(state), // весь бюджет в доступность + полировку → Fun + немного всего
    proposalStaffId: proposalStaff.id,
    assignments: assignRoles(state, proposalStaff.id),
  };
  const res = startProjectAction(state, input);
  if (res.ok) {
    onStart({ genreId: combo.genreId, typeId: combo.typeId });
  }
}
