// PLAN-44: сюжетные линии — триггеры и резолв (движок). Контент: src/shared/storylines.ts.
// Арки: «Оффер» (M1), «Выгорание» и «Игра мечты» (M2). Правила: одна активная арка за раз;
// события встают в общую очередь pendingEvent (пауза); эффекты — деньги/фанаты/статы, умеренные.
import { STORY_ARCS } from '../../shared/storylines';
import type { StatKey } from '../../shared/train';
import { GENRES } from '../data/db';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, Staff, StoryArcState, StoryState } from '../types';

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

/** Кандидат для «личных» арок: свободен от контрактов, Lv2+, не «дома». */
function personCandidate(state: GameState): { id: string; name: string } | null {
  const busy = new Set((state.contracts ?? []).filter((c) => !c.done).flatMap((c) => c.staffIds));
  let best: { id: string; name: string } | null = null;
  let bestLv = 1; // берём только Lv2+
  for (const s of state.staff) {
    if (busy.has(s.id) || s.homeWeeks > 0) continue;
    const lv = Math.max(0, ...Object.values(s.careers ?? {}));
    if (lv >= 2 && lv > bestLv) {
      best = { id: s.id, name: s.name };
      bestLv = lv;
    }
  }
  return best;
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

/** Дневной триггер: сначала эпилоги незакрытых арок, потом завязки (одна арка за раз). */
export function tickStory(state: GameState, rng: Rng): void {
  if (state.pendingEvent) return;
  const st = storyState(state);
  for (const id of Object.keys(st.arcs)) {
    const arc = st.arcs[id]!;
    if (arc.done || arc.waitUntil == null || state.week < arc.waitUntil) continue;
    if (id === 'offer') epilogueOffer(state, arc);
    else if (id === 'dream') epilogueDream(state, arc);
    else if (id === 'burnout') epilogueBurnout(state, arc, rng);
    else continue;
    return;
  }
  // Есть незакрытая арка — новую не начинаем (одна сюжетная история за раз)
  if (Object.values(st.arcs).some((a) => !a.done)) return;

  // «Оффер»: 2+ релиза, с 60-й недели (каждая арка запускается один раз за партию)
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
}

function genreName(id?: string): string {
  return GENRES.find((g) => g.id === id)?.ru ?? '?';
}

/** Выбор игрока в сюжетном событии. */
export function resolveStory(state: GameState, optionId: string, rng: Rng): ActionResult {
  const ev = state.pendingEvent;
  if (ev?.type !== 'story') return { ok: false, error: 'Сейчас нет сюжетного события' };
  const arcState = storyState(state).arcs[ev.arcId];
  const stepData = STORY_ARCS[ev.arcId]?.steps[ev.step - 1];
  if (!arcState || !stepData) return { ok: false, error: 'Шаг сюжета не найден' };
  const opt = stepData.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: 'Нет такой опции' };
  if (opt.cost != null && state.money < opt.cost) return { ok: false, error: `Нужно ${opt.cost}K` };

  if (opt.cost != null) state.money -= opt.cost;
  if (opt.money) state.money += opt.money;
  if (opt.fans) state.fans += opt.fans;

  const name = arcState.staffName ?? 'Сотрудник';
  const staff = state.staff.find((s) => s.id === arcState.staffId);

  if (ev.arcId === 'offer') {
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
        arcState.waitUntil = state.week + arc.epilogueAfterWeeks; // мечте — 40 недель
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
  }
  state.pendingEvent = null;
  return { ok: true };
}
