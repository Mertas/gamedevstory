// E2E-прогон стенда через CDP. Требует: сервер :8899 и chrome --remote-debugging-port=9334.
// Запуск: node test-e2e.mjs
import { createRequire } from 'node:module';
const require = createRequire('E:/MY/GameDevStory/package.json');
const WebSocket = require('ws');

const CDP = 'http://127.0.0.1:9334';
const URL = 'http://127.0.0.1:8899/';

let pass = 0, fail = 0;
function check(name, ok, extra = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗ ПРОВАЛ'} ${name}${extra ? '  [' + extra + ']' : ''}`);
}

const list = await (await fetch(CDP + '/json/list')).json();
let page = list.find((t) => t.type === 'page');
if (!page) {
  page = await (await fetch(CDP + '/json/new?' + encodeURIComponent(URL), { method: 'PUT' })).json();
}
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

let mid = 0;
const waiters = new Map();
ws.on('message', (buf) => {
  let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
});
function cdp(method, params = {}) {
  const id = ++mid;
  return new Promise((resolve) => { waiters.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error('JS exception: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await ev(expr)) return true; await sleep(150); }
  return false;
}
const norm = (s) => (s || '').replace(/[\u00A0\u202F]/g, ' '); // NBSP/narrow-NBSP из toLocaleString → обычный пробел
const card = () => ev(`(() => {
  const tb = document.querySelector('.qt-titlebar span');
  const text = [...document.querySelectorAll('#textbox, .qt-result')].map((e) => e.textContent).join('\\n');
  const choices = [...document.querySelectorAll('#choices .qt-choice')].map((b) => ({ label: b.querySelector('.lbl').textContent.trim(), disabled: b.disabled }));
  return { title: tb ? tb.textContent : null, text, choices, pending: !!document.querySelector('#btn-next'), state: document.querySelector('#state-panel').textContent };
})()`).then((c) => { c.text = norm(c.text); c.state = norm(c.state); c.title = norm(c.title); return c; });
const clickChoice = (needle) => ev(`(() => {
  const b = [...document.querySelectorAll('#choices .qt-choice')].find((x) => x.querySelector('.lbl').textContent.includes(${JSON.stringify(needle)}));
  if (!b || b.disabled) return false; b.click(); return true;
})()`);
const next = async () => { await ev(`document.querySelector('#btn-next').click()`); await sleep(250); };

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Page.navigate', { url: URL });
await sleep(1200);
await ev('localStorage.clear()');
await cdp('Page.reload');
if (!await waitFor(`!!document.querySelector('#choices .qt-choice')`)) {
  console.log('ФАТАЛЬНО: карточка не отрендерилась'); process.exit(2);
}

// 1. Старт
let c = await card();
check('старт: S1 «Посылка»', c.title.includes('S1') && c.title.includes('Посылка'), c.title);
check('старт: 4 варианта', c.choices.length === 4, c.choices.map((x) => x.label).join(' | ').slice(0, 80));
check('старт: 3 вставки-галочки', (await ev(`document.querySelectorAll('.qt-ins-chip input').length`)) === 3);

// 2. Ручная вставка ⚡
await ev(`document.querySelectorAll('.qt-ins-chip input')[0].click()`);
await sleep(150);
c = await card();
check('вставка «Касса тонка» появилась', c.text.includes('счёт за электричество'));
await ev(`document.querySelectorAll('.qt-ins-chip input')[0].click()`);
await sleep(150);
c = await card();
check('вставка убрана', !c.text.includes('счёт за электричество'));

// 3. S1 → S1а
check('клик «Вставить в старый слот»', await clickChoice('Вставить в старый слот'));
await sleep(250);
c = await card();
check('переход в S1а «Семь нот»', c.title.includes('S1а') && c.title.includes('Семь нот'), c.title);
check('S1а: текст про семь нот', c.text.includes('Семь нот') && c.text.includes('ЖДИ'));
check('S1а: флаг «картридж: подсобка»', c.state.includes('картридж: подсобка'));

// 3b. Дерево: узлы-варианты видны и кликабельны
const optCount = await ev(`document.querySelectorAll('.tnode.opt').length`);
check('дерево: видны узлы-варианты', optCount >= 6, 'мелких узлов: ' + optCount);
await ev(`document.querySelector('.tnode[data-id="S1#1"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
await sleep(200);
c = await card();
check('клик по НЕсыгранному варианту — без изменений', c.title.includes('S1а'), c.title);
await ev(`document.querySelector('.tnode[data-id="S1#0"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
await sleep(250);
c = await card();
check('клик по сыгранному варианту → откат к развилке (S1)', c.title.includes('Посылка'), c.title);
check('повторный выбор того же варианта', await clickChoice('Вставить в старый слот'));
await sleep(250);
c = await card();
check('снова S1а', c.title.includes('S1а'));

// 4. S1а: результат-пауза
check('клик «Выложить видео»', await clickChoice('Выложить видео'));
await sleep(200);
c = await card();
check('результат показан, ещё не ушли', c.pending && c.text.includes('К вечеру'));
check('до «Дальше» эффектов нет', !c.state.includes('+2'), c.state.match(/ШУМ[^·]{0,10}/)?.[0] || 'ШУМ ?');
await next(); c = await card();
check('переход в S2 «Блошиный рынок»', c.title.includes('S2') && c.title.includes('Блошиный'), c.title);
check('S2: ШУМ +2, фанаты +1 000', c.state.includes('+2') && c.state.includes('+1 000'));

// 5. S2: заблокированный вариант + покупка
c = await card();
const obmen = c.choices.find((x) => x.label.includes('Обменять'));
check('S2: «Обменять на лимитку» заблокирован (фанатов 1000 < 5000)', obmen && obmen.disabled === true, obmen ? String(obmen.disabled) : 'нет варианта');
check('клик «Купить»', await clickChoice('Купить'));
await next(); c = await card();
check('переход в S3 «Кометадром»', c.title.includes('S3'), c.title);
check('S3: деньги −40 000', c.state.includes('−40 000'), c.state.match(/Деньги[^🏢]*/)?.[0]?.slice(0, 30));
check('S3: артефакт «флаер + коробка»', c.state.includes('флаер + коробка'));

// 6. S3 → интерлюдия (ветка «Пломба»)
check('клик «Пломба»', await clickChoice('Пломба'));
await next(); c = await card();
check('интерлюдия i1', c.title.includes('i1') || c.title.includes('Проходят годы'), c.title);
check('i1: слот «на полке в подсобке» (по ветке S1а)', c.text.includes('на полке в подсобке'));
check('i1: Глеб +1, ШУМ +1 (2−1)', c.state.includes('Глеб +1') && c.state.includes('+1'), 'ok');
await clickChoice('Дальше'); await sleep(250);

// 7. S4: авто-вставка отсутствует, ручные две
c = await card();
check('переход в S4 «Вера»', c.title.includes('S4') && c.title.includes('Вера'), c.title);
check('S4: нет авто-вставки без флага «Каспер в союзниках»', !c.text.includes('Не давите'));
check('S4: две ручные вставки', (await ev(`document.querySelectorAll('.qt-ins-chip input').length`)) === 2);
await ev(`(() => { const l=[...document.querySelectorAll('.qt-ins-chip')].find(x=>x.textContent.includes('ШУМ высокий')); l.querySelector('input').click(); })()`);
await sleep(150);
c = await card();
check('S4: вставка «ШУМ высокий» показана', c.text.includes('шумные дети'));

// 8. S4 → S4b → S5
check('клик «Соврать»', await clickChoice('Соврать'));
await next(); c = await card();
check('переход в S4-шаг2 «Опись без даты»', c.title.includes('Опись'), c.title);
check('S4b: Вера −2', c.state.includes('Вера −2'), c.state.match(/Вера[^|]{0,6}/)?.[0]);
await clickChoice('Дальше'); await sleep(250);
c = await card();
check('переход в S5 «Дневник»', c.title.includes('S5') && c.title.includes('Дневник'), c.title);

// 9. Откат из истории: вернуться к S4 «Вера»
await ev(`(() => { const it=[...document.querySelectorAll('.qt-hist-item')].find(x=>x.textContent.includes('Вера')); it.click(); })()`);
await sleep(250);
c = await card();
check('откат истории → снова S4 «Вера»', c.title.includes('S4') && c.title.includes('Вера'), c.title);
check('откат: Вера снова 0', !c.state.includes('Вера −2'), c.state.match(/Вера[^|]{0,6}/)?.[0]);

// 10. Откат из дерева: клик по S1а
await ev(`document.querySelector('.tnode[data-id="S1a"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
await sleep(250);
c = await card();
check('откат дерева → S1а', c.title.includes('S1а'), c.title);
check('дерево: текущий узел S1a', (await ev(`document.querySelector('.tnode.current')?.dataset.id`)) === 'S1a');
await ev(`document.querySelector('#btn-undo').click()`);
await sleep(250);
c = await card();
check('«↩ Шаг назад» → S1', c.title.includes('S1') && c.title.includes('Посылка'), c.title);

// 11. Числа → сервер
await ev(`(() => { const el=document.querySelector('input[data-k="noise"][data-side="plus"][data-i="0"]'); el.value=5; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await ev(`document.querySelector('#btn-save').click()`);
await sleep(600);
const srv = await (await fetch('http://127.0.0.1:8899/api/settings')).json();
check('сохранение чисел в settings.json (ШУМ +1 → 5)', srv.tiers.noise.plus[0] === 5, 'plus0=' + srv.tiers.noise.plus[0]);
await ev(`(() => { const el=document.querySelector('input[data-k="noise"][data-side="plus"][data-i="0"]'); el.value=1; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await ev(`document.querySelector('#btn-save').click()`);
await sleep(600);
const srv2 = await (await fetch('http://127.0.0.1:8899/api/settings')).json();
check('числа возвращены (ШУМ +1 → 1)', srv2.tiers.noise.plus[0] === 1);

// 12. Заново
await ev(`window.confirm = () => true; document.querySelector('#btn-reset').click()`);
await sleep(300);
c = await card();
const histN = await ev(`document.querySelectorAll('.qt-hist-item').length`);
check('«⟲ Заново»: снова S1, история из 1 шага', c.title.includes('Посылка') && histN === 1, 'шагов: ' + histN);

// 13. Герой и партнёр (11.10.2026)
c = await card();
check('S1: реплика {Героя} в тексте', c.text.includes('Печатными буквами'));

// 13a. вставка по профессии — по умолчанию кодер
check('клик «Вставить в старый слот» (S1а)', await clickChoice('Вставить в старый слот'));
await sleep(250); c = await card();
check('S1а: вставка по профессии «кодер»', c.text.includes('Сорок лет без питания'));

// 13b. переключение профессии на «звукорежиссёр» — карточка обновляется
await ev(`(() => { const s=document.querySelector('select[data-herojob]'); s.value='sound'; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await sleep(150); c = await card();
check('S1а: вставка сменилась на «звукорежиссёр»', c.text.includes('Пауза — тоже нота') && !c.text.includes('Сорок лет без питания'));

// 13c. «Партнёр ушёл» → флаг «без партнёра» с новой партии
await ev(`(() => { const cb=document.querySelector('#set-partner-gone'); if(!cb.checked) cb.click(); })()`);
await ev(`document.querySelector('#btn-save').click()`); await sleep(500);
await ev(`window.confirm=()=>true; document.querySelector('#btn-reset').click()`); await sleep(300);
check('клик «В сейф, тихо» (партнёр ушёл)', await clickChoice('В сейф, тихо'));
await sleep(250); c = await card();
check('S1г: вариант «без партнёра»', c.text.includes('Раньше в таком списке') && !c.text.includes('без обсуждений'));

// 13d. вернуть партнёра — снова вариант «в студии»
await ev(`(() => { const cb=document.querySelector('#set-partner-gone'); if(cb.checked) cb.click(); })()`);
await ev(`document.querySelector('#btn-save').click()`); await sleep(500);
await ev(`window.confirm=()=>true; document.querySelector('#btn-reset').click()`); await sleep(300);
check('клик «В сейф, тихо» (партнёр в студии)', await clickChoice('В сейф, тихо'));
await sleep(250); c = await card();
check('S1г: реплика {Партнёра}', c.text.includes('это бухгалтерия') && !c.text.includes('Раньше в таком списке'));

// 13e. вернуть профессию «кодер» (настройки — как были)
await ev(`(() => { const s=document.querySelector('select[data-herojob]'); s.value='coder'; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
await ev(`document.querySelector('#btn-save').click()`); await sleep(500);
const srv3 = await (await fetch('http://127.0.0.1:8899/api/settings')).json();
check('настройки восстановлены (heroJob=coder, партнёр на месте)', srv3.heroJob === 'coder' && srv3.partnerGone === false);

console.log(`\nИТОГО: ${pass} ok, ${fail} провал(ов)`);
ws.close();
process.exit(fail ? 1 : 0);
