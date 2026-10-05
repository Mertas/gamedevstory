// PLAN-49 (Э2): сага «Синяя Комета» — движок полной линии (акты I–VI, интерлюдии, эпилоги).
// Контент: src/shared/saga-data.ts (автоген: tools/build-saga.mjs из quest-test/saga.json).
// Правила: сага стартует после первого релиза (старые сейвы подхватывают сразу); решения — только
// игрок (в автопилоте — первый доступный вариант); роли штата фиксируются при старте (замена при
// увольнении); шкалы ШУМ/СОВЕСТЬ/доверие скрыты; главы идут с паузой 180–230 дней (пейсер);
// эпилог — автоматически по флагам (правила 1–7, CONFIG.SAGA.EPILOG); хаб EP со стенда пропускается.
import { CONFIG } from '../config';
import { SAGA_NODES, SAGA_START, type SagaChoice, type SagaCond, type SagaEffect, type SagaNode } from '../../shared/saga-data';
import { SAGA_STAFF_ROLES, sagaCondOk as sagaCondOkOf, sagaResolveText } from '../../shared/saga-text';
import { log } from '../log';
import type { ActionResult, GameState, SagaState, Staff } from '../types';
import { partnerOf } from './staff';

// Роли штата и резолв текста живут в shared/saga-text (нужны и клиенту — попап главы в браузере).
export { SAGA_STAFF_ROLES };

/** Сага включена в сборке (флаг Э1–Э2, core/config.ts). */
export function sagaEnabled(): boolean {
  return CONFIG.SAGA_ENABLED !== false;
}

/** Сумма статов (сила сотрудника) — для отбора в роли. */
function sumStats(s: Staff): number {
  return s.stats.program + s.stats.scenario + s.stats.graphics + s.stats.sound;
}

/** Условие варианта/вставки — общий предикат (shared/saga-text). */
export function sagaCondOk(state: GameState, cond?: SagaCond): boolean {
  return sagaCondOkOf(state, cond);
}

/** Применить эффекты выбора/узла: флаги, артефакты, доверие, тир-деньги/фанаты, скрытые шкалы. */
export function sagaApplyEffects(state: GameState, effs?: SagaEffect[]): void {
  const s = state.saga;
  if (!s || !effs?.length) return;
  for (const e of effs) {
    if (e.k === 'when') {
      if (sagaCondOk(state, e.cond)) sagaApplyEffects(state, e.effects);
      continue;
    }
    if (e.k === 'flag') {
      if (!s.flags.includes(e.name)) s.flags.push(e.name);
      continue;
    }
    if (e.k === 'artifact') {
      if (!s.artifacts.includes(e.name)) s.artifacts.push(e.name);
      continue;
    }
    if (e.k === 'trust') {
      s.trust[e.who] = (s.trust[e.who] ?? 0) + (e.v ?? 0);
      continue;
    }
    if (e.k === 'money' || e.k === 'fans') {
      const tiers = e.k === 'money'
        ? (e.v > 0 ? CONFIG.SAGA.MONEY.plus : CONFIG.SAGA.MONEY.minus)
        : (e.v > 0 ? CONFIG.SAGA.FANS.plus : CONFIG.SAGA.FANS.minus);
      const ti = Math.max(0, Math.min(Math.abs(e.v), tiers.length) - 1);
      const val = tiers[ti] ?? 0;
      if (e.k === 'money') state.money += e.v > 0 ? val : -val;
      else state.fans += e.v > 0 ? val : -val;
      continue;
    }
    // скрытые шкалы: noise | conscience | culture | biz
    s.scales[e.k] = (s.scales[e.k] ?? 0) + (e.v ?? 0);
  }
}

/** Живой ли сотрудник, закреплённый за ролью. */
function roleAlive(state: GameState, staffId: string): boolean {
  return state.staff.some((st) => st.id === staffId);
}

/**
 * Раздать/обновить роли штата: выбывшие (увольнение, уход) — заменяются сильнейшим из не занятых
 * (ГГ не берём; партнёр, если свободен, может получить роль — в малой студии иначе некому).
 * Роли фиксируются при старте саги.
 */
export function refillSagaRoles(state: GameState, s: SagaState): void {
  // занятость считаем только по ролям штата ('Партнёр' — отдельная роль, не мешает)
  const used = new Set<string>();
  for (const role of SAGA_STAFF_ROLES) {
    const r = s.roles[role];
    if (r) used.add(r.staffId);
  }
  for (const role of SAGA_STAFF_ROLES) {
    const cur = s.roles[role];
    if (cur && roleAlive(state, cur.staffId)) continue;
    const cand = state.staff
      .filter((st) => !st.hero && !used.has(st.id))
      .sort((a, b) => sumStats(b) - sumStats(a) || (a.id < b.id ? -1 : 1))[0];
    if (!cand) continue; // людей меньше, чем ролей — добор на следующих тиках
    used.add(cand.id);
    s.roles[role] = { staffId: cand.id, name: cand.name, gender: cand.gender };
  }
}

/** Роли при старте: Партнёр — если есть (иначе флаг «без партнёра»), плюс роли штата. */
function initRoles(state: GameState, s: SagaState): void {
  const p = partnerOf(state);
  if (p) s.roles['Партнёр'] = { staffId: p.id, name: p.name, gender: p.gender };
  else if (!s.flags.includes('без партнёра')) s.flags.push('без партнёра');
  refillSagaRoles(state, s);
}

/** «Крупная» глава верхнего уровня (S2, S5…): не под-узел (S1a, S6b) и не интерлюдия. */
function topChapter(id: string): boolean {
  return /^S\d+$/.test(id);
}

/** Пауза перед главой, дней: детерминированно от id — 180..230 (CONFIG.SAGA.HOLD_*).
 *  state.week — счётчик ДНЕЙ игры (инкремент за день, `% 365`), поэтому прибавка в днях. */
function holdDays(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return CONFIG.SAGA.HOLD_MIN + (Math.abs(h) % CONFIG.SAGA.HOLD_SPAN);
}

/**
 * Эпилог по накопленному: правила 1–7 из plan/47_Сага/06_Акт_VI_НАСЛЕДИЕ.md (сверху вниз — первый
 * подошедший). Пороги секрета — CONFIG.SAGA.EPILOG (калибровка — Э3). Узел EP со стенда — хаб
 * предпросмотра: игроку не показывается, выбор эпилога делается здесь.
 */
export function sagaEpilogFor(s: SagaState): string {
  const f = new Set(s.flags);
  const sc = s.scales.conscience ?? 0;
  const tr = (who: string) => s.trust[who] ?? 0;
  const sec = CONFIG.SAGA.EPILOG.SECRET_TRUST;
  const secretOk = sc >= CONFIG.SAGA.EPILOG.SECRET_CONSCIENCE
    && f.has('кодекс полный') && f.has('титул — все')
    && Object.entries(sec).every(([who, v]) => tr(who) >= v);
  if (secretOk) return 'E6'; // 1. «Двойной финал» (секрет)
  if (f.has('копия не явна')) return 'E4'; // 1а. форс-фактор: «Тишина»
  if ((f.has('правда публична') || f.has('суд с холдингом')) && f.has('проклятие публично')) return 'E5'; // 2. «Проклятие снято»
  if (f.has('фонд')) return 'E2'; // 3. «Витрина»
  if (f.has('ремейк') || f.has('наследие в архивах R') || (sc <= 0 && f.has('издательство R'))) return 'E3'; // 4. «Кассовый»
  if (sc >= 1) return 'E1'; // 5. «Маяк горит» (выпуск при совести средней и выше)
  return 'E4'; // 6. «Тишина»
}

/** Вход в узел: эффекты onEnter (+ авто-вставки), фаза (выбор/финал). Нет узла — конец данных. */
function enterNode(state: GameState, s: SagaState, id: string): void {
  const n = SAGA_NODES[id];
  if (!n) {
    s.stage = 'end';
    s.chosen = undefined;
    s.holdUntil = undefined;
    return;
  }
  s.node = id;
  s.stage = n.final ? 'final' : 'choice';
  s.chosen = undefined;
  // пейсер: крупные главы (S2, S5…) показываются не раньше, чем через 180–230 дней
  s.holdUntil = topChapter(id) && id !== SAGA_START ? state.week + holdDays(id) : undefined;
  sagaApplyEffects(state, n.onEnter);
  for (const ins of n.inserts ?? []) {
    if (ins.mode === 'auto' && ins.effects && sagaCondOk(state, ins.when)) sagaApplyEffects(state, ins.effects);
  }
  log(state, `📼 Синяя Комета: «${n.title}»`);
}

/** Синхронизировать попап-событие с фазой главы: evKey у UI должен меняться на каждом шаге
 *  (иначе локальное «клик уже сделан» не отличит новый попап от старого). */
function syncSagaPopup(state: GameState, s: SagaState): void {
  if (s.stage === 'done') return; // завершённая сага попапов не показывает
  state.pendingEvent = {
    type: 'saga',
    node: s.node,
    stage: s.stage,
    ...(s.chosen != null ? { chosen: s.chosen } : {}),
  };
}

/** Старт саги: состояние, роли, первый узел, попап. */
export function sagaStart(state: GameState): void {
  const s: SagaState = {
    node: SAGA_START,
    stage: 'choice',
    flags: [],
    artifacts: [],
    trust: {},
    scales: {},
    roles: {},
  };
  state.saga = s;
  initRoles(state, s);
  enterNode(state, s, SAGA_START);
  syncSagaPopup(state, s);
}

/** Тик: старт при ≥1 релизе; восстановление попапа; замена выбывших ролей. */
export function tickSaga(state: GameState): void {
  if (!sagaEnabled()) return;
  const s = state.saga;
  if (!s) {
    // Старт после первого релиза (старые сейвы подхватывают сразу — решение PLAN-49).
    // Ждём тишины: одно событие за раз (арки/квесты/прочее в приоритете).
    if (state.history.length >= 1 && !state.pendingEvent) sagaStart(state);
    return;
  }
  if (s.stage === 'end' || s.stage === 'done') return; // линия завершена
  refillSagaRoles(state, s);
  if (s.holdUntil != null) {
    // пейсер: глава «спит» до недели показа — появится сама, когда время придёт
    if (state.week < s.holdUntil) return;
    s.holdUntil = undefined;
  }
  if (!state.pendingEvent) syncSagaPopup(state, s); // попап потерялся (загрузка сейва)
}

/** Индекс варианта: число из сети; пустая строка — первый доступный (автопилот). */
function resolveChoiceIndex(state: GameState, node: SagaNode, option: string): number {
  const raw = String(option ?? '').trim();
  if (raw === '') return node.choices.findIndex((c) => sagaCondOk(state, c.cond));
  const i = Number(raw);
  if (!Number.isInteger(i) || i < 0 || i >= node.choices.length) return -1;
  return i;
}

/** Переход после выбора: эффекты + следующий узел. EP со стенда — авто-эпилог по флагам. */
function advance(state: GameState, s: SagaState, ch: SagaChoice): void {
  sagaApplyEffects(state, ch.effects);
  const to = ch.to === 'EP' ? sagaEpilogFor(s) : ch.to;
  if (!SAGA_NODES[to]) {
    s.stage = 'end';
    s.chosen = undefined;
    s.holdUntil = undefined;
    log(state, '📼 Синяя Комета: продолжение следует');
  } else {
    enterNode(state, s, to);
  }
  if (s.holdUntil != null) state.pendingEvent = null; // глава «спит»: попап покажем в свой день
  else syncSagaPopup(state, s);
}

/** Выбор игрока в главе саги. option — индекс варианта; '' — авто (первый доступный). */
export function resolveSaga(state: GameState, option: string): ActionResult {
  if (!sagaEnabled()) return { ok: false, error: 'Сага выключена' };
  const s = state.saga;
  if (!s) return { ok: false, error: 'Сага ещё не начиналась' };
  if (state.pendingEvent?.type !== 'saga') return { ok: false, error: 'Сейчас нет главы саги' };
  const node = SAGA_NODES[s.node];
  if (!node) return { ok: false, error: 'Глава не найдена' };
  if (s.stage === 'end') {
    state.pendingEvent = null; // прощальная заметка — закрыли
    return { ok: true };
  }
  if (s.stage === 'final') {
    // эпилог прочитан — сага завершена
    state.pendingEvent = null;
    s.stage = 'done';
    log(state, '📼 Синяя Комета: сага завершена');
    return { ok: true };
  }
  if (s.stage === 'result') {
    const ch = node.choices[s.chosen ?? -1];
    if (!ch) return { ok: false, error: 'Вариант не найден' };
    advance(state, s, ch);
    return { ok: true };
  }
  const idx = resolveChoiceIndex(state, node, option);
  if (idx < 0) return { ok: false, error: 'Нет такого варианта' };
  const ch = node.choices[idx];
  if (!ch) return { ok: false, error: 'Нет такого варианта' };
  if (!sagaCondOk(state, ch.cond)) return { ok: false, error: 'Условие не выполнено' };
  if (ch.result) {
    s.stage = 'result';
    s.chosen = idx;
    syncSagaPopup(state, s); // evKey: фаза сменилась — попап «Дальше» должен показаться
    return { ok: true };
  }
  advance(state, s, ch);
  return { ok: true };
}

/** Резолв абзаца саги — общий (shared/saga-text): слоты, родовые пары, {Роль} → имя. */
export function sagaResolveParagraph(state: GameState, text: string, node?: SagaNode): string {
  return sagaResolveText(text, node, state);
}

/** Узел текущей главы (для UI). */
export function sagaCurrentNode(state: GameState): SagaNode | undefined {
  const s = state.saga;
  return s ? SAGA_NODES[s.node] : undefined;
}
