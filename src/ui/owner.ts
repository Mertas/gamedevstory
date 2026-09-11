// Деплой (plan/19): флаг владельца студии. Окно «Инвайты» видят только его аккаунт —
// но это лишь интерфейс: сервер проверяет admin сам (403 для остальных).
import { useSyncExternalStore } from 'react';

let owner = false;
const subs = new Set<() => void>();

export function setOwner(v: boolean): void {
  if (owner === v) return;
  owner = v;
  for (const s of subs) s();
}

export function useOwner(): boolean {
  return useSyncExternalStore(
    (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    () => owner,
  );
}
