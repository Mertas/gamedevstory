// Смоук финала: S1 → … → S22 → S23 → EP → E4. Проверяет пути релиза, титул, слот эпилога.
// Требует: сервер :8899 и chrome --remote-debugging-port=9334. Запуск: node smoke-act6.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url)); // аудит-51 04-P3-7: без абсолютного пути
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:9334';
const URL = 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗ ПРОВАЛ'} ${n}${x ? ' [' + x + ']' : ''}`); };

const list = await (await fetch(CDP + '/json/list')).json();
let page = list.find((t) => t.type === 'page');
if (!page) page = await (await fetch(CDP + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' })).json();
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

let mid = 0;
const waiters = new Map();
ws.on('message', (buf) => {
  let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
});
const cdp = (method, params = {}) => new Promise((resolve) => { const id = ++mid; waiters.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
async function ev(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error('JS exception: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await ev(expr)) return true; await sleep(150); }
  return false;
}
const card = () => ev(`(() => {
  const tb = document.querySelector('.qt-titlebar span');
  const text = [...document.querySelectorAll('#textbox, .qt-result')].map((e) => e.textContent).join('\\n');
  const labels = [...document.querySelectorAll('#choices .qt-choice')].map((x) => x.querySelector('.lbl').textContent.trim());
  return { title: tb ? tb.textContent : null, text, labels, pending: !!document.querySelector('#btn-next') };
})()`);
const clickChoice = (needle) => ev(`(() => {
  const b = [...document.querySelectorAll('#choices .qt-choice')].find((x) => x.querySelector('.lbl').textContent.includes(${JSON.stringify(needle)}));
  if (!b || b.disabled) return false; b.click(); return true;
})()`);
const next = async () => { await ev(`document.querySelector('#btn-next').click()`); await sleep(250); };
async function pick(needle) {
  if (!await clickChoice(needle)) throw new Error('нет варианта: ' + needle);
  await sleep(300);
  let c = await card();
  if (c.pending) { await next(); c = await card(); }
  return c;
}

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: URL });
await sleep(1200);
await ev('localStorage.clear()');
await cdp('Page.reload');
if (!await waitFor(`!!document.querySelector('#choices .qt-choice')`)) { console.log('ФАТАЛЬНО: карточка не отрендерилась'); process.exit(2); }

// Полный путь до S22
for (const s of ['Вставить в старый слот','Оставить только для своих','Купить','Открытый архив','Дальше','Архив Кометы','Дальше','Не публиковать','Согласиться','Отказать гордо','Дальше','Биться до конца','Дальше','Тихо простить','Участвовать открыто','Собрать всех за стол','Дальше','Принять с обещанием','Только для своих','Своими руками','Не решать сейчас','Простить молча','Дальше','Урегулировать','Открытый архив','Людей','Замять','Забрать в студию','Дальше']) {
  await pick(s);
}

// S22
let c = await card();
check('S22 «Релиз»', c.title.includes('S22'), c.title);
check('S22: реплика {Героя}', c.text.includes('вот и дочитываем'));
check('S22: вставка {Партнёра}', c.text.includes('нельзя продать'));
check('S22: вставка «список 42» (always)', c.text.includes('Сорок два пункта'));
check('S22: вставка по профессии (coder)', c.text.includes('Сборка подписана и заморожена'));
check('S22: вставка «спас-людей»', c.text.includes('считали людей по головам'));
check('S22: вставка «вскрытие тихое»', c.text.includes('ни кадра, ни строчки'));
check('S22: род раскрыт (Технарь: «Он вычёркивает»)', c.text.includes('Он вычёркивает') && !c.text.includes('{Он/Она'));
check('S22: cond — B и C недоступны (нет флагов)', c.labels.filter((l) => l.includes('нужен флаг')).length === 2, c.labels.join(' | '));
check('S22: F «Вместе» доступен (финал-отложен)', c.labels.some((l) => l.includes('Вместе') && !l.includes('нужен флаг')));

// S23
c = await pick('A · Как есть');
check('S23 «Титул»', c.title.includes('S23'), c.title);
check('S23: реплика {Героя}', c.text.includes('последнее, что мы отдадим'));
check('S23: род раскрыт (Юрист: «считал»)', c.text.includes('Я считал') && !c.text.includes('{считал/считала'));
check('S23: четыре титула', c.labels.length === 4, c.labels.join(' | '));

// EP
c = await pick('Все причастные');
check('EP: хаб эпилогов', c.title.includes('EP') || c.title.includes('Эпилог'), c.title);
check('EP: шесть предпросмотров', c.labels.filter((l) => l.includes('Показать')).length === 6, c.labels.join(' | '));

// E4 (слот по «пожар замят»)
c = await pick('e4');
check('E4 «Тишина»', c.title.includes('Тишина'), c.title);
check('E4: слот первой строки по «пожар замят»', c.text.includes('Игра вышла тихо — как вышли из этого дела вы.'), c.text.slice(0, 80));
check('E4: нет вставки «копия не явна»', !c.text.includes('перестала отвечать'));
check('E4: финал текста эпилога', c.text.includes('Как и вопрос.'));

console.log(`\nСМОК ФИНАЛА: ${pass} ok, ${fail} провал(ов)`);
ws.close();
process.exit(fail ? 1 : 0);
