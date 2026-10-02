// PLAN-44: сюжетные линии — триггеры и резолв (движок). Контент: src/shared/storylines.ts.
// Арки: «Оффер», «Выгорание», «Игра мечты», «Спор самолюбий», «Наставник», «Старые против
// новых» + процедурные квесты (questgen.ts, раз в год — v1.40.0). Правила: одна активная арка
// за раз; авторские — раз за партию; квесты не заканчиваются; события — в очередь pendingEvent.
import { STORY_ARCS } from '../../shared/storylines';
import type { StatKey } from '../../shared/train';
import { CONFIG } from '../config';
import { GENRES } from '../data/db';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, Staff, StoryArcState, StoryState } from '../types';
import { buildGeneratedQuest, resolveGeneratedQuest } from './questgen';

export function storyState(state: GameState): StoryState {
  if (!state.story) state.story = { arcs: {}, flags: {} };
  return state.story;
}

const STAT_KEYS: readonly StatKey[] = ['program', 'scenario', 'graphics', 'sound'];

/** Профильный стат сотрудника (куда направить «преданность»/усталость в эпилоге). */
function bestStatKey(staff: Staff): StatKey {
  let best: StatKey = 'program';
  for (const k of STAT_KEYS) if ((staff.stats[k] ?? 0) > (staff.stats[best] ?? 0)) best = k;
  return best;
}

/** Прибавка к лучшему стату (с подъёмом порога, чтобы автотренировка не срезала). */
function raiseStat(staff: Staff, delta: number): void {
  const k = bestStatKey(staff);
  staff.stats[k] = Math.max(1, (staff.stats[k] ?? 0) + delta);
  if (staff.caps) staff.caps[k] = Math.max(staff.caps[k] ?? 0, staff.stats[k]);
}

/** Сумма характеристик (сила специалиста). */
function sumStats(s: Staff): number {
  return s.stats.program + s.stats.scenario + s.stats.graphics + s.stats.sound;
}

/** Уровень сотрудника (максимум по карьерам). */
function lvOf(s: Staff): number {
  return Math.max(0, ...Object.values(s.careers ?? {}));
}

/** Свободные сотрудники (не на контракте, не «дома»), сильнейшие — первыми. */
function freeSorted(state: GameState): Staff[] {
  const busy = new Set((state.contracts ?? []).filter((c) => !c.done).flatMap((c) => c.staffIds));
  return state.staff
    .filter((s) => !busy.has(s.id) && s.homeWeeks === 0)
    .sort((a, b) => sumStats(b) - sumStats(a));
}

/** Кандидат для «личных» арок: свободен от контрактов, Lv2+, не «дома». */
function personCandidate(state: GameState): { id: string; name: string } | null {
  const busy = new Set((state.contracts ?? []).filter((c) => !c.done).flatMap((c) => c.staffIds));
  let best: { id: string; name: string } | null = null;
  let bestLv = 1; // берём только Lv2+
  for (const s of state.staff) {
    if (busy.has(s.id) || s.homeWeeks > 0) continue;
    const lv = lvOf(s);
    if (lv >= 2 && lv > bestLv) {
      best = { id: s.id, name: s.name };
      bestLv = lv;
    }
  }
  return best;
}

/** Пара «двух сильнейших» (спор самолюбий). */
function pairTop2(state: GameState): [Staff, Staff] | null {
  const free = freeSorted(state);
  if (free.length < 2) return null;
  return [free[0]!, free[1]!];
}

/** Пара «сильнейший и слабейший» (наставничество). */
function pairTopBottom(state: GameState): [Staff, Staff] | null {
  const free = freeSorted(state);
  if (free.length < 2) return null;
  const top = free[0]!;
  const bottom = free[free.length - 1]!;
  if (top.id === bottom.id) return null;
  return [top, bottom];
}

/** Пара «ветеран и молодой» — по уровню карьер (старые против новых). */
function pairByLevel(state: GameState): [Staff, Staff] | null {
  const free = freeSorted(state);
  if (free.length < 2) return null;
  const byLv = [...free].sort((a, b) => lvOf(b) - lvOf(a) || sumStats(b) - sumStats(a));
  const vet = byLv[0]!;
  const young = byLv[byLv.length - 1]!;
  if (vet.id === young.id || lvOf(vet) <= lvOf(young)) return null;
  return [vet, young];
}

function removeStaffQuiet(state: GameState, id: string): void {
  state.staff = state.staff.filter((s) => s.id !== id);
  state.hiredIds = state.hiredIds.filter((x) => x !== id);
}

/** Эпилог «Оффера»: остался — вдохновляющая развязка; ушёл — тёплое письмо. */
function epilogueOffer(state: GameState, arc: StoryArcState): void {
  const stayed = arc.outcome === 'stay' && state.staff.some((s) => s.id === arc.staffId);
  arc.step = stayed ? 2 : 3;
  state.pendingEvent = { type: 'story', arcId: 'offer', step: arc.step };
}

/** Эпилог «Игры мечты»: успели выпустить игру нужного жанра после обещания? */
function epilogueDream(state: GameState, arc: StoryArcState): void {
  if (arc.outcome === 'declined') {
    arc.step = 4; // вежливый ответ на «реализм»
  } else {
    const made = state.history.some(
      (r) => r.genreId === arc.genreId && (r.releaseWeek ?? 0) > (arc.startWeek ?? 0),
    );
    arc.step = made ? 2 : 3;
  }
  state.pendingEvent = { type: 'story', arcId: 'dream', step: arc.step };
}

/** Эпилог «Выгорания»: забота помогла; риск — 50/50 («сломался» / «вытянул»). */
function epilogueBurnout(state: GameState, arc: StoryArcState, rng: Rng): void {
  arc.step = arc.outcome === 'risk' ? (rng.chance(0.5) ? 4 : 3) : 2;
  state.pendingEvent = { type: 'story', arcId: 'burnout', step: arc.step };
}

/** Эпилог «Спора самолюбий»: дуэль — гарантия; разговор — по роллу; «пусть сами» — рулетка. */
function epilogueRivalry(state: GameState, arc: StoryArcState, rng: Rng): void {
  const good = arc.outcome === 'contest' ? true : arc.outcome === 'talk' ? arc.good === true : rng.chance(0.5);
  arc.step = good ? 2 : 3;
  state.pendingEvent = { type: 'story', arcId: 'rivalry', step: arc.step };
}

/** Эпилог «Наставника»: ветеран подтянул новичка — или новичок сам разобрался. */
function epilogueMentorship(state: GameState, arc: StoryArcState): void {
  arc.step = arc.outcome === 'mentor' ? 2 : 3;
  state.pendingEvent = { type: 'story', arcId: 'mentorship', step: arc.step };
}

/** Эпилог «Старых против новых»: чья взяла; «каждый по-своему» — рулетка (синтез/перемирие). */
function epilogueGenerations(state: GameState, arc: StoryArcState, rng: Rng): void {
  if (arc.outcome === 'veteran') arc.step = 2;
  else if (arc.outcome === 'young') arc.step = 3;
  else arc.step = rng.chance(0.5) ? 4 : 5;
  state.pendingEvent = { type: 'story', arcId: 'generations', step: arc.step };
}

/** Дневной триггер: эпилоги незакрытых арок; завязки — раз в год, потом по условиям. */
export function tickStory(state: GameState, rng: Rng): void {
  if (state.pendingEvent) return;
  const st = storyState(state);
  for (const id of Object.keys(st.arcs)) {
    const arc = st.arcs[id]!;
    if (arc.done || arc.waitUntil == null || state.week < arc.waitUntil) continue;
    if (id === 'offer') epilogueOffer(state, arc);
    else if (id === 'dream') epilogueDream(state, arc);
    else if (id === 'burnout') epilogueBurnout(state, arc, rng);
    else if (id === 'rivalry') epilogueRivalry(state, arc, rng);
    else if (id === 'mentorship') epilogueMentorship(state, arc);
    else if (id === 'generations') epilogueGenerations(state, arc, rng);
    else continue;
    return;
  }
  // Есть незакрытая арка — новую не начинаем (одна сюжетная история за раз)
  if (Object.values(st.arcs).some((a) => !a.done)) return;
  // v1.40: квесты — раз в год (слот ставит newGame/миграция; после завершения — снова +год)
  if (state.week < (st.flags.nextQuestWeek ?? 0)) return;

  // «Спор самолюбий»: 1+ релиз, с 25-й недели — взаимодействие двух сильнейших
  if (!st.arcs.rivalry && state.history.length >= 1 && state.week >= 25) {
    const pair = pairTop2(state);
    if (pair) {
      st.arcs.rivalry = {
        step: 1,
        done: false,
        staffId: pair[0].id,
        staffName: pair[0].name,
        staffId2: pair[1].id,
        staffName2: pair[1].name,
      };
      state.pendingEvent = { type: 'story', arcId: 'rivalry', step: 1 };
      log(state, `⚔️ ${pair[0].name} и ${pair[1].name}: спор о том, чей вклад важнее`);
      return;
    }
  }
  // «Наставник»: 1+ релиз, с 32-й недели — ветеран заметно сильнее новичка (разрыв 60+)
  if (!st.arcs.mentorship && state.history.length >= 1 && state.week >= 32) {
    const pair = pairTopBottom(state);
    if (pair && sumStats(pair[0]) - sumStats(pair[1]) >= 60) {
      st.arcs.mentorship = {
        step: 1,
        done: false,
        staffId: pair[0].id,
        staffName: pair[0].name,
        staffId2: pair[1].id,
        staffName2: pair[1].name,
      };
      state.pendingEvent = { type: 'story', arcId: 'mentorship', step: 1 };
      log(state, `🧑‍🏫 ${pair[0].name} и ${pair[1].name}: пора подтянуть отстающего`);
      return;
    }
  }
  // «Старые против новых»: 2+ релиза, с 42-й недели — у участников разный уровень
  if (!st.arcs.generations && state.history.length >= 2 && state.week >= 42) {
    const pair = pairByLevel(state);
    if (pair) {
      st.arcs.generations = {
        step: 1,
        done: false,
        staffId: pair[0].id,
        staffName: pair[0].name,
        staffId2: pair[1].id,
        staffName2: pair[1].name,
      };
      state.pendingEvent = { type: 'story', arcId: 'generations', step: 1 };
      log(state, `🕹️ ${pair[0].name} и ${pair[1].name}: старые методы против новых`);
      return;
    }
  }
  // «Оффер»: 2+ релиза, с 60-й недели (каждая авторская арка запускается один раз за партию)
  if (!st.arcs.offer && state.history.length >= 2 && state.week >= 60) {
    const cand = personCandidate(state);
    if (cand) {
      st.arcs.offer = { step: 1, done: false, staffId: cand.id, staffName: cand.name };
      state.pendingEvent = { type: 'story', arcId: 'offer', step: 1 };
      log(state, `💼 ${cand.name}: предложение от конкурентов — решает босс`);
      return;
    }
  }
  // «Выгорание»: 2+ релиза, с 45-й недели
  if (!st.arcs.burnout && state.history.length >= 2 && state.week >= 45) {
    const cand = personCandidate(state);
    if (cand) {
      st.arcs.burnout = { step: 1, done: false, staffId: cand.id, staffName: cand.name };
      state.pendingEvent = { type: 'story', arcId: 'burnout', step: 1 };
      log(state, `🔋 ${cand.name}: похоже на выгорание — решает босс`);
      return;
    }
  }
  // «Игра мечты»: 3+ релиза, с 70-й недели; жанр — из базовых (открыт всегда)
  if (!st.arcs.dream && state.history.length >= 3 && state.week >= 70) {
    const cand = personCandidate(state);
    if (cand) {
      const base = GENRES.filter((g) => !g.unlockJob && !g.unlockLevel);
      if (base.length > 0) {
        const genre = base[rng.int(0, base.length - 1)]!;
        st.arcs.dream = {
          step: 1,
          done: false,
          staffId: cand.id,
          staffName: cand.name,
          genreId: genre.id,
          startWeek: state.week,
        };
        state.pendingEvent = { type: 'story', arcId: 'dream', step: 1 };
        log(state, `🌠 ${cand.name} мечтает об игре в жанре «${genre.ru}»`);
        return;
      }
    }
  }
  // Все авторские арки исчерпаны/недоступны — процедурный квест (не заканчиваются)
  if (!st.arcs.quest || st.arcs.quest.done) {
    const gen = buildGeneratedQuest(state, rng);
    if (gen) {
      st.arcs.quest = { step: 1, done: false, gen };
      state.pendingEvent = { type: 'story', arcId: 'quest', step: 1 };
      log(state, `📜 ${gen.title}`);
    }
  }
}

function genreName(id?: string): string {
  return GENRES.find((g) => g.id === id)?.ru ?? '?';
}

/** Выбор игрока в сюжетном событии. */
export function resolveStory(state: GameState, optionId: string, rng: Rng): ActionResult {
  const ev = state.pendingEvent;
  if (ev?.type !== 'story') return { ok: false, error: 'Сейчас нет сюжетного события' };
  const st = storyState(state);
  const arcState = st.arcs[ev.arcId];
  if (!arcState) return { ok: false, error: 'Шаг сюжета не найден' };
  const gen = arcState.gen;
  const stepData = gen ? undefined : STORY_ARCS[ev.arcId]?.steps[ev.step - 1];
  const options = gen ? gen.options : stepData?.options;
  if (!options) return { ok: false, error: 'Шаг сюжета не найден' };
  const opt = options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: 'Нет такой опции' };
  if (opt.cost != null && state.money < opt.cost) return { ok: false, error: `Нужно ${opt.cost}K` };

  if (opt.cost != null) state.money -= opt.cost;
  if (opt.money) state.money += opt.money;
  if (opt.fans) state.fans += opt.fans;

  const name = arcState.staffName ?? 'Сотрудник';
  const name2 = arcState.staffName2 ?? 'Коллега';
  const staff = state.staff.find((s) => s.id === arcState.staffId);
  const staff2 = state.staff.find((s) => s.id === arcState.staffId2);

  if (ev.arcId === 'quest') {
    const logText = resolveGeneratedQuest(state, gen!, optionId, rng);
    if (logText == null) return { ok: false, error: 'Нет такой опции' };
    arcState.done = true;
    log(state, logText);
  } else if (ev.arcId === 'offer') {
    const arc = STORY_ARCS.offer!;
    if (ev.step === 1) {
      if (optionId === 'raise') {
        arcState.outcome = 'stay';
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        log(state, `💼 ${name}: оклад повышен — остаётся в студии (−${opt.cost}K)`);
      } else if (optionId === 'talk') {
        if (rng.chance(0.6)) {
          arcState.outcome = 'stay';
          arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
          log(state, `💬 ${name} остаётся в студии — разговор по душам помог`);
        } else {
          arcState.outcome = 'left';
          arcState.waitUntil = state.week + arc.epilogueAfterWeeks; // эпилог «письмо» тоже придёт
          if (staff) removeStaffQuiet(state, staff.id);
          log(state, `💔 ${name} уходит к конкурентам — договориться не вышло`);
        }
      } else if (optionId === 'letgo') {
        arcState.outcome = 'left';
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        if (staff) removeStaffQuiet(state, staff.id);
        log(state, `✈️ ${name} уходит к конкурентам (выкуп контракта +${opt.money ?? 0}K)`);
      }
      // шаг 1 закрыт; эпилог придёт через epilogueAfterWeeks
    } else if (ev.step === 2) {
      if (staff) raiseStat(staff, 5);
      arcState.done = true;
      log(state, `💪 ${name} закрепился в студии — команда сплотилась (+${opt.fans ?? 0} фанатов)`);
    } else if (ev.step === 3) {
      arcState.done = true;
      log(state, `✉️ Тёплое письмо от ${name} (+${opt.fans ?? 0} фанатов)`);
    }
  } else if (ev.arcId === 'burnout') {
    const arc = STORY_ARCS.burnout!;
    if (ev.step === 1) {
      if (optionId === 'rest' || optionId === 'bonus') {
        arcState.outcome = optionId;
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks; // забота — 6 недель
        log(
          state,
          optionId === 'rest'
            ? `🛌 ${name}: оплачен отпуск (−${opt.cost}K) — вернётся отдохнувшим`
            : `💸 ${name}: премия и мотивация (−${opt.cost}K)`,
        );
      } else if (optionId === 'risk') {
        arcState.outcome = 'risk';
        arcState.waitUntil = state.week + 4; // рулетка — 4 недели
        log(state, `🎲 ${name}: решили не вмешиваться — как пойдёт`);
      }
    } else if (ev.step === 2) {
      if (staff) raiseStat(staff, 4);
      arcState.done = true;
      log(state, `🔋 ${name} снова в форме — забота окупилась (+${opt.fans ?? 0} фанатов)`);
    } else if (ev.step === 3) {
      if (staff) raiseStat(staff, -3);
      arcState.done = true;
      log(state, `💔 ${name} выгорел — перегрузка взяла своё`);
    } else if (ev.step === 4) {
      if (staff) raiseStat(staff, 2);
      arcState.done = true;
      log(state, `🔋 ${name} справился сам — стал только крепче`);
    }
  } else if (ev.arcId === 'dream') {
    const arc = STORY_ARCS.dream!;
    if (ev.step === 1) {
      if (optionId === 'promise') {
        arcState.outcome = 'promise';
        arcState.startWeek = state.week;
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks; // v1.40: на мечту — полгода
        log(state, `🌠 Обещали ${name} игру в жанре «${genreName(arcState.genreId)}»`);
      } else if (optionId === 'decline') {
        arcState.outcome = 'declined';
        arcState.waitUntil = state.week; // эпилог-ответ придёт следующим днём
        log(state, `🌠 ${name}: от мечты пришлось отказаться`);
      }
    } else if (ev.step === 2) {
      if (staff) raiseStat(staff, 5);
      arcState.done = true;
      log(state, `🌠 Мечта ${name} сбылась (+${opt.fans ?? 0} фанатов)`);
    } else if (ev.step === 3 || ev.step === 4) {
      arcState.done = true;
      log(state, `🌠 Мечта ${name} пока не сбылась`);
    }
  } else if (ev.arcId === 'rivalry') {
    const arc = STORY_ARCS.rivalry!;
    if (ev.step === 1) {
      if (optionId === 'contest') {
        arcState.outcome = 'contest';
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        log(state, `⚔️ Код-дуэль: ${name} против ${name2} (−${opt.cost}K)`);
      } else if (optionId === 'talk') {
        arcState.outcome = 'talk';
        arcState.good = rng.chance(0.6);
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        log(state, `🗣️ Разговор с ${name} и ${name2} состоялся`);
      } else if (optionId === 'ignore') {
        arcState.outcome = 'ignore';
        arcState.waitUntil = state.week + 4; // рулетка — 4 недели
        log(state, `⚔️ Ссора ${name} и ${name2}: решили не вмешиваться`);
      }
    } else if (ev.step === 2) {
      if (staff) raiseStat(staff, 2);
      if (staff2) raiseStat(staff2, 2);
      arcState.done = true;
      log(state, `🤝 ${name} и ${name2} выросли из спора (+2 обоим)`);
    } else if (ev.step === 3) {
      if (staff) raiseStat(staff, -2);
      arcState.done = true;
      log(state, `😔 ${name}: осадок после ссоры (−2)`);
    }
  } else if (ev.arcId === 'mentorship') {
    const arc = STORY_ARCS.mentorship!;
    if (ev.step === 1) {
      if (optionId === 'mentor') {
        arcState.outcome = 'mentor';
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        log(state, `🧑‍🏫 ${name} взялся подтянуть ${name2}`);
      } else if (optionId === 'decline') {
        arcState.outcome = 'decline';
        arcState.waitUntil = state.week + 4;
        log(state, `🧑‍🏫 ${name2} разбирается сам`);
      }
    } else if (ev.step === 2) {
      if (staff2) raiseStat(staff2, 4);
      if (staff) raiseStat(staff, 1);
      arcState.done = true;
      log(state, `📈 ${name2}: наставничество ${name} дало +4 (ветерану +1)`);
    } else if (ev.step === 3) {
      if (staff2) raiseStat(staff2, 1);
      arcState.done = true;
      log(state, `📈 ${name2}: малый рост самостоятельностью (+1)`);
    }
  } else if (ev.arcId === 'generations') {
    const arc = STORY_ARCS.generations!;
    if (ev.step === 1) {
      if (optionId === 'veteran' || optionId === 'young' || optionId === 'both') {
        arcState.outcome = optionId;
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks;
        log(
          state,
          optionId === 'veteran'
            ? `🕹️ Поддержали ${name}`
            : optionId === 'young'
              ? `🕹️ Поддержали ${name2}`
              : '🕹️ Каждый остался при своём',
        );
      }
    } else if (ev.step === 2) {
      if (staff) raiseStat(staff, 2);
      if (staff2) raiseStat(staff2, -1);
      arcState.done = true;
      log(state, `🕹️ ${name}: опыт победил (+2; ${name2} −1)`);
    } else if (ev.step === 3) {
      if (staff2) raiseStat(staff2, 2);
      if (staff) raiseStat(staff, -1);
      arcState.done = true;
      log(state, `🕹️ ${name2}: новое победило (+2; ${name} −1)`);
    } else if (ev.step === 4) {
      if (staff) raiseStat(staff, 2);
      if (staff2) raiseStat(staff2, 2);
      arcState.done = true;
      log(state, `✨ ${name} и ${name2}: синтез подходов (+2 обоим)`);
    } else if (ev.step === 5) {
      arcState.done = true;
      log(state, `❄️ ${name} и ${name2}: холодное перемирие`);
    }
  }
  state.pendingEvent = null;
  // v1.40: завершённый квест открывает следующий слот только через год
  if (arcState.done) st.flags.nextQuestWeek = state.week + CONFIG.YEAR_LENGTH;
  return { ok: true };
}
