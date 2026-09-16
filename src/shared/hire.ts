// ─── M7: найм — «слои таланта» и спец-сотрудники ───
// Метод поиска = свой круг кандидатов: дешёвый показывает юниоров, дорогой — звёзд.
// Слои собраны по силе (Σ статов) из данных original: Word of Mouth (15) разбит на
// три канала, Open House (10) — на «день открытых дверей» и «Голливуд».
import type { GameState } from '../core/types';
import type { HireMethodId } from '../core/config';

/** Подписи методов (UI и журнал). Цена — отдельно, из CONFIG.HIRE_METHODS. */
export const HIRE_METHOD_LABELS: Record<HireMethodId, string> = {
  'word-of-mouth': 'По знакомству',
  magazine: 'Объявление в журнале',
  online: 'Объявление в интернете',
  vocational: 'Профучилище',
  'open-house': 'День открытых дверей',
  hollywood: 'Голливуд',
};

/** Слои таланта: id сотрудников по методам (юниоры → звёзды). */
export const HIRE_BANDS: Record<HireMethodId, string[]> = {
  // Σ статов 31–46: зелёные новички
  'word-of-mouth': ['biggs-porkins', 'sam-ulation', 'amy-less', 'callie-fornia'],
  // Σ 53–71: крепкая середина
  magazine: ['holly-cow', 'chuck-shultz', 'ann-deroid', 'gilly-bates', 'lady-googoo', 'vincent-vangoo'],
  // Σ 78–115: серьёзные профессионалы
  online: ['marla-sharpovich', 'abraham-malcolm', 'clementine-jones', 'shigeto-minamoto', 'shirley-ugest'],
  // Σ 144–326: специалисты (в данных — отдельный пул)
  vocational: ['bob-clockwatcher', 'charles-royal', 'charlize-theory', 'dave-lightman', 'frank-biller', 'george-marlin', 'honey-sweety', 'jane-dough', 'john-dough', 'kitty-pawson', 'max-torque'],
  // Σ 266–514: очень сильные
  'open-house': ['sandy-claus', 'donny-jepp', 'mindy-crawford', 'bubbles-morgan', 'stephen-jobson'],
  // Σ 518–1085: звёзды (+ открытые спец-сотрудники)
  hollywood: ['cokie-bottleson', 'sophie-kairo', 'dexter-mcphee', 'walt-sidney', 'francoise-bloom'],
};

/** Спец-сотрудники: в поиске не появляются, пока не выполнена награда (оригинал). */
export const MYSTERY_ORDER = ['mister-x', 'king-ackbar', 'grizzly-bearington', 'chimpan-z-force', 'kairobot'] as const;
export const MYSTERY_IDS: ReadonlySet<string> = new Set(MYSTERY_ORDER);

export interface MysteryProgress {
  officeLevel: number;
  grandAwards: number;
  bestGameUnits: number; // лучшая игра по копиям (награда «продать 1 млн»)
}

export function mysteryProgressOf(g: GameState): MysteryProgress {
  return {
    officeLevel: g.officeLevel,
    grandAwards: g.awards?.grand ?? 0,
    bestGameUnits: g.history.reduce((m, h) => Math.max(m, h.units), 0),
  };
}

/** Условия открытия спец-сотрудников — как в оригинале (текст для подсказок). */
export const MYSTERY_UNLOCKS: Record<string, { text: string; ok: (s: MysteryProgress) => boolean }> = {
  'mister-x': { text: '2-й офис', ok: (s) => s.officeLevel >= 2 },
  'king-ackbar': { text: '2-й офис и игра-миллионник', ok: (s) => s.officeLevel >= 2 && s.bestGameUnits >= 1_000_000 },
  'grizzly-bearington': { text: 'победа в Гран-при', ok: (s) => s.grandAwards >= 1 },
  'chimpan-z-force': { text: '3 Гран-при', ok: (s) => s.grandAwards >= 3 },
  'kairobot': { text: '5 Гран-при', ok: (s) => s.grandAwards >= 5 },
};

/** Первый по порядку открытый и не нанятый спец — он показывается в Голливуде
 *  (решение 16.09: одновременно в списке максимум один). */
export function unlockedMystery(g: GameState): string | null {
  const p = mysteryProgressOf(g);
  for (const id of MYSTERY_ORDER) {
    if (g.hiredIds.includes(id)) continue;
    if (MYSTERY_UNLOCKS[id]?.ok(p)) return id;
  }
  return null;
}
