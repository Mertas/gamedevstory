// PLAN-44: сюжетные линии — триггеры и резолв (движок). Контент: src/shared/storylines.ts.
// Арка «Оффер» (M1): сотрудник Lv2+ получает предложение от конкурентов; выбор в попапе;
// эпилог через epilogueAfterWeeks недель («остался» либо «ушёл» — выбирает движок по факту).
import { STORY_ARCS } from '../../shared/storylines';
import type { StatKey } from '../../shared/train';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, Staff, StoryState } from '../types';

export function storyState(state: GameState): StoryState {
  if (!state.story) state.story = { arcs: {}, flags: {} };
  return state.story;
}

const STAT_KEYS: readonly StatKey[] = ['program', 'scenario', 'graphics', 'sound'];

/** Профильный стат сотрудника (куда направить «преданность» в эпилоге). */
function bestStatKey(staff: Staff): StatKey {
  let best: StatKey = 'program';
  for (const k of STAT_KEYS) if ((staff.stats[k] ?? 0) > (staff.stats[best] ?? 0)) best = k;
  return best;
}

/** Кандидат арки «Оффер»: 2+ релиза, с 60-й недели, Lv2+, не занят контрактом. */
function offerCandidate(state: GameState): { id: string; name: string } | null {
  if (state.history.length < 2 || state.week < 60) return null;
  const busy = new Set((state.contracts ?? []).filter((c) => !c.done).flatMap((c) => c.staffIds));
  let best: { id: string; name: string } | null = null;
  let bestLv = 1; // берём только Lv2+
  for (const s of state.staff) {
    if (busy.has(s.id)) continue;
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

/** Дневной триггер: завязка и эпилог. Ставит pendingEvent (пауза), если пришло время арки. */
export function tickStory(state: GameState): void {
  if (state.pendingEvent) return;
  const st = storyState(state);
  const offer = st.arcs.offer;
  if (!offer) {
    const cand = offerCandidate(state);
    if (!cand) return;
    st.arcs.offer = { step: 1, done: false, staffId: cand.id, staffName: cand.name };
    state.pendingEvent = { type: 'story', arcId: 'offer', step: 1 };
    log(state, `💼 ${cand.name}: предложение от конкурентов — решает босс`);
    return;
  }
  if (!offer.done && offer.step === 1 && offer.waitUntil != null && state.week >= offer.waitUntil) {
    const stayed = offer.outcome === 'stay' && state.staff.some((s) => s.id === offer.staffId);
    offer.step = stayed ? 2 : 3;
    state.pendingEvent = { type: 'story', arcId: 'offer', step: offer.step };
  }
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
  if (ev.arcId === 'offer') {
    const staff = state.staff.find((s) => s.id === arcState.staffId);
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
      if (staff) {
        const k = bestStatKey(staff);
        staff.stats[k] = (staff.stats[k] ?? 0) + 5;
        if (staff.caps) staff.caps[k] = Math.max(staff.caps[k] ?? 0, staff.stats[k]);
      }
      arcState.done = true;
      log(state, `💪 ${name} закрепился в студии — команда сплотилась (+${opt.fans ?? 0} фанатов)`);
    } else if (ev.step === 3) {
      arcState.done = true;
      log(state, `✉️ Тёплое письмо от ${name} (+${opt.fans ?? 0} фанатов)`);
    }
  }
  state.pendingEvent = null;
  return { ok: true };
}
