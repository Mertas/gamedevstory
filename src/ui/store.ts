// Игровой стор: WebSocket-клиент. Вся игра — на сервере; здесь только снапшоты и отправка действий.
import { useRef, useSyncExternalStore } from 'react';
import type { QuestArt } from './questArt';
import type * as React from 'react';
import type { HireMethodId } from '../core/config';
import type { GameState, StartProjectInput, UiWindow } from '../core/types';
import type { ChatState } from '../shared/chat';
import { genreById, typeById, type MetaData } from '../shared/meta';
import { levelUpNotice, type LevelNotice } from '../shared/rank';
import type { AutopilotStep } from '../shared/autopilot';
import { Outbox } from './outbox';
import { applyOps, type SyncOp } from '../shared/sync'; // PLAN-45: кадры-диффы

import { APP_VERSION, BUILD_DATE } from '../shared/version';
export interface Snapshot {
  game: GameState | null;
  chat: ChatState;
  speed: number;
  connected: boolean;
  meta: MetaData | null;
  autopilot: boolean;
  /** PLAN-40: победа аккаунта (100/100) — открыт авторежим */
  victory: boolean;
  /** PLAN-40: релизов за всю историю аккаунта — пороги скоростей */
  accountReleases: number;
  /** PLAN-18: сервер отказал в партии (нужен вход / сохранение не загружено) — вернуться в меню */
  sessionLost: boolean;
}

let snap: Snapshot = {
  game: null, chat: { msgs: [], queue: [], phases: {} }, speed: 1, connected: false, meta: null, autopilot: false,
  victory: false, accountReleases: 0,
  sessionLost: false,
};
let actionError: string | null = null;
let actionErrorVer = 0; // SRV-17: версия показа — повторный тот же текст тоже поднимает тост
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/**
 * UI-01: дешёвая подпись чата (длины + фазы + хеш текстов). По ней решаем, менять ли
 * ссылку на чат в снапшоте: неизменный чат не должен ререндерить окно каждый тик.
 */
function chatSig(c: ChatState): string {
  let h = 0;
  for (const m of c.msgs) {
    const t = m.text;
    h = (h * 31 + t.length + (t.charCodeAt(0) || 0) * 7 + (t.charCodeAt(t.length - 1) || 0) * 13) | 0;
  }
  for (const m of c.queue) h = (h * 31 + m.text.length) | 0;
  return `${c.msgs.length}|${c.queue.length}|${JSON.stringify(c.phases)}|${h}`;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ─── PLAN-22: уровень игрока (число открытых комбо) ───

let levelSeen: number | null = null;
const combosSeen = new Set<string>();

/** Сравнить набор комбо со снапшотом: новый уровень → тост, переход через порог → звание. */
function trackLevel(g: GameState | null): void {
  if (!g) return;
  const combos = g.openedCombos ?? [];
  const fresh = combos.filter((c) => !combosSeen.has(c));
  for (const c of combos) combosSeen.add(c);
  const prev = levelSeen;
  levelSeen = combos.length;
  if (prev === null || combos.length <= prev || !fresh.length) return; // первый снапшот — без тоста
  const [gid, tid] = (fresh[fresh.length - 1] ?? '').split('|');
  const meta = snap.meta;
  const gg = meta && gid ? genreById(meta, gid) : null;
  const tt = meta && tid ? typeById(meta, tid) : null;
  const combo = `${gg?.ru ?? gid ?? '?'} × ${tt?.nameRu ?? tt?.name ?? tid ?? '?'}`;
  showLevelNotice(levelUpNotice(prev, combos.length, combo));
}

/**
 * v1.43: продавец пришёл в офис (весь май) — заметка-тост вместо блокирующего попапа.
 * Один раз: переход «нет → здесь» либо вход в партию, где продавец уже в городе.
 */
let salesmanSeen: boolean | null = null;
function trackSalesman(g: GameState | null): void {
  if (!g) return;
  const here = Boolean(g.salesmanHere);
  const prev = salesmanSeen;
  salesmanSeen = here;
  if (!here || prev === true) return;
  showSysNotice({
    title: 'Продавец Тыквенных Продуктов',
    icon: '🛒',
    head: 'Продавец в офисе — весь май!',
    text: 'Бустеры, Dead Bull и Руководство по смене профессии — во вкладке «Продавец» окна «Найм».',
  });
}

let levelNotice: LevelNotice | null = null;
let levelNoticeVer = 0;

/** Показать тост уровня (и звание, если порог перейдён). */
export function showLevelNotice(n: LevelNotice): void {
  levelNotice = n;
  levelNoticeVer++;
  emit();
}

export function useLevelNotice(): LevelNotice | null {
  useSyncExternalStore(subscribe, () => levelNoticeVer);
  return levelNotice;
}

// v1.43: системные заметки-тосты (приход продавца и т.п.) — тот же win95-тост, что у уровня
export interface SysNotice { title: string; icon: string; head?: string; text: string }

let sysNotice: SysNotice | null = null;
let sysNoticeVer = 0;

export function showSysNotice(n: SysNotice): void {
  sysNotice = n;
  sysNoticeVer++;
  emit();
}

export function useSysNotice(): SysNotice | null {
  useSyncExternalStore(subscribe, () => sysNoticeVer);
  return sysNotice;
}

// ─── WebSocket ───

// SRV-06: sid — сессия страницы (новый при перезагрузке), seq — сквозной номер исходящего.
// Сервер подтверждает каждое действие (action_result{seq}), повтор при переподключении
// отсекается по sid+seq — клик из окна обрыва не теряется и не выполняется дважды.
const SID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const outbox = new Outbox();
let seqN = 0;
/** PLAN-45: версия состояния (кадры-диффы накладываются строго на неё). */
let syncVer = -1;

/** «1 действие», «2 действия», «5 действий» */
function actionsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'действие';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'действия';
  return 'действий';
}

/** SRV-17: общий канал ошибок (ошибки действий от сервера + сетевые сбои) — его показывает тост */
function raiseError(text: string): void {
  actionError = text;
  actionErrorVer++;
  emit();
}

/** PLAN-18: сокет открываем только внутри партии — в начальном меню соединение не нужно. */
let socketWanted = false;

/** PLAN-18: войти в партию (после входа/загрузки сохранения). */
export function startSession(): void {
  socketWanted = true;
  const ws = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  // уже подключены/подключаемся — второй сокет не нужен (StrictMode монтирует эффекты дважды)
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
  connect();
}

/** PLAN-18: выйти в начальное меню — соединение закрываем (партия на сервере остаётся жить). */
export function stopSession(): void {
  socketWanted = false;
  const ws = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  try { ws?.close(); } catch { /* noop */ }
  snap = { ...snap, connected: false, game: null, sessionLost: false };
  emit();
}

// PLAN-45: вкладка в фоне — состояние не шлём (сервер копит кадры), при возврате — догон.
// Сообщение идёт мимо outbox/seq: доставка не критична, потеря лечится следующим событием.
function sendVis(): void {
  const wss = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  if (wss?.readyState === WebSocket.OPEN) {
    wss.send(JSON.stringify({ type: 'visibility', visible: !document.hidden }));
  }
}
if (!(globalThis as { __gdsVisHook?: boolean }).__gdsVisHook) {
  (globalThis as { __gdsVisHook?: boolean }).__gdsVisHook = true;
  document.addEventListener('visibilitychange', sendVis);
}

function connect(): void {
  if (!socketWanted) return;
  // SRV-19: адрес от самой страницы (а не хардкод :3001) — в dev-режиме vite проксирует /ws
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  (globalThis as { __gdsWs?: WebSocket }).__gdsWs = ws;
  // PLAN-45: при (пере)подключении сервер сам шлёт meta + полный снапшот (в т.ч. на паузе —
  // событие висит, тикер молчит) — отдельный get_state больше не нужен; после открытия
  // сообщаем видимость вкладки (могла открыться в фоне).
  ws.onopen = () => {
    autopilotQueue.length = 0; // SRV-16: после реконнекта старые шаги мыши не доигрываем
    // SRV-06: повторяем недоставленные действия (не старше TTL) — клик не пропадает молча
    const { ready, dropped } = outbox.drain();
    if (dropped > 0) raiseError(`Связь пропала: ${dropped} ${actionsWord(dropped)} не доставлено`);
    for (const it of ready) ws.send(it.data);
    sendVis();
    void checkBuild(); // PLAN-25: сервер мог перезапуститься с новой сборкой — старый бандл надо обновить
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(String(e.data)) as {
        type: string; game?: GameState; chat?: ChatState; speed?: number; data?: MetaData; error?: string;
        ok?: boolean; title?: string; plot?: string; autopilot?: boolean; step?: unknown; seq?: number; reqId?: number;
        victory?: boolean; accountReleases?: number;
        ver?: number; base?: number; ops?: unknown[]; // PLAN-45: кадр-дифф {state2}
      };
      if (d.type === 'meta' && d.data) {
        snap = { ...snap, meta: d.data };
        emit();
      }
      if (d.type === 'state' && d.game) {
        syncVer = typeof d.ver === 'number' ? d.ver : -1; // PLAN-45: база для кадров-диффов
        // UI-01: чат меняется редко (только новые сообщения) — сохраняем прежнюю ссылку,
        // иначе окно чата ререндерилось бы каждый игровой тик
        const nextChat = d.chat ?? snap.chat;
        snap = {
          game: d.game, chat: chatSig(nextChat) === chatSig(snap.chat) ? snap.chat : nextChat,
          speed: d.speed ?? snap.speed,
          connected: true, meta: snap.meta, autopilot: Boolean(d.autopilot), sessionLost: false,
          victory: Boolean(d.victory), accountReleases: Math.max(0, Math.floor(Number(d.accountReleases) || 0)),
        };
        // SRV-16: автопилот выключен — очередь шагов не доигрываем (мышь не жмёт за игрока)
        if (!snap.autopilot) autopilotQueue.length = 0;
        trackLevel(snap.game); // PLAN-22: новый уровень → тост
        trackSalesman(snap.game); // v1.43: приход продавца (май) → тост-заметка
        emit();
      }
      if (d.type === 'state2' && Array.isArray(d.ops)) {
        // PLAN-45: кадр-дифф. base — версия, на которую накладывается; не совпал (пропуск
        // кадра/перезапуск сервера) — просим полный снапшот и живём дальше
        if (typeof d.base !== 'number' || d.base !== syncVer || !snap.game) {
          send({ type: 'get_state' });
          return;
        }
        let next: Snapshot;
        try {
          next = applyOps(snap, d.ops as SyncOp[]);
        } catch {
          send({ type: 'get_state' }); // битый кадр — полная синхронизация
          return;
        }
        syncVer = typeof d.ver === 'number' ? d.ver : syncVer + 1;
        const nextChat = next.chat ?? snap.chat;
        snap = {
          ...next,
          // UI-01: неизменный чат сохраняет ссылку — окно чата не ререндерится каждый тик
          chat: chatSig(nextChat) === chatSig(snap.chat) ? snap.chat : nextChat,
          connected: true, sessionLost: false,
        };
        if (!snap.autopilot) autopilotQueue.length = 0; // SRV-16: как в полном снапшоте
        trackLevel(snap.game); // PLAN-22: новый уровень → тост
        trackSalesman(snap.game); // v1.43: приход продавца (май) → тост-заметка
        emit();
        return;
      }
      if (d.type === 'autopilot_step' && d.step) {
        const st = d.step as AutopilotStep;
        // PLAN-26b: попап на экране один — прежние шаги по нему заведомо устарели
        if (st.kind === 'click' && st.target.startsWith('mb-')) {
          for (let i = autopilotQueue.length - 1; i >= 0; i--) {
            const q = autopilotQueue[i]!;
            if (q.kind === 'click' && q.target.startsWith('mb-')) autopilotQueue.splice(i, 1);
          }
        }
        autopilotQueue.push(st);
        emit();
      }
      if (d.type === 'action_result') {
        if (typeof d.seq === 'number') outbox.ack(d.seq); // SRV-06: действие доставлено
        if (d.error) raiseError(d.error);
      }
      if (d.type === 'story_result') {
        // SRV-05: чужой/устаревший ответ (другая вкладка) не трогает наш черновик
        if (d.reqId !== undefined && d.reqId !== pendingStoryReq) return;
        pendingStoryReq = null;
        storyResult = {
          ok: Boolean(d.ok), title: d.title, plot: d.plot, error: d.error,
        } as { ok: boolean; title?: string; plot?: string; error?: string };
        emit();
      }
    } catch { /* игнор */ }
  };
  ws.onclose = (ev) => {
    const refused = ev?.code === 1008; // PLAN-18: сервер закрыл по политике (нужен вход / нет партии)
    snap = { ...snap, connected: false, sessionLost: refused };
    emit();
    // игрок вышел в начальное меню или сервер отказал — переподключаться не нужно
    if (!socketWanted || refused) return;
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

// PLAN-18: соединение открывает App (startSession) — до входа в партию сокет не нужен.

// SRV-06: подчистка очереди, если ack не пришёл при живой связи (старый сервер/потеря) —
// offline-очередь не трогаем: её судьбу решает drain() при переподключении (с отчётом о потерях)
window.setInterval(() => {
  const wss = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  if (wss?.readyState === WebSocket.OPEN) outbox.prune();
}, 5000);

function send(msg: unknown, forceAuto = false): void {
  // SRV-06: исходящее нумеруется (seq) и ждёт в очереди до ack сервера — закрытый сокет
  // больше не означает потерю клика: при переподключении недоставленное уйдёт повторно
  const seq = ++seqN;
  // действия виртуальной мыши автопилота помечаются autopilot:true (не выключают автопилот);
  // forceAuto — для серверных авто-действий самого UI (например автозакрытие окна прессы, SER-23)
  const auto = forceAuto || (globalThis as { __gdsAutopilot?: boolean }).__gdsAutopilot === true;
  const data = JSON.stringify({
    ...(msg as Record<string, unknown>), sid: SID, seq, ...(auto ? { autopilot: true } : {}),
  });
  outbox.push(seq, data);
  const wss = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  if (wss?.readyState === WebSocket.OPEN) wss.send(data);
}

// ─── хуки ───
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, () => snap).game as GameState;
}

/**
 * UI-01: подписка на производное значение игры. Селектор должен возвращать примитив
 * (или стабильную ссылку) — компонент ререндерится только при изменении значения.
 */
export function useGameSelector<T>(sel: (g: GameState) => T): T {
  const ref = useRef(sel);
  ref.current = sel;
  return useSyncExternalStore(subscribe, () => ref.current(snap.game as GameState));
}

export function useActionError(): string | null {
  useSyncExternalStore(subscribe, () => actionError);
  return actionError;
}

/** SRV-17: версия ошибки — тост перезапускается, даже если текст не изменился */
export function useActionErrorVer(): number {
  useSyncExternalStore(subscribe, () => actionErrorVer);
  return actionErrorVer;
}

/** показать ошибку клиента в общем канале (тост): сетевые сбои, потерянные действия */
export function showClientError(text: string): void {
  raiseError(text);
}

export function clearActionError(): void {
  actionError = null;
  emit();
}

export function useMeta(): MetaData {
  return useSyncExternalStore(subscribe, () => snap).meta as MetaData;
}

export function useChat(): ChatState {
  return useSyncExternalStore(subscribe, () => snap).chat;
}

export function useSpeed(): number {
  return useSyncExternalStore(subscribe, () => snap).speed;
}

// ─── автопилот (plan/14): флаг, очередь шагов хореографии, план для визарда ───
export function useAutopilot(): boolean {
  return useSyncExternalStore(subscribe, () => snap).autopilot;
}

/** PLAN-40: победа аккаунта (100/100) — кнопка авторежима появляется только после неё */
export function useVictory(): boolean {
  return useSyncExternalStore(subscribe, () => snap).victory;
}

/** PLAN-40: релизов за всю историю аккаунта — пороги скоростей таскбара */
export function useAccountReleases(): number {
  return useSyncExternalStore(subscribe, () => snap).accountReleases;
}

const autopilotQueue: AutopilotStep[] = [];

/** длина очереди шагов (реактивный сигнал для курсора) */
export function useAutopilotQueueLen(): number {
  return useSyncExternalStore(subscribe, () => autopilotQueue.length);
}

/** взять первый шаг из очереди (null — пусто).
 *  Кнопки попапов (mb-*) — срочные: прыгают вперёд «витринных» шагов, иначе серверный
 *  таймаут 2.6с закроет попап раньше, чем мышка до него доедет. */
export function takeAutopilotStep(): AutopilotStep | null {
  let idx = autopilotQueue.findIndex((s) => s.kind === 'click' && s.target.startsWith('mb-'));
  if (idx < 0 && autopilotQueue.length > 0) idx = 0;
  const s = idx >= 0 ? autopilotQueue.splice(idx, 1)[0]! : null;
  emit();
  return s;
}

export function actionTakeControl() {
  send({ type: 'take_control' });
}

/** «Отдать управление»: включить автопилот кнопкой (сам он больше не включается). */
export function actionSetAutopilot(on: boolean) {
  send({ type: 'set_autopilot', on });
}

// ─── действия (отправка на сервер) ───
export function actionStartProject(input: StartProjectInput) {
  send({ type: 'start_project', input });
  return { ok: true };
}

export function actionRelease() {
  send({ type: 'release' });
  return { ok: true };
}

export function actionSearch(method: HireMethodId) {
  send({ type: 'search', method });
}

export function actionHire(staffId: string) {
  send({ type: 'hire', staffId });
}

export function actionFire(staffId: string) {
  send({ type: 'fire', staffId });
}

/** PLAN-48: расставание с партнёром — вариант 1: выкуп доли (D% кассы разом). */
export function actionPartnerBuyout() {
  send({ type: 'partner_buyout' });
}

/** PLAN-48: расставание с партнёром — вариант 2: рента (D/4 % продаж игр навсегда). */
export function actionPartnerRent() {
  send({ type: 'partner_rent' });
}

export function actionBuyLicense(consoleId: string) {
  send({ type: 'buy_license', consoleId });
}

export function actionResolveBoost(accept: boolean, amount?: number) {
  send({ type: 'resolve_boost', accept, ...(amount !== undefined ? { amount } : {}) });
}

/** PLAN-39: результат мини-игры из врезки (0–100 %) → серверу */
export function actionResolveMinigame(pct: number) {
  send({ type: 'resolve_minigame', pct });
}

/** PLAN-39: партию закрыли досрочно — сервер применит максимальный штраф. */
export function actionCloseMinigame() {
  send({ type: 'resolve_minigame', closed: true });
}
export function actionDismissSalesman() {
  send({ type: 'resolve_salesman' });
}
export function actionResolveGamedex(option: string) {
  send({ type: 'resolve_gamedex', option });
}
export function actionResolveStory(option: string) {
  send({ type: 'resolve_story', option });
}

/** PLAN-49: глава саги — выбор варианта или «Дальше» после итога. */
export function actionResolveSaga(option: string) {
  send({ type: 'resolve_saga', option });
}
export function actionTyping() {
  // SER-27: «печатает» для панели разговоров (не действие босса)
  send({ type: 'user_typing' });
}

export function actionResolveEvent(auto = false) {
  // SER-23: авто-закрытие окна прессы после релиза не должно выглядеть действием босса
  // (иначе сервер выключает автопилот и отдаёт управление игроку)
  send({ type: 'resolve_event' }, auto);
}
// SRV-05: сквозной номер запроса сюжета — ответ принимаем только на свой (вкладки не путаются)
let storyReqSeq = 0;
let pendingStoryReq: number | null = null;
export function actionGenerateStory(genreId: string, typeId: string) {
  pendingStoryReq = ++storyReqSeq;
  send({ type: 'generate_story', genreId, typeId, reqId: pendingStoryReq });
}

// результат генерации названия/сюжета
let storyResult: { ok: boolean; title?: string; plot?: string; error?: string } | null = null;
export function useStoryResult(): { ok: boolean; title?: string; plot?: string; error?: string } | null {
  useSyncExternalStore(subscribe, () => storyResult);
  return storyResult;
}
export function clearStoryResult(): void {
  storyResult = null;
  emit();
}

export function setSpeed(v: number) {
  send({ type: 'set_speed', v });
}

export function newGameAction() {
  send({ type: 'new_game' });
}

/** PLAN-25: клиент отыграл шаги политики — серверу не нужно доводить действия самому. */
// ─── PLAN-25: свежесть клиента ───
// Реальный случай: вкладка осталась на старом бандле после деплоя, и «фиксы не работают» —
// WebSocket переподключается, а JavaScript в SPA не перезагружается сам.
let serverBuild: string | null = null;
let updateReady = false;
let updateVer = 0;

/** Сервер перезапущен с другой сборкой — предложить перезагрузку. */
export function useUpdateReady(): boolean {
  useSyncExternalStore(subscribe, () => updateVer);
  return updateReady;
}

export function reloadForUpdate(): void {
  location.reload();
}

async function checkBuild(retries = 0): Promise<void> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) throw new Error(`health ${r.status}`);
    const j = (await r.json()) as { build?: string };
    if (!j.build) return;
    if (serverBuild === null) serverBuild = j.build;
    else if (j.build !== serverBuild && !updateReady) {
      updateReady = true;
      updateVer++;
      emit();
    }
  } catch {
    // PLAN-27: деплой перезапускает сервер — health отвечает не сразу, доводим проверку
    // до успеха (иначе плашка обновления не появлялась именно в момент, когда она нужна)
    if (!updateReady && retries < 40) setTimeout(() => void checkBuild(retries + 1), 3000);
  }
}

/**
 * PLAN-26: промах автопилота (кнопка не найдена/скрыта/перекрыта) — в журнал на сервере.
 * Собираем всё, что нужно для разбора: шаг, DOM-контекст цели, последние шаги, сборки, состояние партии.
 */
const reportSeen = new Map<string, { at: number; skipped: number }>();

export function reportAutopilotIssue(kind: string, data: Record<string, unknown>): void {
  try {
    // PLAN-26b: один и тот же промах (kind+target) шлём не чаще раза в 30 с — не спамим базой,
    // повторы считаем и прикладываем числом к следующей записи.
    const key = `${kind}|${String(data.target ?? '')}`;
    const now = Date.now();
    const prev = reportSeen.get(key);
    if (prev && now - prev.at < 30_000) {
      prev.skipped++;
      return;
    }
    reportSeen.set(key, { at: now, skipped: 0 });
    const g = snap.game as GameState | null;
    send({
      type: 'autopilot_log',
      entry: {
        kind,
        suppressed: prev ? prev.skipped : 0,
        ...data,
        clientVersion: APP_VERSION,
        clientBuild: BUILD_DATE,
        serverBuild,
        ua: navigator.userAgent.slice(0, 160),
        viewport: { w: window.innerWidth, h: window.innerHeight },
        game: g
          ? { week: g.week, year: g.year, money: Math.round(g.money), phase: g.activeGame?.phase ?? null, staff: g.staff.length, office: g.officeLevel }
          : null,
      },
    });
  } catch {
    /* журнал не должен мешать игре */
  }
}

export function actionAutopilotDone(): void {
  send({ type: 'autopilot_done' });
}

/**
 * PLAN-24: вид рабочего стола — часть сейва (его ждут на любом устройстве), поэтому через сервер.
 * Сервер валидирует значения (src/server/ui-state.ts) и сохраняет сразу.
 */
export function actionSetUi(patch: { wallpaper?: string | null; windows?: UiWindow[]; icons?: Record<string, { x: number; y: number }>; fx?: 'min' | 'mid' | 'full' }): void {
  send({ type: 'set_ui', ui: { ...(snap.game?.ui ?? {}), ...patch } });
}

// ─── M3: персонал ───
export function actionLevelUp(staffId: string) {
  send({ type: 'level_up', staffId });
}
export function actionTrain(staffId: string, trainingId: number) {
  send({ type: 'train', staffId, trainingId });
}
export function actionChatMessage(text: string) {
  send({ type: 'chat_message', text });
}
export function actionBuyBooster(booster: string) {
  send({ type: 'buy_booster', booster });
}
export function actionUseBooster(staffId: string, booster: string) {
  send({ type: 'use_booster', staffId, booster });
}
export function actionBuyDeadBull(staffId: string) {
  send({ type: 'buy_dead_bull', staffId });
}
export function actionBuyCareerManual() {
  send({ type: 'buy_career_manual' });
}
export function actionApplyCareerManual(staffId: string, target: string) {
  send({ type: 'apply_career_manual', staffId, target });
}

// PLAN-41: окно сотрудника
export function actionRestStaff(staffId: string) {
  send({ type: 'rest_staff', staffId });
}

export function actionTrainToMax(staffId: string) {
  send({ type: 'train_to_max', staffId });
}
export function actionMoveOffice() {
  send({ type: 'move_office' });
}

// ─── M4: рынок ───
export function actionBuyAd(adId: number) {
  send({ type: 'buy_ad', adId });
}
export function actionTakeContract(contractId: number, staffIds: string[]) {
  send({ type: 'take_contract', contractId, staffIds });
}
export function actionStartOwnConsole(name: string, kind: string, cpu: string, media: string) {
  send({ type: 'start_own_console', name, kind, cpu, media });
}

// ─── сейвы (HTTP) ───
export async function exportSave(): Promise<string> {
  // SRV-19: относительный URL — работает и на сервере (:3001), и в dev через vite-прокси
  const r = await fetch('/api/save');
  if (!r.ok) throw new Error(`сервер ответил ${r.status}`);
  return r.text();
}

export async function importSave(raw: string): Promise<boolean> {
  // SRV-19: относительный URL; сетевой сбой — исключение для вызывающего, отказ валидации — false
  const r = await fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
  if (!r.ok) {
    const d = (await r.json().catch(() => null)) as { ok?: boolean } | null;
    if (d && typeof d.ok === 'boolean') return !!d.ok;
    throw new Error(`сервер ответил ${r.status}`);
  }
  const d = (await r.json()) as { ok: boolean };
  return !!d.ok;
}

// ─── MessageBox (клиентское) ───
export interface MessageBoxData {
  title: string;
  text?: string;
  body?: React.ReactNode; // произвольное содержимое (вместо/вместе с text)
  buttons: { label: string; onClick: () => void; disabled?: boolean }[];
  evKey?: string; // ключ события, чей попап показан (пульс сервера не пересоздаёт открытый)
  autopilotTarget?: string; // цель виртуальной мыши автопилота на первой кнопке (plan/14)
  /** v1.18.1: информационный попап — закрывается кликом по окну (в стиле карточек прессы).
   *  Выборные попапы (улучшение, Gamedex) и «Выпустить игру» — НЕ ставить: клик не должен решать. */
  clickToClose?: boolean;
  /** PLAN-46: большой попап-сцена шага квеста/арки — баннер 16:9 (public/quests), emoji/accent — фолбэк. */
  art?: QuestArt;
}

let messageBox: MessageBoxData | null = null;
// аудит 05.09 (баг «Оценки критиков не закрываются с 1-го клика»): клик закрывает попап
// локально, но pendingEvent на сервере ещё висит пару мс — EventWatcher переоткрывал тот же
// попап (mb=null при ev≠null). Отклонение действует только EV_DISMISS_MS: если за это время
// сервер не снял событие — клик потерян (обрыв WS), попап возвращается.
// PLAN-45: возврат делает локальный таймер (раньше — серверный пульс полным снапшотом ~1.5с).
export const EV_DISMISS_MS = 3000;
let dismissedEv: { key: string; at: number } | null = null;
let dismissedBox: MessageBoxData | null = null; // закрытый попап события — вернём, если клик потерялся
let dismissTimer: number | null = null;

export function useMessageBox(): MessageBoxData | null {
  return useSyncExternalStore(subscribe, () => messageBox);
}

export function showMessageBox(mb: MessageBoxData): void {
  messageBox = mb;
  emit();
}

export function closeMessageBox(): void {
  if (!messageBox) return;
  if (messageBox.evKey) {
    dismissedEv = { key: messageBox.evKey, at: Date.now() };
    dismissedBox = messageBox;
    if (dismissTimer !== null) window.clearTimeout(dismissTimer);
    // PLAN-45: если через EV_DISMISS_MS событие всё ещё висит (клик не дошёл — обрыв WS) —
    // возвращаем закрытый попап из памяти: клик можно повторить
    dismissTimer = window.setTimeout(() => {
      dismissTimer = null;
      const d = dismissedEv;
      const box = dismissedBox;
      if (!d || !box || messageBox) return; // другой попап уже открыт — не мешаем
      const ev = snap.game?.pendingEvent;
      if (!ev || JSON.stringify(ev) !== d.key) return; // событие снято — клик дошёл
      messageBox = box;
      emit();
    }, EV_DISMISS_MS + 120);
  }
  messageBox = null;
  emit();
}

export function evDismissed(): { key: string; at: number } | null {
  return dismissedEv;
}

export function clearDismissedEvKey(): void {
  dismissedEv = null;
  dismissedBox = null;
  if (dismissTimer !== null) { window.clearTimeout(dismissTimer); dismissTimer = null; }
}
