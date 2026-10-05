// PLAN-46 (v1.44.0): арт-баннеры шагов квестов — файл public/quests/<key>.png,
// emoji/accent — фолбэк-плитка, пока картинка не сгенерирована в LLMPics (проект gds-quests).
// Ключ: у процедурного квеста — id шаблона (pirates…), у авторской арки — «<arcId>-s<step>»,
// чтобы каждая ветка эпилога (ушёл/остался, выгорел/справился) имела свою сцену.
import type { GenQuestData } from '../core/types';

export interface QuestArt {
  /** URL картинки (лежит в public/quests, отдаётся как /quests/…) */
  src: string;
  /** фолбэк: крупная эмодзи на плитке, если картинки пока нет */
  emoji?: string;
  /** фолбэк/акцент: цвет полосы и подсветки (hex) */
  accent?: string;
  /** PLAN-49: жетон лица персонажа поверх баннера (левый верх) — главы саги */
  face?: { src: string; emoji?: string; title?: string };
}

interface ArtTheme { emoji: string; accent: string }

/** 11 процедурных квестов + 6 авторских арок — цвета подобраны под настроение сцен. */
const THEMES: Record<string, ArtTheme> = {
  // — процедурные квесты (questgen) —
  pirates: { emoji: '🏴☠️', accent: '#8a5a2b' },
  interview: { emoji: '📰', accent: '#4a6fa5' },
  fanletter: { emoji: '💌', accent: '#c96a8a' },
  sponsor: { emoji: '💼', accent: '#3f8f6f' },
  conference: { emoji: '🎓', accent: '#6a5acd' },
  leak: { emoji: '🕵️', accent: '#4d6272' },
  museum: { emoji: '🏛️', accent: '#9a7b4f' },
  rivals: { emoji: '😼', accent: '#b04a3a' },
  birthday: { emoji: '🎂', accent: '#d89a3a' },
  charity: { emoji: '💝', accent: '#b0637a' },
  hardware: { emoji: '💾', accent: '#5a7a8a' },
  // — авторские арки (storylines) —
  offer: { emoji: '🤝', accent: '#4a6fa5' },
  burnout: { emoji: '🔋', accent: '#c06040' },
  dream: { emoji: '🌠', accent: '#7a5acd' },
  rivalry: { emoji: '⚔️', accent: '#b04a3a' },
  mentorship: { emoji: '🧑‍🏫', accent: '#3f8f6f' },
  generations: { emoji: '🕹️', accent: '#6a7a3a' },
};

/** Арт шага story-события: квест — файл шаблона, арка — файл ветки «<arcId>-s<step>». */
export function questArt(arcId: string, step: number, gen?: Pick<GenQuestData, 'template'> | null): QuestArt {
  const base = gen?.template ?? arcId;
  const key = gen ? base : `${arcId}-s${step}`;
  const t = THEMES[base] ?? { emoji: '📜', accent: '#4a6fa5' };
  return { src: `quests/${key}.png`, emoji: t.emoji, accent: t.accent };
}

// PLAN-49: жетоны лиц саги — public/quests/face-*.png (LLMPics: gds-comet-faces)
const SAGA_FACES: Record<string, { emoji: string; title: string }> = {
  'face-vera': { emoji: '📚', title: 'Вера Штерн · библиотекарь' },
  'face-kasper': { emoji: '🏺', title: 'Каспер · цифровой археолог' },
  'face-gleb': { emoji: '🧥', title: 'Глеб · коллекционер' },
  'face-vitalik': { emoji: '🧸', title: 'Виталик · барахольщик' },
  'face-moroz': { emoji: '☕', title: 'Мороз · последний из «Полюса»' },
  'face-zhanna': { emoji: '🎬', title: 'Жанна · документалистка' },
  'face-anna': { emoji: '🎹', title: 'Анна Каверина · «К.»' },
  'face-rostotsky': { emoji: '🦈', title: 'Виктор Ростоцкий · «Пиксель Холдинг»' },
  'face-arkady': { emoji: '📼', title: 'Аркадий Штерн · 1983' },
};

/** Арт главы саги: баннер 16:9 + жетон лица персонажа (если у сцены есть хозяин). */
export function sagaArt(node: { art: string; emoji?: string; accent?: string; face?: string }): QuestArt {
  const out: QuestArt = { src: `quests/${node.art}.png`, emoji: node.emoji, accent: node.accent };
  if (node.face) {
    const fm = SAGA_FACES[node.face];
    out.face = { src: `quests/${node.face}.png`, emoji: fm?.emoji ?? '🎭', title: fm?.title ?? node.face };
  }
  return out;
}
