// Скриптованный игрок («разумная» политика) — для баланс-тестов и CLI-прогона.
// Стратегия: дешёвые S-комбо, ротация ролей, найм при деньгах, отладка до ≤5 багов.
import { CONFIG } from '../config';
import { ADS, TRAININGS } from '../data/db';
import { CONSOLES, GENRES, TYPES } from '../data/db';
import type { GameState, StartProjectInput } from '../types';
import { comboGrade, consoleAvailable } from '../systems/dev';
import {
  buyAdAction, dismissSalesmanAction, hireAction, levelUpAction, releaseAction, resolveBoostAction,
  resolveEventAction, resolveGamedexAction, startProjectAction, trainAction,
} from '../engine';

export interface PolicyStats {
  hires: number;
  releases: number;
  boostAccepts: number;
  licenses: number;
}

// Скриптованный игрок: контекст на запуск (lastCombo — без глобального состояния,
// иначе прогоны не детерминированы)
export interface ScriptedPlayer {
  turn(state: GameState, stats: PolicyStats): void;
}

export function createPlayer(): ScriptedPlayer {
  let lastCombo: { genreId: string; typeId: string } | null = null;

  return {
    turn(state: GameState, stats: PolicyStats): void {
      // буст — принимаем с разумной ставкой (до 30 PR), продавца — прогоняем
      if (state.pendingEvent?.type === 'boost') {
        // аудит 05.09: ставка должна быть ≤ research И ≥ 1, иначе resolveBoost
        // оставляет событие висеть (валидация до мутаций) и политика зацикливается
        const amount = Math.min(Math.floor(state.research), 30);
        const accept = amount >= 1;
        resolveBoostAction(state, accept, amount);
        if (accept) stats.boostAccepts++;
      }
      if (state.pendingEvent?.type === 'salesman') dismissSalesmanAction(state);
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

      // M3: прокачка — левел-ап, если PR хватает (приоритет активной профессии)
      if (state.research >= 40) {
        for (const s of [...state.staff].sort((a, b) => b.stats.scenario + b.stats.program - (a.stats.scenario + a.stats.program))) {
          const lv = s.careers[s.activeCareer] ?? 0;
          if (lv >= 5) continue;
          const price = CONFIG.LEVEL_PR[s.activeCareer]?.[lv - 1];
          if (price && state.research >= price && price <= 55) {
            levelUpAction(state, s.id);
            break;
          }
        }
      }

      // M3: обучение — дешёвые тренинги при деньгах и POWER
      if (state.money > 200 && state.week % 28 === 0) { // раз в 4 недели
        const s = [...state.staff].sort((a, b) => b.power - a.power)[0];
        if (s && s.power >= 2 && state.money > 100) {
          // pinball (анлок Mahjong) раз в 12 недель, иначе anime
          const wantPinball = !state.unlockedTrainings.some((x) => x.includes('pachinko')) && state.week % 84 === 0;
          const t = TRAININGS.find((x) => x.id === (wantPinball ? 7 : 4));
          if (t) trainAction(state, s.id, t.id);
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
        if (ad) buyAdAction(state, ad.id);
      }

      // найм: есть место и деньги; в бедности — только дешёвые кандидаты
      const capacity = CONFIG.OFFICE_CAPACITY[state.officeLevel];
      if (state.staff.length < capacity && state.money > 400 && state.week < 90) {
        const res = hireAction(state, 'word-of-mouth', { maxFee: state.money < 1000 ? 150 : undefined });
        if (res.ok) stats.hires++;
      }

      // лицензия на Microx SX при достатке
      if (state.money > 1500 && !state.consoles['microx-sx']?.licensed) {
        if (buyLicenseSafe(state, 'microx-sx')) stats.licenses++;
      }

      // проект
      if (!state.activeGame) {
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

function buyLicenseSafe(state: GameState, consoleId: string): boolean {
  const c = CONSOLES.find((x) => x.id === consoleId);
  const cs = state.consoles[consoleId];
  if (!c || !cs || cs.licensed || state.money < c.licenseCost) return false;
  state.money -= c.licenseCost;
  cs.licensed = true;
  return true;
}

interface ComboCandidate {
  genreId: string;
  typeId: string;
  grade: string;
  cost: number;
}

// лучшая доступная комбинация: максимум градации (S>A>B), минимум стоимости
export function pickBestCombo(state: GameState, last: { genreId: string; typeId: string } | null): ComboCandidate | null {
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
    if (t.unlockTraining && !state.unlockedTrainings.some((x) => x.toLowerCase().includes(t.unlockTraining!.toLowerCase()))) {
      return false;
    }
    return true;
  });

  const consoleData = bestConsole(state);
  const gradeRank = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };
  let best: ComboCandidate | null = null;
  for (const g of unlockedGenres) {
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
}

function bestConsole(state: GameState) {
  // PC всегда; Microx SX — если лицензия куплена
  if (state.consoles['microx-sx']?.licensed) {
    return CONSOLES.find((c) => c.id === 'microx-sx')!;
  }
  return CONSOLES.find((c) => c.id === 'pc-game')!;
}

// назначение ролей: каждый сотрудник на одной роли, по лучшему стату, с ротацией
function assignRoles(state: GameState, proposalStaffId: string): StartProjectInput['assignments'] {
  const free = state.staff.filter((s) => s.id !== proposalStaffId);
  const pick = (role: 'program' | 'graphics' | 'sound', statKey: 'program' | 'graphics' | 'sound'): string[] => {
    const sorted = [...free]
      .filter((s) => s.stats[statKey] >= 10)
      .sort((a, b) => {
        const rot = (a.lastRole === role ? 1 : 0) - (b.lastRole === role ? 1 : 0);
        return rot !== 0 ? rot : b.stats[statKey] - a.stats[statKey];
      });
    const picked = sorted.slice(0, role === 'program' ? 2 : 1);
    for (const s of picked) s.lastRole = role;
    return picked.map((s) => s.id);
  };
  const program = pick('program', 'program');
  const graphics = pick('graphics', 'graphics');
  const sound = pick('sound', 'sound');
  // отладка: оставшиеся с лучшим program
  const used = new Set([proposalStaffId, ...program, ...graphics, ...sound]);
  const debug = free
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
  const consoleData = bestConsole(state);
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
    mode: state.money > 600 ? 'quality' : 'normal',
    direction: { approach: 5, polish: 5 }, // доступность + полировка → Fun + немного всего
    proposalStaffId: proposalStaff.id,
    assignments: assignRoles(state, proposalStaff.id),
  };
  const res = startProjectAction(state, input);
  if (res.ok) {
    onStart({ genreId: combo.genreId, typeId: combo.typeId });
  }
}
