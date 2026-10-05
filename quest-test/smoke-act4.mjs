// Смоук Акта IV: S1 → … → i4. Проверяет тексты, вставки (партнёр/профессия/флаги), cond-скрытие, род.
// Требует: сервер :8899 и chrome --remote-debugging-port=9334. Запуск: node smoke-act4.mjs
import { createRequire } from 'node:module';
const require = createRequire('E:/MY/GameDevStory/package.json');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:9334';
const URL = 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { ok ? pass++ : fail++; console.log(`${ok ? '✓' : '✗ ПРОВАЛ'} ${n}${x ? ' [' + x + ']' : ''}`); };

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
  const chips = document.querySelectorAll('.qt-ins-chip input').length;
  const labels = [...document.querySelectorAll('#choices .qt-choice')].map((x) => x.querySelector('.lbl').textContent.trim());
  return { title: tb ? tb.textContent : null, text, chips, labels, pending: !!document.querySelector('#btn-next') };
})()`);
const hasChoice = (needle) => ev(`[...document.querySelectorAll('#choices .qt-choice')].some((x) => x.querySelector('.lbl').textContent.includes(${JSON.stringify(needle)}))`);
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

// Быстрый путь до S13 (акты I–III, выборы как в smoke-act3)
await pick('Вставить в старый слот');
await pick('Оставить только для своих');
await pick('Купить');
await pick('Открытый архив');
await pick('Дальше');
await pick('Архив Кометы');
await pick('Дальше');
await pick('Не публиковать');
await pick('Согласиться');
await pick('Отказать гордо');
await pick('Дальше');
await pick('Биться до конца');
await pick('Дальше');
await pick('Тихо простить');
await pick('Участвовать открыто');
await pick('Собрать всех за стол');
await pick('Дальше');

// S13
let c = await card();
check('S13 «Коробка от печенья»', c.title.includes('S13'), c.title);
check('S13: реплика {Героя}', c.text.includes('Мы дождёмся'));
check('S13: вставка {Партнёра} (в студии)', c.text.includes('Если придётся вносить'));
check('S13: мост «Я библиотекарь»', c.text.includes('Я всё найду'));
check('S13: 1 ручная вставка (ШУМ)', c.chips === 1, 'chips=' + c.chips);
check('S13: «музей» доступен (флаг «зерно музея» есть)', c.labels.some((l) => l.includes('музей') && !l.includes('нужен флаг')), c.labels.join(' | '));
check('S13: жетон лица — Вера (qt-face)', await ev(`(() => { const f = document.querySelector('#banner .qt-face'); return !!f && f.dataset.face === 'face-vera'; })()`));

// S14
c = await pick('Принять с обещанием');
check('S14 «Вскрытие»', c.title.includes('S14'), c.title);
check('S14: реплика {Героя}', c.text.includes('Она всё это время играла'));
check('S14: бонус «печеньевый срок»', c.text.includes('Печеньевый срок кончился'));
check('S14: мост «Заплатки»', c.text.includes('Заплатки'));

// S15
c = await pick('Только для своих');
check('S15 «Сорок две заплатки»', c.title.includes('S15'), c.title);
check('S15: вставка по профессии (кодер)', c.text.includes('Плата не молчит'));
check('S15: вставка {Партнёра}', c.text.includes('Смету прикинул'));
check('S15: нет вставки Глеба (флага нет)', !c.text.includes('фрезы'));
check('S15: «Круг Каспера» помечен «нужен флаг»', c.labels.some((l) => l.includes('Круг Каспера') && l.includes('нужен флаг')), c.labels.join(' | '));
check('S15: «Позвать Глеба» помечен «нужен флаг»', c.labels.some((l) => l.includes('Позвать Глеба') && l.includes('нужен флаг')));

// S16
c = await pick('Своими руками');
check('S16 «Немой финал»', c.title.includes('S16'), c.title);
check('S16: род раскрыт (Технарь: «говорит он»)', c.text.includes('говорит он наконец') && !c.text.includes('{он/она'));
check('S16: реплика {Героя}', c.text.includes('разговор, который можно продолжить'));

// S17
c = await pick('Не решать сейчас');
check('S17 «Кодекс Мороза»', c.title.includes('S17'), c.title);
check('S17: реплика {Героя}', c.text.includes('Тогда допьём'));
check('S17: кодекс (7-е правило)', c.text.includes('Седьмое'));
check('S17: вставка «финал-отложен»', c.text.includes('Не решили? Правильно'));
check('S17: мост к Анне', c.text.includes('Каверина'));

// i4
c = await pick('Простить молча');
check('i4 «Письмо»', c.title.includes('i4'), c.title);
check('i4: конверт «К.»', c.text.includes('одно слово') && c.text.includes('К.'));
check('i4: звонок из облачного офиса', c.text.includes('доиграли'));

console.log(`\nСМОК АКТА IV: ${pass} ok, ${fail} провал(ов)`);
ws.close();
process.exit(fail ? 1 : 0);
