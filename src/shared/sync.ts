// PLAN-45: синхронизация состояния диффами по сокету.
// Сервер держит зеркало последнего отправленного состояния и строит операции (diffOps);
// клиент применяет кадр к своему состоянию (applyOps) — иммутабельно, копии только на пути
// операций, чтобы zustand-селекторы и «подпись чата» (UI-01) работали без изменений.
// Функции чистые — покрываются тестами (test/sync.test.ts).
//
// Диагноз (03.10.2026): каждый тик слался полный снапшот (1.7 МБ) каждой вкладке —
// до 8.6 МБ/с; 99.9% серверного трафика. Архив игр (77% веса) — append-only и т.п.

/** Путь к значению: ключи объектов и индексы массивов. */
export type SyncPath = (string | number)[];

/**
 * Операция кадра:
 *  - s: установить значение по пути (создать/заменить);
 *  - d: удалить ключ объекта;
 *  - a: splice массива — с позиции start удалить del и вставить items.
 */
export type SyncOp =
  | ['s', SyncPath, unknown]
  | ['d', SyncPath]
  | ['a', SyncPath, number, number, unknown[]];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Глубокое равенство для элементов массивов (значения — JSON-подобные). */
export function deepEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEq(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!(k in b)) return false;
      if (!deepEq(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

const SHIFT_MAX = 96; // сколько элементов головы можем признать «сдвигом кольца» за один кадр

/**
 * Кольцевые буферы (чат/лог/почта): голова ушла на k, хвост дописан.
 * Проверка полная (без ложных срабатываний) — вызывается только когда префикс/суффикс пусты.
 */
function findShift(a: unknown[], b: unknown[]): number {
  const n = a.length;
  const kmax = Math.min(SHIFT_MAX, n - 1);
  for (let k = 1; k <= kmax; k++) {
    const rest = n - k; // столько старых элементов должно уцелеть в начале b
    if (rest > b.length) break; // в новом меньше, чем остаётся старого — не сдвиг
    if (!deepEq(a[k], b[0])) continue;
    let ok = true;
    for (let i = 1; i < rest; i++) {
      if (!deepEq(a[k + i], b[i])) { ok = false; break; }
    }
    if (ok) return k;
  }
  return -1;
}

/** Массивы: префикс/суффикс → одна сплайс-операция; сдвиг кольца — две (удалить голову, дописать хвост). */
function walkArray(a: unknown[], b: unknown[], path: SyncPath, ops: SyncOp[]): void {
  const n = a.length;
  const m = b.length;
  const min = Math.min(n, m);
  let p = 0;
  while (p < min && deepEq(a[p], b[p])) p++;
  let s = 0;
  while (s < min - p && deepEq(a[n - 1 - s], b[m - 1 - s])) s++;
  if (n === m && p === n) return; // идентичны (защита: вызывающий отсеивает по ссылке)
  if (p === 0 && s === 0 && n >= 64 && m >= 64) {
    // типичный чат/лог: префикс и суффикс пусты (сдвиг головы ломает оба) — ищем кольцевой сдвиг
    const k = findShift(a, b);
    if (k > 0) {
      ops.push(['a', path, 0, k, []]);
      const rest = n - k;
      if (m > rest) ops.push(['a', path, rest, 0, b.slice(rest)]);
      return;
    }
  }
  // одна сплайс-операция: [p, n-s) → [p, m-s); хвостовая вставка и точечная замена — её частные случаи
  ops.push(['a', path, p, n - p - s, b.slice(p, m - s)]);
}

function walk(a: unknown, b: unknown, path: SyncPath, ops: SyncOp[]): void {
  if (Object.is(a, b)) return;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) { ops.push(['s', path, b]); return; }
    walkArray(a, b, path, ops);
    return;
  }
  if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) {
      const av = a[k];
      if (!(k in b)) { if (av !== undefined) ops.push(['d', path.concat(k)]); continue; }
      const bv = b[k];
      // undefined в состоянии — как отсутствие ключа (JSON его не переносит)
      if (bv === undefined) { if (av !== undefined) ops.push(['d', path.concat(k)]); continue; }
      walk(av, bv, path.concat(k), ops);
    }
    for (const k of Object.keys(b)) {
      if (k in a) continue;
      const bv = b[k];
      if (bv !== undefined) ops.push(['s', path.concat(k), bv]);
    }
    return;
  }
  ops.push(['s', path, b]);
}

/** Операции перехода prev → next; [] — состояния равны. */
export function diffOps(prev: unknown, next: unknown): SyncOp[] {
  const ops: SyncOp[] = [];
  walk(prev, next, [], ops);
  return ops;
}

// ─── клиент ───

type Key = string | number;
type Rec = Record<Key, unknown>;

function setPath(node: unknown, path: SyncPath, value: unknown): unknown {
  if (path.length === 0) return value;
  if (node === null || typeof node !== 'object') return node; // защита от рассинхрона
  const key = path[0] as Key;
  const child = (node as Rec)[key];
  const next = setPath(child, path.slice(1), value);
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[key as number] = next;
    return copy;
  }
  return { ...(node as Record<string, unknown>), [key]: next };
}

function delPath(node: unknown, path: SyncPath): unknown {
  if (path.length === 0 || node === null || typeof node !== 'object') return node;
  const key = path[0] as Key;
  if (path.length === 1) {
    if (Array.isArray(node)) return node;
    const copy = { ...(node as Record<string, unknown>) };
    delete copy[String(key)];
    return copy;
  }
  const child = (node as Rec)[key];
  const next = delPath(child, path.slice(1));
  if (next === child) return node;
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[key as number] = next;
    return copy;
  }
  return { ...(node as Record<string, unknown>), [key]: next };
}

function splicePath(node: unknown, path: SyncPath, start: number, del: number, items: unknown[]): unknown {
  if (path.length === 0) {
    if (!Array.isArray(node)) return node;
    const copy = node.slice();
    copy.splice(start, del, ...items);
    return copy;
  }
  if (node === null || typeof node !== 'object') return node;
  const key = path[0] as Key;
  const rest = path.slice(1);
  const child = (node as Rec)[key];
  let next: unknown;
  if (rest.length === 0) {
    if (!Array.isArray(child)) return node;
    next = child.slice();
    (next as unknown[]).splice(start, del, ...items);
  } else {
    next = splicePath(child, rest, start, del, items);
    if (next === child) return node;
  }
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[key as number] = next;
    return copy;
  }
  return { ...(node as Record<string, unknown>), [key]: next };
}

/** Применить кадр к состоянию (иммутабельно: новые ссылки только на пути операций). */
export function applyOps<T>(root: T, ops: SyncOp[]): T {
  let cur: unknown = root;
  for (const op of ops) {
    if (op[0] === 's') cur = setPath(cur, op[1], op[2]);
    else if (op[0] === 'd') cur = delPath(cur, op[1]);
    else cur = splicePath(cur, op[1], op[2], op[3], op[4]);
  }
  return cur as T;
}
