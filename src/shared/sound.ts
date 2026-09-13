// M4 (plan/31 §9.8 + ответы босса 14.09.2026): звук игры.
// Голос: пищалки Win95 в оболочке + вода/студия на экране разработки.
// Дефолт — «тихо»; выключатель и громкость — в трее. Чистая логика уровня живёт здесь.

export type SoundLevel = 'off' | 'low' | 'mid' | 'high';

export const SOUND_LEVELS: readonly SoundLevel[] = ['off', 'low', 'mid', 'high'];

export const DEFAULT_SOUND: SoundLevel = 'low';

/** Уровень из localStorage; мусор и пустое — «тихо» (дефолт босса). */
export function parseSoundLevel(raw: unknown): SoundLevel {
  return raw === 'off' || raw === 'low' || raw === 'mid' || raw === 'high' ? raw : DEFAULT_SOUND;
}

/** Мастер-громкость уровня (0…1). «Тихо» — действительно тихо. */
export function volumeOf(level: SoundLevel): number {
  if (level === 'off') return 0;
  if (level === 'low') return 0.16;
  if (level === 'mid') return 0.35;
  return 0.7;
}

export function soundLabel(level: SoundLevel): string {
  return level === 'off' ? 'Выкл' : level === 'low' ? 'Тихо' : level === 'mid' ? 'Средне' : 'Громко';
}
