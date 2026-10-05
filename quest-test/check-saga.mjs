// Проверка целостности saga.json: битые ссылки, недостижимые узлы, циклы по «Дальше»-цепочкам.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(readFileSync(path.join(DIR, 'saga.json'), 'utf8'));
const ids = Object.keys(S.nodes);

let errs = [];
for (const id of ids) {
  for (const ch of S.nodes[id].choices || []) {
    if (!S.nodes[ch.to]) errs.push(`${id} -> ${ch.to}: НЕТ УЗЛА`);
  }
  for (const ins of S.nodes[id].inserts || []) {
    if (ins.effects) for (const e of ins.effects) if (!['flag', 'artifact', 'money', 'trust', 'noise', 'conscience', 'biz', 'culture', 'fans'].includes(e.k)) errs.push(`${id}: неизвестный эффект ${e.k}`);
  }
}

// 11.10.2026: родовые пары — @ключ должен быть известной ролью; пара без @ вне реплики — предупреждение
const ROLE_KEYS = new Set(['Скептик', 'Мечтатель', 'Технарь', 'Юрист', 'Финдир', 'Старожил', 'Герой', 'Партнёр']);
const HERO_JOBS = new Set(['coder', 'writer', 'designer', 'sound']);
const COND_KEYS = new Set(['flag', 'notFlag', 'notFlags', 'flagsAll', 'flagsAny', 'flagsCount', 'fansMin', 'heroJob', 'moneyMin', 'moneyMax', 'noiseMin', 'noiseMax', 'conscienceMin', 'conscienceMax']);
const PAIR = /\{([^{}\/@]+)\/([^{}@]+?)(?:@([\wА-Яа-яЁё-]+))?\}/g;
const speakerOf = (line) => { const m = /^\s*\{([^{}]+)\}[^:«„]*:\s*[«„]/.exec(String(line)); return m ? m[1].trim() : null; };
const gWarn = [];
function checkGenders(nodeId, line) {
  const speaker = speakerOf(line);
  for (const m of String(line).matchAll(PAIR)) {
    const key = m[3];
    if (key && !ROLE_KEYS.has(key)) gWarn.push(`${nodeId}: родовой ключ @${key} — не роль: «${String(line).slice(0, 60)}…»`);
    if (!key && !speaker) gWarn.push(`${nodeId}: пара без @роли вне реплики: «${String(line).slice(0, 60)}…»`);
  }
}
for (const id of ids) {
  const n = S.nodes[id];
  for (const t of n.text || []) checkGenders(id, t);
  for (const ins of n.inserts || []) {
    if (ins.text) checkGenders(id, ins.text);
    if (ins.label) checkGenders(id, ins.label);
  }
  for (const ch of n.choices || []) {
    if (ch.label) checkGenders(id, ch.label);
    if (ch.result) checkGenders(id, ch.result);
  }
  for (const key of Object.keys(n.slots || {})) for (const v of n.slots[key]) if (v.text) checkGenders(id, v.text);
}

// 11.10.2026: условия вставок — известные ключи, профессии героя
for (const id of ids) {
  for (const ins of S.nodes[id].inserts || []) {
    const w = ins.when;
    if (!w) continue;
    for (const k of Object.keys(w)) {
      if (!COND_KEYS.has(k)) gWarn.push(`${id}: неизвестное условие when.${k}`);
      if (k === 'heroJob') for (const j of (Array.isArray(w[k]) ? w[k] : [w[k]])) if (!HERO_JOBS.has(j)) gWarn.push(`${id}: неизвестная профессия героя «${j}»`);
    }
  }
}

// 11.10.2026: лица узлов — известные лица саги (LLMPics: gds-comet-faces)
const FACE_KEYS = new Set(['face-vera', 'face-kasper', 'face-gleb', 'face-vitalik', 'face-moroz', 'face-zhanna', 'face-anna', 'face-rostotsky', 'face-arkady']);
const faceNodes = ids.filter((i) => S.nodes[i].face);
for (const id of faceNodes) if (!FACE_KEYS.has(S.nodes[id].face)) gWarn.push(`${id}: неизвестное лицо «${S.nodes[id].face}»`);
const seen = new Set();
const q = [S.start];
while (q.length) {
  const id = q.pop();
  if (seen.has(id)) continue;
  seen.add(id);
  for (const ch of S.nodes[id].choices || []) q.push(ch.to);
}
const unreach = ids.filter((i) => !seen.has(i));
const terminal = ids.filter((i) => !(S.nodes[i].choices || []).length);
const stubs = ids.filter((i) => S.nodes[i].stub);

console.log(`Узлов: ${ids.length} · достижимо: ${seen.size} · недостижимо: ${unreach.length ? unreach.join(', ') : 'нет'}`);
console.log(`Тупиков (без исходов): ${terminal.join(', ')}`);
console.log(`Заглушек: ${stubs.length} (${stubs.join(', ')})`);
console.log(gWarn.length ? 'РОД (предупреждения):\n' + gWarn.join('\n') : 'Род: OK');
console.log(`Лица: ${faceNodes.length} сцен`);
console.log(errs.length ? 'ОШИБКИ:\n' + errs.join('\n') : 'Ссылки: OK');
process.exit(errs.length || unreach.length ? 1 : 0);
