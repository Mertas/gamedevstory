// Игровой стор: WebSocket-клиент. Вся игра — на сервере; здесь только снапшоты и отправка действий.
import { useRef, useSyncExternalStore } from 'react';
import type * as React from 'react';
import type { HireMethodId } from '../core/config';
import type { GameState, StartProjectInput } from '../core/types';
import type { ChatState } from '../shared/chat';
import type { MetaData } from '../shared/meta';
import type { AutopilotStep } from '../shared/autopilot';
import { Outbox } from './outbox';

export interface Snapshot {
  game: GameState | null;
  chat: ChatState;
  speed: number;
  connected: boolean;
  meta: MetaData | null;
  autopilot: boolean;
}

let snap: Snapshot = {
  game: null, chat: { msgs: [], queue: [], phases: {} }, speed: 1, connected: false, meta: null, autopilot: false,
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

// ─── WebSocket ───

// SRV-06: sid — сессия страницы (новый при перезагрузке), seq — сквозной номер исходящего.
// Сервер подтверждает каждое действие (action_result{seq}), повтор при переподключении
// отсекается по sid+seq — клик из окна обрыва не теряется и не выполняется дважды.
const SID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const outbox = new Outbox();
let seqN = 0;

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

function connect(): void {
  // SRV-19: адрес от самой страницы (а не хардкод :3001) — в dev-режиме vite проксирует /ws
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  (globalThis as { __gdsWs?: WebSocket }).__gdsWs = ws;
  // после (пере)подключения сразу синхронизируемся — иначе при паузе (висит событие,
  // тикер молчит) state не придёт и потерянный клик не вернёт попап решения
  ws.onopen = () => {
    autopilotQueue.length = 0; // SRV-16: после реконнекта старые шаги мыши не доигрываем
    // SRV-06: повторяем недоставленные действия (не старше TTL) — клик не пропадает молча
    const { ready, dropped } = outbox.drain();
    if (dropped > 0) raiseError(`Связь пропала: ${dropped} ${actionsWord(dropped)} не доставлено`);
    for (const it of ready) ws.send(it.data);
    send({ type: 'get_state' });
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(String(e.data)) as {
        type: string; game?: GameState; chat?: ChatState; speed?: number; data?: MetaData; error?: string;
        ok?: boolean; title?: string; plot?: string; autopilot?: boolean; step?: unknown; seq?: number;
      };
      if (d.type === 'meta' && d.data) {
        snap = { ...snap, meta: d.data };
        emit();
      }
      if (d.type === 'state' && d.game) {
        // UI-01: чат меняется редко (только новые сообщения) — сохраняем прежнюю ссылку,
        // иначе окно чата ререндерилось бы каждый игровой тик
        const nextChat = d.chat ?? snap.chat;
        snap = {
          game: d.game, chat: chatSig(nextChat) === chatSig(snap.chat) ? snap.chat : nextChat,
          speed: d.speed ?? snap.speed,
          connected: true, meta: snap.meta, autopilot: Boolean(d.autopilot),
        };
        // SRV-16: автопилот выключен — очередь шагов не доигрываем (мышь не жмёт за игрока)
        if (!snap.autopilot) autopilotQueue.length = 0;
        emit();
      }
      if (d.type === 'autopilot_step' && d.step) {
        autopilotQueue.push(d.step as AutopilotStep);
        emit();
      }
      if (d.type === 'action_result') {
        if (typeof d.seq === 'number') outbox.ack(d.seq); // SRV-06: действие доставлено
        if (d.error) raiseError(d.error);
      }
      if (d.type === 'story_result') {
        storyResult = {
          ok: Boolean(d.ok), title: d.title, plot: d.plot, error: d.error,
        } as { ok: boolean; title?: string; plot?: string; error?: string };
        emit();
      }
    } catch { /* игнор */ }
  };
  ws.onclose = () => {
    snap = { ...snap, connected: false };
    emit();
    setTimeout(connect, 2000);
  };
  ws.onerror = () => ws.close();
}

connect();

// SRV-06: подчистка очереди, если ack не пришёл при живой связи (старый сервер/потеря) —
// offline-очередь не трогаем: её судьбу решает drain() при переподключении (с отчётом о потерях)
window.setInterval(() => {
  const wss = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  if (wss?.readyState === WebSocket.OPEN) outbox.prune();
}, 5000);

function send(msg: unknown): void {
  // SRV-06: исходящее нумеруется (seq) и ждёт в очереди до ack сервера — закрытый сокет
  // больше не означает потерю клика: при переподключении недоставленное уйдёт повторно
  const seq = ++seqN;
  // действия виртуальной мыши автопилота помечаются autopilot:true (не выключают автопилот)
  const auto = (globalThis as { __gdsAutopilot?: boolean }).__gdsAutopilot === true;
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

const autopilotQueue: AutopilotStep[] = [];

/** длина очереди шагов (реактивный сигнал для курсора) */
export function useAutopilotQueueLen(): number {
  return useSyncExternalStore(subscribe, () => autopilotQueue.length);
}

/** взять первый шаг из очереди (null — пусто) */
export function takeAutopilotStep(): AutopilotStep | null {
  const s = autopilotQueue.shift() ?? null;
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

export function actionHire(method: HireMethodId, staffId?: string) {
  send({ type: 'hire', method, ...(staffId ? { staffId } : {}) });
}

export function actionFire(staffId: string) {
  send({ type: 'fire', staffId });
}

export function actionBuyLicense(consoleId: string) {
  send({ type: 'buy_license', consoleId });
}

export function actionResolveBoost(accept: boolean, amount?: number) {
  send({ type: 'resolve_boost', accept, ...(amount !== undefined ? { amount } : {}) });
}
export function actionDismissSalesman() {
  send({ type: 'resolve_salesman' });
}
export function actionResolveGamedex(option: string) {
  send({ type: 'resolve_gamedex', option });
}
export function actionResolveEvent() {
  send({ type: 'resolve_event' });
}
export function actionGenerateStory(genreId: string, typeId: string) {
  send({ type: 'generate_story', genreId, typeId });
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
export function actionChangeCareer(staffId: string, target: string) {
  send({ type: 'change_career', staffId, target });
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
export function actionBuyCareerManual(staffId: string, target: string) {
  send({ type: 'buy_career_manual', staffId, target });
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
  buttons: { label: string; onClick: () => void }[];
  evKey?: string; // ключ события, чей попап показан (пульс сервера не пересоздаёт открытый)
  autopilotTarget?: string; // цель виртуальной мыши автопилота на первой кнопке (plan/14)
}

let messageBox: MessageBoxData | null = null;
// аудит 05.09 (баг «Оценки критиков не закрываются с 1-го клика»): клик закрывает попап
// локально, но pendingEvent на сервере ещё висит пару мс — EventWatcher переоткрывал тот же
// попап (mb=null при ev≠null). Отклонение действует только EV_DISMISS_MS: если за это время
// сервер не снял событие (клик потерян при обрыве WS) — попап возвращается (пульс 1.5с).
export const EV_DISMISS_MS = 3000;
let dismissedEv: { key: string; at: number } | null = null;

export function useMessageBox(): MessageBoxData | null {
  return useSyncExternalStore(subscribe, () => messageBox);
}

export function showMessageBox(mb: MessageBoxData): void {
  messageBox = mb;
  emit();
}

export function closeMessageBox(): void {
  if (!messageBox) return;
  if (messageBox.evKey) dismissedEv = { key: messageBox.evKey, at: Date.now() };
  messageBox = null;
  emit();
}

export function evDismissed(): { key: string; at: number } | null {
  return dismissedEv;
}

export function clearDismissedEvKey(): void {
  dismissedEv = null;
}
