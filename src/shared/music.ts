// Настройка «выключать музыку в неактивной вкладке» (глобальная, localStorage — как уровень звука).
// Действует на музыку игры: Бах в «Коде» (wtc) и плеер Winamp.
// Дефолт босса: выключать (музыка в фоне — сюрприз, играем тишиной).

export const MUSIC_HIDDEN_KEY = 'gds-music-hidden';

export type MusicHidden = 'on' | 'off';

export const DEFAULT_MUSIC_HIDDEN: MusicHidden = 'on';

/** Мусор и пустое — дефолт. */
export function parseMusicHidden(raw: unknown): MusicHidden {
  return raw === 'off' ? 'off' : 'on';
}

export function musicHiddenLabel(v: MusicHidden): string {
  return v === 'on' ? 'Выключать' : 'Не выключать';
}

/** Прочитать из localStorage (безопасно для тестов/SSR). */
export function readMusicHidden(): MusicHidden {
  try {
    return parseMusicHidden(localStorage.getItem(MUSIC_HIDDEN_KEY));
  } catch {
    return DEFAULT_MUSIC_HIDDEN;
  }
}

/** Записать в localStorage. */
export function writeMusicHidden(v: MusicHidden): void {
  try {
    localStorage.setItem(MUSIC_HIDDEN_KEY, v);
  } catch {
    /* noop */
  }
}
