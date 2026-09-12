// PLAN-22: профиль игрока на клиенте — уровень (число открытых комбо), звание, набор пар.
// Отдельный кэш вне WS-стора: профиль берётся REST-ом один раз и обновляется после старта проекта.
import { useEffect, useState } from 'react';
import { apiProfile, type ProfileInfo } from './api';

let profile: ProfileInfo | null = null;
let pending: Promise<ProfileInfo | null> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

/** Загрузить профиль (один раз; force — после событий, меняющих набор комбо). */
export function ensureProfile(force = false): void {
  if (pending || (profile && !force)) return;
  pending = apiProfile()
    .then((p) => {
      profile = p.ok ? p : null;
      return profile;
    })
    .catch(() => null)
    .then((p) => {
      pending = null;
      notify();
      return p;
    });
}

/** Сбросить кэш (выход из аккаунта). */
export function clearProfile(): void {
  profile = null;
  pending = null;
  notify();
}

/** Открытые пары «жанр|тип» (пустое множество, пока профиль не загружен). */
export function openedSet(): Set<string> {
  return new Set(profile?.combos ?? []);
}

/** Хук: профиль игрока (null — ещё грузится). */
export function useProfile(): ProfileInfo | null {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = (): void => bump((v) => v + 1);
    listeners.add(fn);
    ensureProfile(true); // PLAN-22: экран перемонтировали (выход в меню) — тянем свежий уровень
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return profile;
}
