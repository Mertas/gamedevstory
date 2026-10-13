// Смоук Акта V: S1 → … → i5 → S22. Проверяет флаговые вставки, cond, партнёра, onEnter-флаг Анны.
// Требует: сервер :8899 и chrome --remote-debugging-port=9334. Запуск: node smoke-act5.mjs
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

// Путь до S18
for (const s of ['Вставить в старый слот','Оставить только для своих','Купить','Открытый архив','Дальше','Архив Кометы','Дальше','Не публиковать','Согласиться','Отказать гордо','Дальше','Биться до конца','Дальше','Тихо простить','Участвовать открыто','Собрать всех за стол','Дальше','Принять с обещанием','Только для своих','Своими руками','Не решать сейчас','Простить молча','Дальше']) {
  await pick(s);
}

// S18
let c = await card();
check('S18 «Иск»', c.title.includes('S18') && c.title.includes('Иск'), c.title);
check('S18: реплика {Героя}', c.text.includes('Считайте, чья ставка длиннее'));
check('S18: вставка {Партнёра}', c.text.includes('умеем считать'));
check('S18: нет вставки копии (флага нет)', !c.text.includes('в обход воли хранителя'));
check('S18: cond-выборы копии помечены «нужен флаг» (2 шт)', c.labels.filter((l) => l.includes('нужен флаг')).length === 2, c.labels.join(' | '));

// S19
c = await pick('Урегулировать');
check('S19 «Совет Кометы»', c.title.includes('S19'), c.title);
check('S19: реплика {Героя}', c.text.includes('тайных голосов'));
check('S19: вставка «кодекс полный» (Мороз)', c.text.includes('Правило пятое'));
check('S19: сделка с Ростоцким — вставка', c.text.includes('Издаём то, чего он ещё не запретил'));
check('S19: вставка партнёра («Смета этой ночи»)', c.text.includes('Смета этой ночи'));
check('S19: нет Глеба (ни проект, ни исчез)', !c.text.includes('реестр') && !c.text.includes('пломбами'));

// S20
c = await pick('Открытый архив');
check('S20 «Пожар»', c.title.includes('S20'), c.title);
check('S20: реплика {Героя}', c.text.includes('Паника — это ещё один пожар'));
check('S20: нет копии в хранилище', !c.text.includes('хранилище'));
check('S20: вставка {Партнёра} (смета)', c.text.includes('Ремонт закроем'));

// S20b
c = await pick('Людей');
check('S20b «утро»', c.title.includes('S20') && c.title.includes('утро'), c.title);
check('S20b: стабилизатор 1983', c.text.includes('старый стабилизатор'));
check('S20b: письмо «К.» — молчание', c.text.includes('Ответы приходят лично'));
check('S20b: авторская правда', c.text.includes('виновника нет'));

// S21
c = await pick('Проклятие');
check('S21 «Прощание»', c.title.includes('S21'), c.title);
check('S21: реплика {Героя}', c.text.includes('Мы прощаемся'));
check('S21: кодекс полный (вариативная реплика)', c.text.includes('Седьмое, помнишь'));
check('S21: Анна на похоронах', c.text.includes('женщина в перчатках'));
check('S21: вставка «финал-отложен»', c.text.includes('не имеем права торопиться'));
check('S21: «Отдать Анне» доступно (onEnter-флаг)', c.labels.some((l) => l.includes('Отдать Анне') && !l.includes('нужен флаг')), c.labels.join(' | '));

// i5
c = await pick('Забрать в студию');
check('i5 «Маяк»', c.title.includes('i5'), c.title);
check('i5: ДАЛЬШЕ — ТИШИНА', c.text.includes('ДАЛЬШЕ — ТИШИНА'));
check('i5: «всё, что случится дальше, — ваше»', c.text.includes('ваше'));

// мост в акт VI
c = await pick('Дальше');
check('после i5 — стаб S22 (Акт VI)', c.title.includes('S22'), c.title);

console.log(`\nСМОК АКТА V: ${pass} ok, ${fail} провал(ов)`);
ws.close();
process.exit(fail ? 1 : 0);
