// Быстрый смоук Акта III: S1 → … → i3. Проверяет тексты, слоты S10, родовые пары, вставки.
// Требует: сервер :8899 и chrome --remote-debugging-port=9334. Запуск: node smoke-act3.mjs
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
  return { title: tb ? tb.textContent : null, text, chips, pending: !!document.querySelector('#btn-next') };
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

// Быстрый путь до S8
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

// S8
let c = await card();
check('S8 «Аукцион»', c.title.includes('S8') && c.title.includes('Аукцион'), c.title);
check('S8: реплика {Героя}', c.text.includes('Сидим до конца'));
check('S8: вставка {Партнёра} (в студии)', c.text.includes('Покупаем не картридж'));
check('S8: 4 ручные вставки', c.chips === 4, 'chips=' + c.chips);

// S8 → S9 (купили)
c = await pick('Биться до конца');
check('S9 «Пломбы и фрезы»', c.title.includes('S9'), c.title);
check('S9: род раскрыт (него/неё → него)', c.text.includes('Утром у него лицо') && !c.text.includes('{него/неё'), c.text.slice(0, 60));
check('S9: «сказал/сказала» раскрыто', !c.text.includes('{сказал/сказала'));
check('S9: вставка по профессии (кодер по умолчанию)', c.text.includes('Пайка аккуратная'));

// S10: слоты по флагу «подделка у нас»
c = await pick('Дальше');
check('S10 «Признание Глеба»', c.title.includes('S10'), c.title);
check('S10: слот начала — офис (ветка «купили»)', c.text.includes('У вас в офисе'), c.text.slice(0, 50));
check('S10: слот финала — «Она у вас. Храните»', c.text.includes('Она у вас. Храните'));
check('S10: реплика {Героя}', c.text.includes('Мы не будем говорить'));

// S11
c = await pick('Тихо простить');
check('S11 «Фильм Жанны»', c.title.includes('S11'), c.title);
check('S11: реплика {Героя}', c.text.includes('Копайте'));

// S12
c = await pick('Участвовать открыто');
check('S12 «Юристы-призраки»', c.title.includes('S12'), c.title);
check('S12: вставка {Партнёра}', c.text.includes('Две трети из трёх'));
check('S12: реплика {Героя}', c.text.includes('Три зонтика — уже крыша'));
check('S12: нет «холодной версии» без флагов', !c.text.includes('Холодная версия'));

// i3
c = await pick('Обнародовать схему');
check('i3 «Разговор»', c.title.includes('i3'), c.title);
check('i3: реплика {Героя}', c.text.includes('Спасибо, что проверили'));
check('i3: коробка показана', c.text.includes('жестяная коробка'));

console.log(`\nСМОК АКТА III: ${pass} ok, ${fail} провал(ов)`);
ws.close();
process.exit(fail ? 1 : 0);
