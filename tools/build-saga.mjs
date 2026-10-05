#!/usr/bin/env node
// PLAN-49 (Э1): конвертер контента саги «Синяя Комета» — quest-test/saga.json → src/shared/saga-data.ts.
// Запуск из корня репозитория: node tools/build-saga.mjs [--only S1,S1a,S2] [--out src/shared/saga-data.ts]
// ВАЖНО: результат — автогенерированный файл; контент правится в saga.json (стенд), затем перегенерация.
// Валидирует: ссылки choices.to, известные виды эффектов/условий; найденные косяки — exit 1.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'quest-test', 'saga.json');

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? (argv[onlyIdx + 1] ?? '').split(',').filter(Boolean) : null;
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(ROOT, argv[outIdx + 1]) : path.join(ROOT, 'src', 'shared', 'saga-data.ts');

const saga = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const all = Object.keys(saga.nodes);
const ids = only ?? all;
for (const id of ids) if (!saga.nodes[id]) { console.error(`[build-saga] нет узла «${id}» в saga.json`); process.exit(1); }
// сохраняем порядок из saga.json
const nodes = {};
for (const id of all) if (ids.includes(id)) nodes[id] = saga.nodes[id];

// эпилоги без вариантов — финальные узлы: choices = [], final = true (в игре — текст + кнопка «Конец»)
for (const n of Object.values(nodes)) {
  if (n.act === 'эпилог' && Array.isArray(n.choices) && n.choices.length === 0) n.final = true;
}

// ── валидация ──
const EFFECT_KINDS = new Set(['flag', 'artifact', 'trust', 'noise', 'conscience', 'culture', 'biz', 'money', 'fans', 'when']);
const COND_KEYS = new Set(['flag', 'notFlag', 'notFlags', 'flagsAll', 'flagsAny', 'flagsCount', 'fansMin', 'heroJob', 'moneyMin', 'moneyMax', 'noiseMin', 'noiseMax', 'conscienceMin', 'conscienceMax']);
const NODE_KEYS = new Set(['act', 'disp', 'title', 'art', 'emoji', 'accent', 'face', 'prompt', 'text', 'onEnter', 'inserts', 'choices', 'slots', 'stub', 'final', 'hold']);
const errs = [];
const checkEffects = (effs, where) => {
  for (const e of effs ?? []) {
    if (!EFFECT_KINDS.has(e.k)) errs.push(`${where}: неизвестный эффект «${e.k}»`);
    if (e.k === 'flag' && !e.name) errs.push(`${where}: flag без name`);
    if (e.k === 'artifact' && !e.name) errs.push(`${where}: artifact без name`);
    if (e.k === 'trust' && (!e.who || typeof e.v !== 'number')) errs.push(`${where}: trust без who/v`);
    if (['noise', 'conscience', 'culture', 'biz', 'money', 'fans'].includes(e.k) && typeof e.v !== 'number') errs.push(`${where}: ${e.k} без v`);
    if (e.k === 'when') {
      if (!e.cond || !Array.isArray(e.effects)) errs.push(`${where}: when-эффект требует { cond, effects[] }`);
      else { checkCond(e.cond, `${where} when`); checkEffects(e.effects, `${where} when`); }
    }
  }
};
const checkCond = (c, where) => {
  if (!c) return;
  const NUMERIC = ['moneyMin', 'moneyMax', 'noiseMin', 'noiseMax', 'conscienceMin', 'conscienceMax'];
  for (const k of Object.keys(c)) {
    if (!COND_KEYS.has(k)) errs.push(`${where}: неизвестное условие «${k}»`);
    else if (NUMERIC.includes(k) && typeof c[k] !== 'number') errs.push(`${where}: условие «${k}» должно быть числом`);
    else if ((k === 'notFlags' || k === 'flagsAll' || k === 'flagsAny') && (!Array.isArray(c[k]) || c[k].some((x) => typeof x !== 'string'))) errs.push(`${where}: условие «${k}» — массив строк`);
    else if (k === 'flagsCount' && (!c[k] || !Array.isArray(c[k].any) || c[k].any.some((x) => typeof x !== 'string') || typeof c[k].min !== 'number')) errs.push(`${where}: условие «flagsCount» — { any: string[], min: number }`);
  }
};
for (const [id, n] of Object.entries(nodes)) {
  for (const k of Object.keys(n)) if (!NODE_KEYS.has(k)) errs.push(`узел ${id}: неизвестное поле «${k}»`);
  if (!n.title) errs.push(`узел ${id}: нет title`);
  if (!Array.isArray(n.text)) errs.push(`узел ${id}: нет text[]`);
  if (n.hold != null && (!Number.isInteger(n.hold) || n.hold <= 0)) errs.push(`узел ${id}: hold — целое число дней > 0`);
  if (!n.choices?.length && !n.final) errs.push(`узел ${id}: нет choices`);
  n.choices?.forEach((c, i) => {
    checkEffects(c.effects, `${id}#${i} (choice)`);
    checkCond(c.cond, `${id}#${i} (cond)`);
    if (!c.to) errs.push(`узел ${id}#${i}: choice без to`);
  });
  (n.inserts ?? []).forEach((ins, i) => {
    if (ins.mode !== 'manual' && ins.mode !== 'auto') errs.push(`узел ${id}: insert#${i} mode=${ins.mode}`);
    checkCond(ins.when, `${id} insert#${i}`);
    checkEffects(ins.effects, `${id} insert#${i}`);
  });
  checkEffects(n.onEnter, `${id} onEnter`);
  for (const [key, arr] of Object.entries(n.slots ?? {})) {
    for (const v of arr) checkCond(v?.when, `${id} slot ${key}`);
  }
}
if (errs.length) { console.error('[build-saga] ошибки:\n- ' + errs.join('\n- ')); process.exit(1); }

// ссылки: to вне набора — край среза, это нормально; собираем для комментария
const outside = new Set();
for (const n of Object.values(nodes)) for (const c of n.choices ?? []) if (!nodes[c.to]) outside.add(c.to);

// ── генерация TS ──
const H = `// PLAN-49 (Э2): сага «Синяя Комета» — полный контент (акты I–VI, интерлюдии, эпилоги).
// ФАЙЛ СГЕНЕРИРОВАН: tools/build-saga.mjs из quest-test/saga.json — не править вручную.
// EP — хаб предпросмотра стенда: движок его пропускает, эпилог выбирается по флагам (правила 1–7).
// Числа — Э3 (plan/49_Сага_в_игре.md §12): константы + подстановки {≈эпоха}/{≈прошло}/{≈далее} (shared/saga-text).
// Эффекты v: ±1..±3 (тиры); перевод в числа — core/config.ts (SAGA.TIER).
${outside.size ? `// За краем среза (Э2): ${[...outside].join(', ')}.\n` : ''}
export type SagaCond = {
  flag?: string;
  notFlag?: string;
  /** ни одного из перечисленных флагов (для «скрыт при А и B») */
  notFlags?: string[];
  /** все перечисленные флаги должны быть */
  flagsAll?: string[];
  /** хотя бы один из перечисленных флагов */
  flagsAny?: string[];
  flagsCount?: { any: string[]; min: number };
  /** нужно фанатов ≥ SAGA.FANS_MIN */
  fansMin?: boolean;
  /** профессия героя (HERO_CAREERS) */
  heroJob?: string | string[];
  /** деньги студии (K): «касса тонка» — moneyMax, «полна» — moneyMin */
  moneyMin?: number;
  moneyMax?: number;
  /** скрытый ШУМ саги: высокий — noiseMin, тихий — noiseMax */
  noiseMin?: number;
  noiseMax?: number;
  /** СОВЕСТЬ: низкая — conscienceMax, высокая — conscienceMin */
  conscienceMin?: number;
  conscienceMax?: number;
};

export type SagaEffect =
  | { k: 'flag'; name: string }
  | { k: 'artifact'; name: string }
  | { k: 'trust'; who: string; v: number }
  | { k: 'noise' | 'conscience' | 'culture' | 'biz'; v: number }
  | { k: 'money' | 'fans'; v: number; note?: string }
  | { k: 'when'; cond: SagaCond; effects: SagaEffect[] };

export interface SagaChoice {
  label: string;
  to: string;
  cond?: SagaCond;
  effects?: SagaEffect[];
  /** текст-итог после выбора (показывается перед переходом) */
  result?: string;
}

export interface SagaInsertManual { mode: 'manual'; label: string; text: string }
export interface SagaInsertAuto { mode: 'auto'; when?: SagaCond; /** редакторская пометка условия (в игре не видна) */ label?: string; text: string; effects?: SagaEffect[] }
export type SagaInsert = SagaInsertManual | SagaInsertAuto;

export interface SagaNode {
  act: string;
  /** отображаемое имя («S1а»); нет — берём id */
  disp?: string;
  title: string;
  /** ключ арта: public/quests/<art>.png */
  art: string;
  emoji?: string;
  accent?: string;
  /** жетон лица: public/quests/<face>.png */
  face?: string;
  /** подзаголовок перед выборами */
  prompt?: string;
  text: string[];
  onEnter?: SagaEffect[];
  inserts?: SagaInsert[];
  choices: SagaChoice[];
  slots?: Record<string, Array<{ when?: SagaCond; text: string }>>;
  /** финальный узел (эпилог): текст + кнопка «Конец»; завершает сагу */
  final?: boolean;
  /** пауза перед показом узла, дней: сцены-события «через три недели…» */
  hold?: number;
}

export const SAGA_START = ${JSON.stringify(saga.start)};
export const SAGA_NODES: Record<string, SagaNode> = `;

const body = JSON.stringify(nodes, null, 1);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, H + body + ';\n');
const count = Object.keys(nodes).length;
console.log(`[build-saga] ок: ${count} узлов → ${path.relative(ROOT, OUT)} (${(H.length + body.length).toLocaleString('ru')} симв.)`);
