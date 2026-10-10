// Генератор src/core/difficulty.ts из difficulty/difficulty-presets.json.
// Числа находит лаборатория баланса (E:/My/gds-autoresearch) — здесь только перенос в код,
// чтобы документ и код не расходились. Запуск: pnpm difficulty:gen
import { readFileSync, writeFileSync } from 'node:fs';

interface PresetLevel {
  id: string;
  label: string;
  note: string;
  overrides: Record<string, number>;
}
interface PresetDoc {
  source: { championExperimentId?: number; protocolDays?: number; seeds?: number[] };
  levels: PresetLevel[];
}

const doc = JSON.parse(readFileSync('difficulty/difficulty-presets.json', 'utf8')) as PresetDoc;
const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const fmtOverrides = (o: Record<string, number>): string => {
  const keys = Object.keys(o).sort();
  if (!keys.length) return '{}';
  return `{\n${keys.map((k) => `      ${k}: ${o[k]},`).join('\n')}\n    }`;
};

const blocks = doc.levels
  .map((l) => `  ${l.id}: {\n    label: '${esc(l.label)}',\n    note: '${esc(l.note)}',\n    overrides: ${fmtOverrides(l.overrides)},\n  },`)
  .join('\n');

const out = `// АВТОГЕНЕРАЦИЯ: tools/gen-difficulty.ts из difficulty/difficulty-presets.json — руками не править.
// Числа найдены лабораторией баланса (E:/My/gds-autoresearch, эксперимент ${doc.source.championExperimentId ?? '—'});
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
${blocks}
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

/**
 * аудит-51 СВОД-P1-1: конфиг партии перед операцией её серверной сессии.
 * CONFIG — один объект на процесс, а операции партий разных уровней чередуются;
 * каждая точка входа сессии (тик, действие, импорт сейва) вызывает это.
 * Смена дёшева: применяется только при отличии уровня.
 */
export function ensureDifficulty(id: DifficultyId): void {
  if (current !== id) applyDifficulty(id);
}

/** Сброс производных кэшей после смены уровня (сейчас кэшей нет — точка расширения на будущее). */
export function resetDerived(): void {
  /* кэшей нет */
}
`;

writeFileSync('src/core/difficulty.ts', out);
console.log('difficulty.ts записан; уровней:', doc.levels.length, '| champion:', doc.source.championExperimentId ?? '—');
