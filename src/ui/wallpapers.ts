// PLAN-24: обои рабочего стола. Файлы лежат в репозитории (public/wallpapers),
// превью для диалога выбора — в public/wallpapers/thumbs (сгенерированы из оригиналов).
// Выбор хранится в localStorage, как и сортировка иконок.
export interface Wallpaper {
  id: string;
  title: string;
  file: string;
  thumb: string;
}

export const WALLPAPERS: Wallpaper[] = [
  { id: 'win95-setup-4k', title: 'Windows 95 Setup 4K', file: '/wallpapers/win95-setup-4k.jpg', thumb: '/wallpapers/thumbs/win95-setup-4k.jpg' },
  { id: 'win95-setup-4k-bw', title: 'Setup 4K — чёрно-белый', file: '/wallpapers/win95-setup-4k-bw.jpg', thumb: '/wallpapers/thumbs/win95-setup-4k-bw.jpg' },
  { id: 'original', title: 'Оригинал Windows 95', file: '/wallpapers/original.png', thumb: '/wallpapers/thumbs/original.jpg' },
  { id: 'keyboard', title: 'Клавиатура', file: '/wallpapers/keyboard.jpg', thumb: '/wallpapers/thumbs/keyboard.jpg' },
  { id: 'mouse', title: 'Мышь', file: '/wallpapers/mouse.jpg', thumb: '/wallpapers/thumbs/mouse.jpg' },
  { id: 'circuit-board', title: 'Печатная плата', file: '/wallpapers/circuit-board.jpg', thumb: '/wallpapers/thumbs/circuit-board.jpg' },
  { id: 'cables', title: 'Кабели и разъёмы', file: '/wallpapers/cables.jpg', thumb: '/wallpapers/thumbs/cables.jpg' },
  { id: 'cds', title: 'Компакт-диски', file: '/wallpapers/cds.jpg', thumb: '/wallpapers/thumbs/cds.jpg' },
];

const KEY = 'gds-wallpaper';

/** Выбранный фон: id обоев или null (обычный бирюзовый рабочий стол). */
export function readWallpaper(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && WALLPAPERS.some((w) => w.id === v) ? v : null;
  } catch {
    return null;
  }
}

export function saveWallpaper(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* приватный режим — фон просто не запомнится */
  }
}

export function wallpaperById(id: string | null): Wallpaper | undefined {
  return id ? WALLPAPERS.find((w) => w.id === id) : undefined;
}
