// Настройки рабочего стола (сетка иконок, сортировка) — общий модуль для ПКМ-меню и приложения «Настройки».
// Хранение прежнее (localStorage); сверху подписка — окно «Настройки» и рабочий стол живут синхронно.
import { useSyncExternalStore } from 'react';

export type DeskSort = 'default' | 'name' | 'kind';

export interface DeskPrefs {
  /** «выровнять по сетке» — иконки прилипают к ячейкам */
  snap: boolean;
  sort: DeskSort;
}

const SNAP_KEY = 'gds-desk-snap';
const SORT_KEY = 'gds-desk-sort';

function load(): DeskPrefs {
  try {
    const sort = localStorage.getItem(SORT_KEY);
    return {
      // «по тайлам» (выровнять по сетке) включено по умолчанию: выключается только явным '0'
      snap: localStorage.getItem(SNAP_KEY) !== '0',
      sort: sort === 'name' || sort === 'kind' ? sort : 'default',
    };
  } catch {
    return { snap: true, sort: 'default' };
  }
}

let prefs: DeskPrefs = load();
const listeners = new Set<() => void>();

function emit(): void {
  for (const f of listeners) f();
}

export function getDeskPrefs(): DeskPrefs {
  return prefs;
}

export function setDeskSnap(snap: boolean): void {
  prefs = { ...prefs, snap };
  try {
    localStorage.setItem(SNAP_KEY, snap ? '1' : '0');
  } catch {
    /* noop */
  }
  emit();
}

export function setDeskSort(sort: DeskSort): void {
  prefs = { ...prefs, sort };
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    /* noop */
  }
  emit();
}

export function subscribeDeskPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useDeskPrefs(): DeskPrefs {
  return useSyncExternalStore(subscribeDeskPrefs, getDeskPrefs);
}
