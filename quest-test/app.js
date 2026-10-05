/* QuestTest — логика стенда (сага «Синяя Комета»). Данные: saga.json + /api/settings. */
(() => {
'use strict';

const LS_KEY = 'questtest.v1';
const METRICS = {
  money:      { icon: '💰', short: 'Деньги' },
  trust:      { icon: '🤝', short: 'Доверие' },
  noise:      { icon: '📢', short: 'ШУМ' },
  conscience: { icon: '🧭', short: 'Совесть' },
  biz:        { icon: '🏢', short: 'Бизнес' },
  culture:    { icon: '🎨', short: 'Культура' },
  fans:       { icon: '👥', short: 'Фанаты' },
};
const TRUST_ORDER = ['Вера', 'Глеб', 'Каспер', 'Виталик', 'Жанна', 'Мороз'];
const SET_ROWS = [
  ['money', '💰 Деньги', true],
  ['trust', '🤝 Доверие', false],
  ['noise', '📢 ШУМ', false],
  ['conscience', '🧭 Совесть', false],
  ['biz', '🏢 Бизнес', false],
  ['culture', '🎨 Культура', false],
  ['fans', '👥 Фанаты', false],
];
// 11.10.2026: пол ролей — для родовых пар {муж/жен@роль} в текстах саги (правится в настройках)
const ROLES_DEFAULT = {
  'Скептик': 'M', 'Мечтатель': 'F', 'Технарь': 'M', 'Юрист': 'F',
  'Финдир': 'M', 'Старожил': 'M', 'Герой': 'M', 'Партнёр': 'M',
};

let SAGA = null;
let settings = null;
let steps = [];
let pending = null;
let lastFocus = null;

const $ = (s, r = document) => r.querySelector(s);
const last = () => steps[steps.length - 1];
const live = () => last().state;
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tr = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const node = (id) => SAGA.nodes[id];
const disp = (id) => (node(id) && node(id).disp) || id;

/* ── состояние ── */
function initState() {
  return { money: 0, noise: 0, conscience: 0, biz: 0, culture: 0, fans: 0, trust: {}, flags: [], artifacts: [] };
}
function tierVal(k, v) {
  const t = settings.tiers[k];
  if (!t || !v) return 0;
  const arr = v > 0 ? t.plus : t.minus;
  const i = Math.min(Math.abs(v), arr.length) - 1;
  return (v > 0 ? 1 : -1) * (Number(arr[i]) || 0);
}
function applyEffects(st, effs) {
  for (const e of effs || []) {
    if (e.k === 'flag') { if (!st.flags.includes(e.name)) st.flags.push(e.name); continue; }
    if (e.k === 'artifact') { if (!st.artifacts.includes(e.name)) st.artifacts.push(e.name); continue; }
    if (e.k === 'trust') { st.trust[e.who] = (st.trust[e.who] || 0) + tierVal('trust', e.v); continue; }
    if (METRICS[e.k]) st[e.k] = (st[e.k] || 0) + tierVal(e.k, e.v);
  }
}
function condOk(cond, st) {
  if (!cond) return true;
  if (cond.flag) return st.flags.includes(cond.flag);
  if (cond.notFlag) return !st.flags.includes(cond.notFlag);
  if (cond.notFlags && cond.notFlags.length) return !cond.notFlags.some((f) => st.flags.includes(f));
  if (cond.fansMin) return (st.fans || 0) >= (Number(settings.thr.fansMin) || 0);
  if (cond.heroJob) { const arr = Array.isArray(cond.heroJob) ? cond.heroJob : [cond.heroJob]; return arr.includes((settings && settings.heroJob) || 'coder'); }
  if (cond.moneyMin != null && (st.money || 0) < cond.moneyMin) return false;
  if (cond.moneyMax != null && (st.money || 0) > cond.moneyMax) return false;
  if (cond.noiseMin != null && (st.noise || 0) < cond.noiseMin) return false;
  if (cond.noiseMax != null && (st.noise || 0) > cond.noiseMax) return false;
  if (cond.conscienceMin != null && (st.conscience || 0) < cond.conscienceMin) return false;
  if (cond.conscienceMax != null && (st.conscience || 0) > cond.conscienceMax) return false;
  return true;
}
function applyEnterInto(st, n) {
  applyEffects(st, n.onEnter || []);
  for (const ins of n.inserts || []) {
    if (ins.mode === 'auto' && ins.effects && condOk(ins.when, st)) applyEffects(st, ins.effects);
  }
}
function resolveText(txt, n, st) {
  if (!n.slots) return txt;
  for (const key of Object.keys(n.slots)) {
    if (!txt.includes('{' + key + '}')) continue;
    let val = '…';
    for (const v of n.slots[key]) {
      if (!v.when || condOk(v.when, st)) { val = v.text; break; }
    }
    txt = txt.split('{' + key + '}').join(val);
  }
  return txt;
}
/* ── родовые пары: {муж/жен@роль}; в реплике «{Роль}: «…»» без @ — род говорящего ── */
const PAIR_RE = /\{([^{}\/@]+)\/([^{}@]+?)(?:@([\wА-Яа-яЁё-]+))?\}/g;
function speakerOf(line) {
  const m = /^\s*\{([^{}]+)\}[^:«„]*:\s*[«„]/.exec(String(line));
  return m ? m[1].trim() : null;
}
function gresolve(txt, speaker) {
  const roles = (settings && settings.roles) || {};
  return String(txt).replace(PAIR_RE, (w, a, b, key) => {
    const g = key ? roles[key] : (speaker ? roles[speaker] : null);
    if (g === 'F') return b;
    if (g === 'M') return a;
    return w;
  });
}

/* ── партия ── */
function newGame() {
  const st = initState();
  if (settings && settings.partnerGone && !st.flags.includes('без партнёра')) st.flags.push('без партнёра');
  const start = SAGA.start;
  applyEnterInto(st, node(start));
  steps = [{ node: start, state: st, via: null, ins: {} }];
  pending = null;
  save();
}
function restore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.steps) && data.steps.length &&
          data.steps.every((s) => node(s.node))) {
        steps = data.steps;
        pending = null;
        return true;
      }
    }
  } catch { /* ignore */ }
  return false;
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, steps })); } catch { /* ignore */ }
}
function rollbackTo(i) {
  if (i < 0 || i >= steps.length) return;
  steps = steps.slice(0, i + 1);
  pending = null;
  save();
  lastFocus = null;
  renderAll();
}
function choose(ch, ci) {
  if (pending || !ch) return;
  if (!condOk(ch.cond, live())) return;
  if (ch.result) { pending = { ch, ci }; renderCard(); renderTree(); }
  else advance(ch, ci);
}
function advance(ch, ci) {
  const prev = last().node;
  const ns = clone(live());
  applyEffects(ns, ch.effects || []);
  const n = node(ch.to);
  if (!n) { alert('Нет узла ' + ch.to); return; }
  applyEnterInto(ns, n);
  steps.push({ node: ch.to, state: ns, via: ch.label, viaC: ci, viaFrom: prev, ins: {} });
  pending = null;
  save();
  renderAll();
}

/* ── чипы ── */
function effChip(e) {
  if (e.k === 'flag') return `<span class="chip flag" title="Флаг">⚑ ${esc(e.name)}</span>`;
  if (e.k === 'artifact') return `<span class="chip art" title="Артефакт">◈ ${esc(e.name)}</span>`;
  const m = METRICS[e.k];
  const tier = (e.v > 0 ? '+' : '−').repeat(Math.abs(e.v));
  const cls = e.v > 0 ? 'pos' : 'neg';
  const name = e.k === 'trust' ? (m.icon + ' ' + esc(e.who)) : (m.icon + ' ' + m.short);
  let html = `<span class="chip ${cls}" title="${esc(m.short)}">${name} ${tier}</span>`;
  if (e.note) html += ` <span class="chip note">${esc(e.note)}</span>`;
  return html;
}
function condLabel(ch) {
  if (!ch.cond) return '';
  if (ch.cond.flag) return 'нужен флаг: ' + ch.cond.flag;
  if (ch.cond.fansMin) return 'нужно фанатов ≥ ' + (Number(settings.thr.fansMin) || 0);
  return 'условие не выполнено';
}

/* ── жетоны лиц саги (LLMPics: gds-comet-faces → public/quests/face-*.png) ── */
const FACES_META = {
  'face-vera': ['📚', 'Вера Штерн · библиотекарь'],
  'face-kasper': ['🏺', 'Каспер · цифровой археолог'],
  'face-gleb': ['🧥', 'Глеб · коллекционер'],
  'face-vitalik': ['🧸', 'Виталик · барахольщик'],
  'face-moroz': ['☕', 'Мороз · последний из «Полюса»'],
  'face-zhanna': ['🎬', 'Жанна · документалистка'],
  'face-anna': ['🎹', 'Анна Каверина · «К.»'],
  'face-rostotsky': ['🦈', 'Виктор Ростоцкий · «Пиксель Холдинг»'],
  'face-arkady': ['📼', 'Аркадий Штерн · 1983'],
};
const faceMeta = (f) => FACES_META[f] || ['🎭', f];

/* ── карточка хода ── */
function renderCard() {
  const id = last().node;
  const n = node(id);
  const st = live();
  const stub = !!n.stub;
  let h = '';
  h += `<div class="qt-win">`;
  h += `<div class="qt-titlebar${stub ? ' stub' : ''}"><span>${esc(n.emoji || '🎬')} ${esc(disp(id))} · «${esc(gresolve(n.title, null))}»</span>`;
  h += `<span class="sp">Акт ${esc(n.act || '—')}${stub ? ' · заглушка' : ''}${pending ? ' · результат' : ''}</span></div>`;
  h += `<div class="qt-card-body">`;

  h += `<div class="qt-banner" id="banner" style="background: linear-gradient(135deg, ${n.accent || '#334'}, #14141c)">`;
  if (n.art) h += `<img src="/quests/${esc(n.art)}.png" alt="" onerror="this.parentNode.classList.add('noart'); this.remove();">`;
  if (n.face) { const fm = faceMeta(n.face); h += `<div class="qt-face" data-face="${esc(n.face)}" title="${esc(fm[1])}"><span class="fem">${fm[0]}</span><img src="/quests/${esc(n.face)}.png" alt="" onerror="this.remove()"></div>`; }
  h += `<div class="fallback"><div class="em">${esc(n.emoji || '🖼')}</div><div class="key">${esc(n.art || '—')} · арт ещё не сгенерирован</div></div>`;
  h += `</div>`;
  h += `<div class="qt-accent" style="background:${esc(n.accent || '#666')}"></div>`;

  if (stub) h += `<div class="qt-stub-note">🚧 Заглушка: структура главы есть, полный текст ещё не загружен в стенд (см. <b>plan/47_Сага/</b>).</div>`;

  const autoIns = [];
  const manIns = [];
  (n.inserts || []).forEach((ins, i) => {
    if (ins.mode === 'auto') { if (condOk(ins.when, st)) autoIns.push(ins); }
    else manIns.push({ ins, i, on: !!last().ins[i] });
  });

  h += `<div class="qt-text" id="textbox">`;
  for (const t of (n.text || [])) h += `<p>${esc(gresolve(resolveText(t, n, st), speakerOf(t)))}</p>`;
  for (const ins of autoIns) h += `<p class="ins-auto">${esc(gresolve(ins.text, speakerOf(ins.text)))}</p>`;
  for (const mi of manIns) if (mi.on) h += `<p class="ins-man">${esc(gresolve(mi.ins.text, speakerOf(mi.ins.text)))}</p>`;
  h += `</div>`;

  if (manIns.length) {
    h += `<div class="qt-inserts"><span>Вставки:</span>`;
    for (const mi of manIns) {
      h += `<label class="qt-ins-chip"><input type="checkbox" data-ins="${mi.i}" ${mi.on ? 'checked' : ''}> ${esc(gresolve(mi.ins.label, null))}</label>`;
    }
    h += `</div>`;
  }

  if (pending) {
    const ch = pending.ch;
    h += `<div class="qt-result"><div class="hdr">После выбора: ${esc(gresolve(ch.label, null))}</div>`;
    h += `<div>${esc(gresolve(ch.result, null))}</div>`;
    if (ch.effects && ch.effects.length) h += `<div class="chips" style="display:flex;flex-wrap:wrap;gap:3px;margin-top:6px">${ch.effects.map(effChip).join(' ')}</div>`;
    h += `<div class="qt-result-actions"><button class="w95-btn" id="btn-next">Дальше →</button></div></div>`;
  } else {
    h += `<div class="qt-choices" id="choices">`;
    (n.choices || []).forEach((ch, ci) => {
      const ok = condOk(ch.cond, st);
      h += `<button class="w95-btn qt-choice" data-ci="${ci}" ${ok ? '' : 'disabled'} title="${ok ? '' : esc(condLabel(ch))}">`;
      h += `<span class="lbl">${ci + 1}. ${esc(gresolve(ch.label, null))}${!ok ? ` <span class="req">(${esc(condLabel(ch))})</span>` : ''}</span>`;
      if (ch.effects && ch.effects.length) h += `<span class="chips">${ch.effects.map(effChip).join(' ')}</span>`;
      h += `</button>`;
    });
    h += `</div>`;
  }
  h += `</div></div>`;
  $('#card').innerHTML = h;

  const chBox = $('#choices');
  if (chBox) chBox.addEventListener('click', (e) => {
    const btn = e.target.closest('.qt-choice');
    if (!btn || btn.disabled) return;
    const ci = Number(btn.dataset.ci);
    choose(node(last().node).choices[ci], ci);
  });
  const nb = $('#btn-next');
  if (nb) nb.addEventListener('click', () => { if (pending) advance(pending.ch, pending.ci); });
  document.querySelectorAll('#card [data-ins]').forEach((cb) => cb.addEventListener('change', () => {
    last().ins[Number(cb.dataset.ins)] = cb.checked;
    save(); renderCard();
  }));
  applyBanner();
}
function applyBanner() {
  const img = $('#banner img');
  if (!img) { const b = $('#banner'); if (b) b.classList.add('noart'); }
}

/* ── панель состояния ── */
function fmtMoney(v) {
  const cur = settings.currency || '';
  const s = Math.abs(v).toLocaleString('ru-RU');
  if (!v) return '0 ' + cur;
  return (v > 0 ? '+' : '−') + s + ' ' + cur;
}
function fmtNum(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ru-RU'); }
function renderState() {
  const st = live();
  let h = '';
  h += `<div class="mrow"><span>💰 Деньги</span><span class="big">${fmtMoney(st.money)}</span></div>`;
  h += `<div class="mrow"><span>📢 ШУМ</span><span class="big">${fmtNum(st.noise)}</span></div>`;
  h += `<div class="mrow"><span>🧭 Совесть</span><span>${fmtNum(st.conscience)}</span></div>`;
  h += `<div class="mrow"><span>👥 Фанаты</span><span>${fmtNum(st.fans)}</span></div>`;
  h += `<div class="mrow"><span>🏢 Бизнес / 🎨 Культура</span><span>${fmtNum(st.biz)} / ${fmtNum(st.culture)}</span></div>`;
  h += `<div class="sec">🤝 Доверие</div><div class="qt-trust">`;
  const names = [...new Set([...TRUST_ORDER, ...Object.keys(st.trust)])];
  for (const nm of names) {
    const v = st.trust[nm] || 0;
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
    h += `<span class="chip ${cls}">${esc(nm)} ${v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0'}</span>`;
  }
  h += `</div>`;
  h += `<div class="sec">⚑ Флаги (${st.flags.length})</div><div class="qt-flags">`;
  h += st.flags.length ? st.flags.map((f) => `<span class="chip flag">${esc(f)}</span>`).join(' ') : `<span class="chip note">пока пусто</span>`;
  h += `</div>`;
  h += `<div class="sec">◈ Артефакты (${st.artifacts.length})</div><div class="qt-flags">`;
  h += st.artifacts.length ? st.artifacts.map((a) => `<span class="chip art">${esc(a)}</span>`).join(' ') : `<span class="chip note">пока пусто</span>`;
  h += `</div>`;
  $('#state-panel').innerHTML = h;
}

/* ── история ── */
function renderHistory() {
  let h = `<div class="qt-hist">`;
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    const curt = i === steps.length - 1 ? ' current' : '';
    h += `<div class="qt-hist-item${curt}" data-i="${i}" title="Откатиться к этому шагу">`;
    h += `<span class="idx">${i + 1}.</span><span>${esc(disp(s.node))} ${esc(tr(node(s.node).title, 24))}</span>`;
    h += `<span class="via">${s.via ? '← ' + esc(tr(s.via, 28)) : '(старт)'}</span>`;
    h += `</div>`;
  }
  h += `</div>`;
  const p = $('#history-panel');
  p.innerHTML = h;
  p.querySelectorAll('.qt-hist-item').forEach((d) => d.addEventListener('click', () => rollbackTo(Number(d.dataset.i))));
}

/* ── настройки чисел ── */
function renderSettings() {
  let h = `<table class="qt-set-table"><tr><th></th><th>+</th><th>++</th><th>+++</th><th>−</th><th>−−</th><th>−−−</th></tr>`;
  for (const [k, label, big] of SET_ROWS) {
    const t = settings.tiers[k];
    h += `<tr><td class="nm">${label}</td>`;
    for (let i = 0; i < 3; i++) h += `<td><input type="number" class="${big ? 'big' : ''}" data-k="${k}" data-side="plus" data-i="${i}" value="${t.plus[i]}"></td>`;
    for (let i = 0; i < 3; i++) h += `<td><input type="number" class="${big ? 'big' : ''}" data-k="${k}" data-side="minus" data-i="${i}" value="${t.minus[i]}"></td>`;
    h += `</tr>`;
  }
  h += `</table>`;
  h += `<div class="qt-set-thr">👥 Порог «фанатов ≥» для выбора: <input type="number" id="thr-fans" value="${settings.thr.fansMin}"></div>`;
  h += `<div class="sec">🎭 Пол ролей</div><div class="qt-set-roles">`;
  for (const r of Object.keys(ROLES_DEFAULT)) {
    const v = (settings.roles && settings.roles[r]) || ROLES_DEFAULT[r];
    h += `<label class="qt-role"><span>${esc(r)}</span><select data-role="${esc(r)}">` +
      `<option value="M"${v === 'M' ? ' selected' : ''}>м</option>` +
      `<option value="F"${v === 'F' ? ' selected' : ''}>ж</option></select></label>`;
  }
  h += `</div>`;
  h += `<div class="sec">🧑 Герой и партнёр</div><div class="qt-set-roles">` +
    `<label class="qt-role"><span>Профессия героя</span><select data-herojob="1">` +
    [['coder', 'кодер'], ['writer', 'сценарист'], ['designer', 'художник'], ['sound', 'звукорежиссёр']]
      .map(([v, l]) => `<option value="${v}"${(settings.heroJob || 'coder') === v ? ' selected' : ''}>${l}</option>`).join('') +
    `</select></label>` +
    `<label class="qt-role"><span>Партнёр</span><input type="checkbox" id="set-partner-gone"${settings.partnerGone ? ' checked' : ''}> ушёл из студии</label>` +
    `</div>`;
  h += `<div class="qt-set-note">Числа — единицы тиров (±/±±/±±±); симметрично для наград и штрафов. Пол ролей — для родовых пар {…/…} в текстах (м/ж). Профессия героя — условные вставки по профессии (heroJob). «Партнёр ушёл» — варианты текстов „без партнёра“ (действует с новой партии). «💾 Сохранить числа» пишет settings.json; применятся к новым ходам.</div>`;
  const p = $('#settings-panel');
  p.innerHTML = h;
  p.oninput = onSettingsInput;
}
function onSettingsInput(e) {
  const t = e.target;
  if (t.dataset && t.dataset.k) {
    settings.tiers[t.dataset.k][t.dataset.side][Number(t.dataset.i)] = Number(t.value) || 0;
    renderCard();
  } else if (t.id === 'thr-fans') {
    settings.thr.fansMin = Number(t.value) || 0;
    renderCard();
  } else if (t.dataset && t.dataset.role) {
    settings.roles[t.dataset.role] = t.value === 'F' ? 'F' : 'M';
    renderCard();
  } else if (t.dataset && t.dataset.herojob) {
    settings.heroJob = t.value;
    renderCard();
  } else if (t.id === 'set-partner-gone') {
    settings.partnerGone = t.checked;
  }
}
async function saveSettings() {
  const st = $('#save-status');
  try {
    const r = await fetch('/api/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    st.textContent = '✓ сохранено';
    st.style.color = '#060';
    setTimeout(() => { st.textContent = ''; }, 2500);
  } catch (e) {
    st.textContent = '✗ ' + e.message;
    st.style.color = '#a00';
  }
}

/* ── дерево ── */
let treeWired = false;

// текстовое описание эффекта для тултипов дерева
function effText(e) {
  if (e.k === 'flag') return 'флаг: ' + e.name;
  if (e.k === 'artifact') return 'артефакт: ' + e.name;
  const m = METRICS[e.k];
  const tier = (e.v > 0 ? '+' : '−').repeat(Math.abs(e.v));
  return (e.k === 'trust' ? 'доверие ' + e.who : m.short) + ' ' + tier;
}

function renderTree() {
  const ids = Object.keys(SAGA.nodes);

  // Узлы дерева: главы + узлы-варианты (у каждой развилки ≥2 исходов — свой маленький узел).
  const incoming = {};
  const edges = [];
  const addEdge = (from, to, kind) => {
    edges.push({ from, to, kind });
    (incoming[to] = incoming[to] || []).push(from);
  };
  const T = {};
  for (const id of ids) {
    const n = node(id);
    T[id] = { kind: 'ch', w: 158, h: 44 };
    const chs = n.choices || [];
    chs.forEach((ch, ci) => {
      if (chs.length >= 2) {
        const oid = id + '#' + ci;
        T[oid] = { kind: 'opt', w: 136, h: 26, src: id, ci, ch };
        addEdge(id, oid, 'opt');
        addEdge(oid, ch.to, 'opt');
      } else {
        addEdge(id, ch.to, 'direct');
      }
    });
  }

  const memo = {};
  const depthOf = (id) => {
    if (memo[id] != null) return memo[id];
    memo[id] = 0;
    let d = 0;
    for (const p of incoming[id] || []) d = Math.max(d, depthOf(p) + 1);
    return (memo[id] = d);
  };
  const byDepth = {};
  for (const id of Object.keys(T)) {
    const d = depthOf(id);
    (byDepth[d] = byDepth[d] || []).push(id);
  }
  const pos = {};
  let x = 10, maxY = 0;
  for (const d of Object.keys(byDepth).map(Number).sort((a, b) => a - b)) {
    let w = 60;
    for (const id of byDepth[d]) w = Math.max(w, T[id].w);
    let y = 8;
    for (const id of byDepth[d]) {
      pos[id] = { x, y, w: T[id].w, h: T[id].h };
      y += T[id].h + 8;
      maxY = Math.max(maxY, y);
    }
    x += w + 12;
  }

  // текущий путь: пройденные варианты и «горячие» рёбра
  const visited = new Set(steps.map((s) => s.node));
  const cur = last().node;
  const takenOpts = new Set();
  const hot = new Set();
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1].node, v = steps[i];
    let oid = null;
    if (v.viaFrom === from && v.viaC != null && T[from + '#' + v.viaC]) oid = from + '#' + v.viaC;
    else {
      const chs = node(from).choices || [];
      if (chs.length >= 2 && v.via != null) {
        let ci = chs.findIndex((c) => c.label === v.via && c.to === v.node);
        if (ci < 0) ci = chs.findIndex((c) => c.label === v.via);
        if (ci >= 0) oid = from + '#' + ci;
      }
    }
    if (oid) { takenOpts.add(oid); hot.add(from + '→' + oid); hot.add(oid + '→' + v.node); }
    else hot.add(from + '→' + v.node);
  }

  let svg = '';
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    const cls = 'tedge' + (e.kind === 'opt' ? ' topt' : '') + (hot.has(e.from + '→' + e.to) ? ' hot' : '');
    svg += `<path class="${cls}" d="M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}"></path>`;
  }

  const liveSt = live();
  for (const id of Object.keys(T)) {
    const t = T[id], p = pos[id];
    if (t.kind === 'opt') {
      const cls = ['tnode', 'opt'];
      if (takenOpts.has(id)) cls.push('visited');
      else if (!condOk(t.ch.cond, liveSt)) cls.push('blocked');
      const effs = (t.ch.effects || []).map(effText).join('; ');
      const status = takenOpts.has(id) ? 'пройдено — клик: откат к развилке'
        : condOk(t.ch.cond, liveSt) ? 'ещё не выбрано' : 'недоступно (условие)';
      const tip = 'Вариант: ' + t.ch.label + (effs ? ' · ' + effs : '') +
        (t.ch.result ? ' · с текстом-результатом' : '') + ' — ' + status;
      svg += `<g class="${cls.join(' ')}" data-id="${esc(id)}">`;
      svg += `<rect class="box" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.h / 2}"></rect>`;
      svg += `<text class="t1" x="${p.x + 10}" y="${p.y + p.h / 2 + 3.5}">${esc(tr(t.ch.label, 20))}</text>`;
      svg += `<rect class="hit" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"><title>${esc(tip)}</title></rect>`;
      svg += `</g>`;
      continue;
    }
    const n = node(id);
    const cls = ['tnode'];
    if (n.stub) cls.push('stub');
    if (visited.has(id)) cls.push('visited');
    if (id === cur) cls.push('current');
    const tip = id + ' · ' + n.title + (n.stub ? ' (заглушка)' : '') +
      (id === cur ? ' — вы здесь' : visited.has(id) ? ' — клик: откат сюда' : ' — ещё не пройдено');
    svg += `<g class="${cls.join(' ')}" data-id="${esc(id)}">`;
    svg += `<rect class="box" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3"></rect>`;
    svg += `<text class="t1" x="${p.x + 8}" y="${p.y + 16}">${esc(disp(id))}${n.stub ? ' 💤' : ''}</text>`;
    svg += `<text class="t2" x="${p.x + 8}" y="${p.y + 31}">${esc(tr(n.title, 25))}</text>`;
    svg += `<rect class="hit" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"><title>${esc(tip)}</title></rect>`;
    svg += `</g>`;
  }

  const svgEl = $('#tree');
  svgEl.setAttribute('width', x + 10);
  svgEl.setAttribute('height', maxY + 12);
  svgEl.innerHTML = svg;

  if (!treeWired) {
    treeWired = true;
    svgEl.addEventListener('click', (e) => {
      const g = e.target.closest('.tnode');
      if (!g) return;
      const id = g.dataset.id;
      if (id.includes('#')) {
        // узел-вариант: если он был сыгран — откат к его развилке
        const [src, ciS] = id.split('#');
        const ci = Number(ciS);
        let found = -1;
        for (let i = steps.length - 1; i >= 1; i--) {
          const v = steps[i];
          if (v.viaFrom === src && v.viaC === ci) { found = i; break; }
          if (v.viaFrom == null && steps[i - 1].node === src) {
            const chs = node(src).choices || [];
            if (chs[ci] && v.via === chs[ci].label) { found = i; break; }
          }
        }
        if (found > 0) rollbackTo(found - 1);
        return;
      }
      let idx = -1;
      for (let i = steps.length - 1; i >= 0; i--) if (steps[i].node === id) { idx = i; break; }
      if (idx >= 0 && idx < steps.length - 1) rollbackTo(idx);
    });
  }
  if (lastFocus !== cur) {
    lastFocus = cur;
    const p = pos[cur];
    const sc = $('#tree-scroll');
    if (p && sc) requestAnimationFrame(() => {
      sc.scrollLeft = Math.max(0, p.x - (sc.clientWidth - p.w) / 2);
      sc.scrollTop = Math.max(0, p.y - (sc.clientHeight - p.h) / 2);
    });
  }
}

/* ── общий рендер ── */
function renderAll() {
  renderCard();
  renderState();
  renderHistory();
  renderTree();
}

/* ── запуск ── */
async function boot() {
  try {
    const [sagaRes, setRes] = await Promise.all([fetch('./saga.json'), fetch('/api/settings')]);
    if (!sagaRes.ok) throw new Error('saga.json: HTTP ' + sagaRes.status);
    SAGA = await sagaRes.json();
    if (!setRes.ok) throw new Error('settings.json: HTTP ' + setRes.status);
    settings = await setRes.json();
    settings.roles = Object.assign({}, ROLES_DEFAULT, settings.roles || {});
    settings.heroJob = settings.heroJob || 'coder';
    settings.partnerGone = !!settings.partnerGone;
    if (!restore()) newGame();
    renderSettings();
    renderAll();
    lastFocus = null;
    renderTree();
  } catch (e) {
    $('#card').innerHTML = `<div class="qt-loading" style="color:#a00">Ошибка загрузки: ${esc(e.message)}<br><br>Проверь, что сервер запущен: <b>node server.mjs</b> (порт 8899).</div>`;
  }
}

$('#btn-undo').addEventListener('click', () => {
  if (pending) { pending = null; renderCard(); renderTree(); return; }
  if (steps.length > 1) rollbackTo(steps.length - 2);
});
$('#btn-reset').addEventListener('click', () => {
  if (confirm('Сбросить прохождение и начать заново?')) { newGame(); renderAll(); lastFocus = null; renderTree(); }
});
$('#btn-save').addEventListener('click', saveSettings);

boot();
})();
