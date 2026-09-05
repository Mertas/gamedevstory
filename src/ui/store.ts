// Игровой стор: WebSocket-клиент. Вся игра — на сервере; здесь только снапшоты и отправка действий.
import { useSyncExternalStore } from 'react';
import type * as React from 'react';
import type { HireMethodId } from '../core/config';
import type { GameState, StartProjectInput } from '../core/types';
import type { ChatState } from '../shared/chat';
import type { MetaData } from '../shared/meta';

export interface Snapshot {
  game: GameState | null;
  chat: ChatState;
  speed: number;
  connected: boolean;
  meta: MetaData | null;
}

let snap: Snapshot = {
  game: null, chat: { msgs: [], queue: [], phases: {} }, speed: 1, connected: false, meta: null,
};
let actionError: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ─── WebSocket ───
const WS_PORT = 3001;

function connect(): void {
  const ws = new WebSocket(`ws://${location.hostname}:${WS_PORT}/ws`);
  (globalThis as { __gdsWs?: WebSocket }).__gdsWs = ws;
  // после (пере)подключения сразу синхронизируемся — иначе при паузе (висит событие,
  // тикер молчит) state не придёт и потерянный клик не вернёт попап решения
  ws.onopen = () => send({ type: 'get_state' });
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(String(e.data)) as {
        type: string; game?: GameState; chat?: ChatState; speed?: number; data?: MetaData; error?: string;
        ok?: boolean; title?: string; plot?: string;
      };
      if (d.type === 'meta' && d.data) {
        snap = { ...snap, meta: d.data };
        emit();
      }
      if (d.type === 'state' && d.game) {
        snap = { game: d.game, chat: d.chat ?? snap.chat, speed: d.speed ?? snap.speed, connected: true, meta: snap.meta };
        emit();
      }
      if (d.type === 'action_result' && d.error) {
        actionError = d.error;
        emit();
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

function send(msg: unknown): void {
  // сообщение кладём в очередь на случай переподключения — упрощённо: шлём при открытом сокете
  const wss = (globalThis as { __gdsWs?: WebSocket }).__gdsWs;
  if (wss?.readyState === WebSocket.OPEN) wss.send(JSON.stringify(msg));
}

// ─── хуки ───
export function useSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snap);
}

export function useGame(): GameState {
  return useSyncExternalStore(subscribe, () => snap).game as GameState;
}

export function useActionError(): string | null {
  useSyncExternalStore(subscribe, () => actionError);
  return actionError;
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
  const r = await fetch(`http://${location.hostname}:${WS_PORT}/api/save`);
  return r.text();
}

export async function importSave(raw: string): Promise<boolean> {
  const r = await fetch(`http://${location.hostname}:${WS_PORT}/api/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
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
