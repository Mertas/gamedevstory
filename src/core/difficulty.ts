// АВТОГЕНЕРАЦИЯ: tools/gen-difficulty.ts из difficulty/difficulty-presets.json — руками не править.
// Числа найдены лабораторией баланса (E:/My/gds-autoresearch, эксперимент 63);
// контекст, контракт и приёмка — difficulty/README-agent.md. Обновление чисел: pnpm difficulty:gen.
import { CONFIG } from './config';

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyInfo {
  label: string;
  note: string;
  /** отличия уровня от базового CONFIG: конфиг уровня = base + overrides */
  overrides: Partial<typeof CONFIG>;
}

export const DIFFICULTY: Record<DifficultyId, DifficultyInfo> = {
  easy: {
    label: 'Лёгкий',
    note: 'пройти должен даже неряшливый игрок: подушка больше, разработка дешевле, мир добрее',
    overrides: {
      BLACKOUT_CHANCE: 0.0015,
      BREAKDOWN_CHANCE: 0.001,
      CONTRACT_WEEKLY_RATE: 0.01,
      DEV_COST_SCALE: 1.9,
      EMERGENCY_FUND: 400,
      MEDIA_CHANCE: 0.024,
      START_MONEY: 800,
    },
  },
  normal: {
    label: 'Нормальный',
    note: 'эталон: поиск тюнит именно его, а лёгкий и сложный — надстройка через свои ручки',
    overrides: {},
  },
  hard: {
    label: 'Сложный',
    note: 'уровень про выживание: падать позволено всем, вопрос — как долго продержался',
    overrides: {
      BLACKOUT_CHANCE: 0.006,
      BREAKDOWN_CHANCE: 0.005,
      CONTRACT_WEEKLY_RATE: 0.005,
      DEV_COST_SCALE: 3.2,
      EMERGENCY_FUND: 80,
      MEDIA_CHANCE: 0.012,
      START_MONEY: 400,
    },
  },
};

export const DIFFICULTY_IDS: readonly DifficultyId[] = ['easy', 'normal', 'hard'];

/** Проверка «это наш уровень?» — для входа API и сейвов (старые сейвы без уровня → normal). */
export function isDifficultyId(x: unknown): x is DifficultyId {
  return x === 'easy' || x === 'normal' || x === 'hard';
}

/** Снимок базовых чисел CONFIG на момент импорта (низ «нормального»). Это значения, не производные. */
const BASE: typeof CONFIG = { ...CONFIG };
let current: DifficultyId = 'normal';

/** Текущий уровень (для сохранений и UI). */
export function currentDifficulty(): DifficultyId {
  return current;
}

/** Чистый конфиг уровня (base + overrides) — не трогая глобальный CONFIG. */
export function difficultyConfig(id: DifficultyId): typeof CONFIG {
  return { ...BASE, ...DIFFICULTY[id].overrides };
}

/**
 * Применить уровень к живому CONFIG: сброс к базе, затем перекрытия уровня.
 * Объект CONFIG не пересоздаётся — импортеры (ядро, лаборатория) видят те же ссылки.
 */
export function applyDifficulty(id: DifficultyId): void {
  const target = difficultyConfig(id) as unknown as Record<string, unknown>;
  for (const k of Object.keys(BASE)) {
    (CONFIG as unknown as Record<string, unknown>)[k] = target[k];
  }
  current = id;
  resetDerived();
}

/** Сброс производных кэшей после смены уровня (сейчас кэшей нет — точка расширения на будущее). */
export function resetDerived(): void {
  /* кэшей нет */
}
