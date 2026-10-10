// PLAN-49 (Э1–Э2): сага «Синяя Комета» — движок: старт после первого релиза, роли из штата (замена
// при увольнении), выборы (ручные и автопилот), эффекты (флаги, деньги/фанаты по тирам, доверие,
// скрытые шкалы), резолв текста ({Роль} → имя, родовые пары), пейсер 180–230 дней, авто-эпилог
// по флагам (правила 1–7) и миграция v15.
import { expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { CONFIG } from '../src/core/config';
import { migrateSave, SAVE_VERSION } from '../src/core/migrate';
import { resolveSaga, sagaApplyEffects, sagaCondOk, sagaEpilogFor, sagaResolveParagraph, tickSaga } from '../src/core/systems/saga';
import { SAGA_NODES } from '../src/shared/saga-data';
import { sagaResolveText } from '../src/shared/saga-text';
import type { GameRecord, GameState } from '../src/core/types';

function withRelease(seed = 3, releases = 1): GameState {
  const g = newGame(seed);
  for (let i = 0; i < releases; i++) g.history.push({} as GameRecord);
  return g;
}

it('свежая студия без релизов: сага молчит', () => {
  const g = newGame(3);
  tickSaga(g);
  expect(g.saga).toBeUndefined();
  expect(g.pendingEvent).toBeNull();
});

it('после первого релиза сага стартует: S1, попап-глава, роли закреплены', () => {
  const g = withRelease();
  tickSaga(g);
  expect(g.saga).toBeDefined();
  expect(g.saga!.node).toBe('S1');
  expect(g.saga!.stage).toBe('choice');
  expect(g.pendingEvent).toMatchObject({ type: 'saga', node: 'S1', stage: 'choice' });
  // роли штата: все кандидаты (не ГГ) разобраны, максимум 5 ролей
  const cands = g.staff.filter((s) => !s.hero);
  const assigned = Object.entries(g.saga!.roles).filter(([r]) => r !== 'Партнёр');
  expect(assigned.length).toBe(Math.min(5, cands.length));
  for (const [, ref] of assigned) {
    expect(g.staff.some((s) => s.id === ref.staffId)).toBe(true);
    expect(ref.name).toBe(g.staff.find((s) => s.id === ref.staffId)!.name);
  }
});

it('попап главы восстанавливается, если потерялся (загрузка сейва)', () => {
  const g = withRelease();
  tickSaga(g);
  g.pendingEvent = null; // как после загрузки сейва мид-главы
  tickSaga(g);
  expect(g.pendingEvent).toMatchObject({ type: 'saga', node: 'S1' });
});

it('выбор ведёт по узлам среза; флаги входа и эффекты после «Дальше»', () => {
  const g = withRelease();
  const fans0 = g.fans;
  tickSaga(g);
  // «Вставить в старый слот» → S1а: эффекты входа (флаги) применяются сразу
  expect(resolveSaga(g, '0').ok).toBe(true);
  expect(g.saga!.node).toBe('S1a');
  expect(g.saga!.flags).toContain('у студии есть список-карта');
  expect(g.saga!.flags).toContain('картридж: подсобка');
  expect(g.saga!.stage).toBe('choice');
  // «Выложить видео»: выбран вариант, показываем результат — эффекты ещё не применены
  expect(resolveSaga(g, '0').ok).toBe(true);
  expect(g.saga!.stage).toBe('result');
  expect(g.saga!.chosen).toBe(0);
  expect(g.pendingEvent).toMatchObject({ type: 'saga', node: 'S1a', stage: 'result' });
  expect(g.fans).toBe(fans0);
  // «Дальше»: эффекты (noise +2, fans +1 тир) и переход к S2
  expect(resolveSaga(g, '').ok).toBe(true);
  expect(g.saga!.node).toBe('S2');
  expect(g.saga!.scales['noise']).toBe(2);
  expect(g.fans).toBe(fans0 + CONFIG.SAGA.FANS.plus[0]!);
  // пейсер: S2 — крупная глава: попап «спит» до своей недели
  expect(g.pendingEvent).toBeNull();
  expect(g.saga!.holdUntil).toBeDefined();
});

it('полная сага: автопилот с прокруткой недель проходит до эпилога', () => {
  const g = withRelease();
  let guard = 0;
  while (g.saga?.stage !== 'done' && guard++ < 4000) {
    g.week += 7; // крутим время: главы ждут по 180–230 дней (пейсер)
    tickSaga(g);
    let inner = 0;
    while (g.pendingEvent?.type === 'saga' && inner++ < 40) {
      const r = resolveSaga(g, '');
      expect(r.ok).toBe(true);
    }
  }
  expect(g.saga!.stage).toBe('done');
  expect(g.saga!.node).toMatch(/^E[1-6]$/); // дошли до эпилога (авто по флагам)
  expect(g.pendingEvent).toBeNull();
});

it('пейсер: крупные главы ждут 180–230 дней, под-узлы идут сразу', () => {
  const g = withRelease();
  tickSaga(g); // S1 — старт без паузы
  expect(g.saga!.holdUntil).toBeUndefined();
  expect(resolveSaga(g, '0').ok).toBe(true); // → S1a (под-узел, без паузы)
  expect(g.saga!.node).toBe('S1a');
  expect(g.saga!.holdUntil).toBeUndefined();
  expect(resolveSaga(g, '0').ok).toBe(true); // итог варианта
  expect(g.saga!.stage).toBe('result');
  expect(resolveSaga(g, '').ok).toBe(true); // «Дальше» → S2 (крупная глава): пауза
  expect(g.saga!.node).toBe('S2');
  const hold = g.saga!.holdUntil;
  expect(hold).toBeDefined();
  expect((hold ?? 0) - g.week).toBeGreaterThanOrEqual(180); // дни
  expect((hold ?? 0) - g.week).toBeLessThanOrEqual(230);
  expect(g.pendingEvent).toBeNull(); // попапа нет — глава «спит»
  g.week = hold!; // время пришло — попап появляется сам
  tickSaga(g);
  expect(g.pendingEvent).toMatchObject({ type: 'saga', node: 'S2' });
});

it('ритм Э3: акты встают на канонные годы (0/6/12/17/22/26)', () => {
  const g = withRelease();
  const seen: Record<string, number> = {};
  let guard = 0;
  while (g.saga?.stage !== 'done' && guard++ < 4000) {
    g.week += 7;
    tickSaga(g);
    const cur = g.saga?.node;
    if (cur && !(cur in seen) && (g.pendingEvent?.type === 'saga' || g.saga?.stage === 'final')) seen[cur] = g.week;
    let inner = 0;
    while (g.pendingEvent?.type === 'saga' && inner++ < 40) {
      const r = resolveSaga(g, '');
      if (!r.ok) break;
    }
  }
  const yr = (id: string) => Math.round((seen[id]! / 365) * 2) / 2;
  expect(yr('S4')).toBe(6);
  expect(yr('S8')).toBe(12);
  expect(yr('S13')).toBe(17);
  expect(yr('S18')).toBe(22);
  expect(yr('S22')).toBe(26);
  expect(g.saga!.stage).toBe('done');
});

it('числа Э3: {≈эпоха}/{≈прошло}/{≈далее} берутся из состояния саги', () => {
  const g = withRelease();
  tickSaga(g);
  g.saga!.startWeek = g.week - 365 * 7; // саге 7 лет
  g.saga!.lastGap = 365 * 4 + 100; // пауза ≈4 года
  const out = sagaResolveParagraph(g, 'Проходит {≈прошло}. Коробке {≈эпоха}.');
  expect(out).toContain('4 года');
  expect(out).toContain('47 лет');
  const next = sagaResolveParagraph(g, 'Через {≈далее} — пожар.', SAGA_NODES['S19']);
  expect(next).toMatch(/^Через \d+ дней — пожар\.$/);
});

it('тексты: имя Ильи из тетради получает эхо в S17', () => {
  const s5 = JSON.stringify(SAGA_NODES['S5'] ?? {});
  const s17 = JSON.stringify(SAGA_NODES['S17'] ?? {});
  const s19 = JSON.stringify(SAGA_NODES['S19'] ?? {});
  expect(s5).toContain('Илью');
  expect(s17).toContain('Илья');
  expect(s19).toContain('Мороз'); // дальше имя держится: Мороз за столом
});

it('тексты: флаги акта V «война бумаг» и «раскол» имеют отдачу в S22', () => {
  const ins22 = JSON.stringify(SAGA_NODES['S22']?.inserts ?? []);
  expect(ins22).toContain('война бумаг');
  expect(ins22).toContain('раскол');
});

it('роли: увольнение сотрудника — роль переходит живому', () => {
  const g = withRelease();
  tickSaga(g);
  const first = g.saga!.roles['Скептик'];
  expect(first).toBeDefined();
  if (!first) throw new Error('роль «Скептик» не назначена');
  // запасной (клон) и «увольнение» текущего Скептика
  const fired = g.staff.find((s) => s.id === first.staffId)!;
  g.staff.push({ ...fired, id: 'test-extra', name: 'Запасной' });
  g.staff = g.staff.filter((s) => s.id !== first.staffId);
  tickSaga(g);
  const next = g.saga!.roles['Скептик'];
  if (!next) throw new Error('роль «Скептик» не переназначена');
  expect(next.staffId).not.toBe(first.staffId);
  expect(g.staff.some((s) => s.id === next.staffId)).toBe(true);
});

it('роли: партнёр тоже может получить роль штата (малая студия)', () => {
  const g = withRelease();
  g.staff[0]!.partnerPct = 10; // как у соучредителя
  tickSaga(g);
  const cands = g.staff.filter((s) => !s.hero);
  const assigned = Object.entries(g.saga!.roles).filter(([r]) => r !== 'Партнёр');
  expect(assigned.length).toBe(Math.min(5, cands.length));
  const ids = assigned.map(([, ref]) => ref.staffId);
  for (const c of cands) expect(ids).toContain(c.id);
});

it('резолв текста: {Роль} → имя сотрудника, родовые пары по роли говорящего', () => {
  const g = withRelease();
  tickSaga(g);
  const skeptic = g.saga!.roles['Скептик']!.name;
  const out = sagaResolveParagraph(g, '{Скептик}: „Это или любовь, или бомба.“');
  expect(out.startsWith(skeptic)).toBe(true);
  expect(out).not.toContain('{');
  const tech = g.saga!.roles['Технарь'];
  if (tech) {
    const res = sagaResolveParagraph(
      g,
      '«Пока пуст», — говорит {Технарь}, и {сам/сама@Технарь} не понимает, почему так {сказал/сказала@Технарь}.',
    );
    expect(res).toContain(tech.name);
    expect(res).toContain(tech.gender === 'F' ? 'сама' : 'сам');
    expect(res).toContain(tech.gender === 'F' ? 'сказала' : 'сказал');
  }
  // v1.54.1: НЕзанятая роль (в партии юзера Технарь пустовал) — не сырой шаблон: «Сотрудник… сам»
  const g2 = withRelease();
  tickSaga(g2);
  g2.saga!.roles = {};
  const res2 = sagaResolveParagraph(g2, '«Пока пуст», — говорит {Технарь}, и {сам/сама@Технарь} не понимает.');
  expect(res2).toContain('Сотрудник');
  expect(res2).toContain('сам не понимает');
  expect(res2).not.toContain('{');
  // род говорящего без @: «{Мечтатель} (почти шёпотом): „…{сам/сама}…“»
  const dream = g.saga!.roles['Мечтатель'];
  if (dream) {
    const line = sagaResolveParagraph(g, '{Мечтатель} (почти шёпотом): „{сам/сама} слышит.“');
    expect(line).toContain(dream.gender === 'F' ? 'сама слышит' : 'сам слышит');
  }
});

it('титул S23: строка «В титрах» появляется в эпилоге по флагу', () => {
  const g = withRelease();
  tickSaga(g);
  const e1 = SAGA_NODES['E1']!;
  const line = e1.text[e1.text.length - 1]!;
  g.saga!.flags = g.saga!.flags.filter((f) => !f.startsWith('титул —'));
  expect(sagaResolveParagraph(g, line, e1).trim()).toBe('');
  g.saga!.flags.push('титул — все');
  const out = sagaResolveParagraph(g, line, e1);
  expect(out).toContain('В титрах');
  expect(out).not.toContain('{');
});

it('условие fansMin сверяется с фанатами студии', () => {
  const g = withRelease();
  tickSaga(g);
  g.fans = CONFIG.SAGA.FANS_MIN - 1;
  expect(sagaCondOk(g, { fansMin: true })).toBe(false);
  g.fans = CONFIG.SAGA.FANS_MIN;
  expect(sagaCondOk(g, { fansMin: true })).toBe(true);
});

it('условия по окружению: касса (деньги), ШУМ и СОВЕСТЬ', () => {
  const g = withRelease();
  tickSaga(g);
  // касса: тонка — moneyMax, полна — moneyMin
  g.money = 100;
  expect(sagaCondOk(g, { moneyMax: 150 })).toBe(true);
  expect(sagaCondOk(g, { moneyMin: 500 })).toBe(false);
  g.money = 600;
  expect(sagaCondOk(g, { moneyMin: 500 })).toBe(true);
  expect(sagaCondOk(g, { moneyMax: 150 })).toBe(false);
  // ШУМ
  g.saga!.scales.noise = 2;
  expect(sagaCondOk(g, { noiseMin: 2 })).toBe(true);
  expect(sagaCondOk(g, { noiseMax: 0 })).toBe(false);
  g.saga!.scales.noise = 0;
  expect(sagaCondOk(g, { noiseMax: 0 })).toBe(true);
  expect(sagaCondOk(g, { noiseMin: 2 })).toBe(false);
  // СОВЕСТЬ
  g.saga!.scales.conscience = -2;
  expect(sagaCondOk(g, { conscienceMax: -2 })).toBe(true);
  expect(sagaCondOk(g, { conscienceMin: 2 })).toBe(false);
  // notFlags: ни одного из перечисленных (скрытие выбора, напр. «Издательства» в S19)
  g.saga!.flags.push('суд с холдингом');
  expect(sagaCondOk(g, { notFlags: ['правда публична', 'суд с холдингом'] })).toBe(false);
  g.saga!.flags = g.saga!.flags.filter((f) => f !== 'суд с холдингом');
  expect(sagaCondOk(g, { notFlags: ['правда публична', 'суд с холдингом'] })).toBe(true);
  // flagsAll / flagsAny: «все» / «хотя бы один» (F-путь, слоты архива, холодные ветки)
  const savedFlags = [...g.saga!.flags];
  g.saga!.flags = savedFlags.filter((f) => f !== 'кодекс полный' && f !== 'финал-отложен');
  g.saga!.flags.push('финал-отложен');
  expect(sagaCondOk(g, { flagsAll: ['финал-отложен', 'кодекс полный'] })).toBe(false);
  g.saga!.flags.push('кодекс полный');
  expect(sagaCondOk(g, { flagsAll: ['финал-отложен', 'кодекс полный'] })).toBe(true);
  g.saga!.flags = g.saga!.flags.filter((f) => f !== 'партнёрство');
  expect(sagaCondOk(g, { flagsAny: ['права проданы', 'партнёрство'] })).toBe(false);
  g.saga!.flags.push('партнёрство');
  expect(sagaCondOk(g, { flagsAny: ['права проданы', 'партнёрство'] })).toBe(true);
  // flagsCount: «не меньше N из списка» (условие «Суда» в S18 — двое союзников)
  const allies = { flagsCount: { any: ['Каспер в союзниках', 'Жанна знает', 'коробка у вас', 'музей'], min: 2 } };
  g.saga!.flags = savedFlags.filter((f) => !allies.flagsCount.any.includes(f));
  g.saga!.flags.push('Каспер в союзниках');
  expect(sagaCondOk(g, allies)).toBe(false);
  g.saga!.flags.push('Жанна знает');
  expect(sagaCondOk(g, allies)).toBe(true);
  g.saga!.flags = [...savedFlags];
  // комбинации — логическое И
  g.money = 100;
  g.saga!.scales.noise = 2;
  expect(sagaCondOk(g, { moneyMax: 150, noiseMin: 2 })).toBe(true);
  expect(sagaCondOk(g, { moneyMax: 150, noiseMin: 3 })).toBe(false);
});

it('вставки «по ситуации»: тонкая касса — реплика Скептика, полная — нет', () => {
  const g = withRelease();
  tickSaga(g);
  g.money = 100; // касса тонка
  const s1 = SAGA_NODES['S1']!;
  const insertTexts = () =>
    (s1.inserts ?? [])
      .map((i) => ({ t: i.text, w: 'when' in i ? (i as { when?: Parameters<typeof sagaCondOk>[1] }).when : undefined }))
      .filter((x) => sagaCondOk(g, x.w))
      .map((x) => x.t);
  expect(insertTexts().some((t) => t.includes('счёт за электричество'))).toBe(true);
  expect(insertTexts().some((t) => t.includes('департаменте древностей'))).toBe(false);
  g.money = 600; // касса полна — наоборот
  expect(insertTexts().some((t) => t.includes('департаменте древностей'))).toBe(true);
  expect(insertTexts().some((t) => t.includes('счёт за электричество'))).toBe(false);
});

it('эффекты: деньги/фанаты по тирам, доверие и шкалы копятся', () => {
  const g = withRelease();
  tickSaga(g);
  const m0 = g.money;
  sagaApplyEffects(g, [{ k: 'money', v: -1 }]);
  expect(g.money).toBe(m0 - CONFIG.SAGA.MONEY.minus[0]!);
  sagaApplyEffects(g, [{ k: 'money', v: 2 }]);
  expect(g.money).toBe(m0 - CONFIG.SAGA.MONEY.minus[0]! + CONFIG.SAGA.MONEY.plus[1]!);
  sagaApplyEffects(g, [{ k: 'trust', who: 'Вера', v: 1 }, { k: 'trust', who: 'Вера', v: -1 }]);
  expect(g.saga!.trust['Вера']).toBe(0);
  sagaApplyEffects(g, [{ k: 'biz', v: 3 }]);
  expect(g.saga!.scales['biz']).toBe(3);
  // условные эффекты (when): срабатывают только при выполненном условии (расторжение сделки, S22)
  const m1 = g.money;
  sagaApplyEffects(g, [{ k: 'when', cond: { flag: 'сделка с Ростоцким' }, effects: [{ k: 'money', v: -2 }] }]);
  expect(g.money).toBe(m1);
  g.saga!.flags.push('сделка с Ростоцким');
  sagaApplyEffects(g, [{ k: 'when', cond: { flag: 'сделка с Ростоцким' }, effects: [{ k: 'money', v: -2 }] }]);
  expect(g.money).toBe(m1 - CONFIG.SAGA.MONEY.minus[1]!);
});

it('эпилог: авто-выбор по правилам 1–7 (совесть, фонд, копия, секрет)', () => {
  const base = () => { const g = withRelease(); tickSaga(g); return g; };
  {
    const g = base();
    expect(sagaEpilogFor(g.saga!)).toBe('E4'); // ничего не набрано → «Тишина»
    g.saga!.scales.conscience = 1;
    expect(sagaEpilogFor(g.saga!)).toBe('E1'); // выпуск при средней → «Маяк горит»
    g.saga!.flags.push('фонд');
    expect(sagaEpilogFor(g.saga!)).toBe('E2'); // «Витрина» выше «Маяка»
    g.saga!.flags.push('правда публична', 'проклятие публично');
    expect(sagaEpilogFor(g.saga!)).toBe('E5'); // «Проклятие снято» выше «Витрины»
    g.saga!.flags.push('копия не явна');
    expect(sagaEpilogFor(g.saga!)).toBe('E4'); // форс-фактор: «Тишина» даже при выпуске
  }
  {
    const g = base(); // секрет «Двойной финал»
    g.saga!.flags.push('кодекс полный', 'титул — все');
    g.saga!.scales.conscience = CONFIG.SAGA.EPILOG.SECRET_CONSCIENCE;
    for (const [who, v] of Object.entries(CONFIG.SAGA.EPILOG.SECRET_TRUST)) g.saga!.trust[who] = v;
    expect(sagaEpilogFor(g.saga!)).toBe('E6');
    g.saga!.trust['Вера'] = 0; // недобор доверия — секрет не срабатывает, остаётся «Маяк»
    expect(sagaEpilogFor(g.saga!)).toBe('E1');
  }
});

it('миграция v15: сейв без саги грузится, версия поднята', () => {
  const g = newGame(1);
  g.saveVersion = 14;
  delete (g as { saga?: unknown }).saga;
  const m = migrateSave(g);
  expect(m.saveVersion).toBe(SAVE_VERSION);
  expect(SAVE_VERSION).toBe(18); // v18: финал партии и письмо двадцатилетия (аудит-51 05-P2-6); v17: бустеры-заряды; v16: PLAN-49 Э3 (числа саги)
  expect(m.saga).toBeUndefined();
});

it('миграция v15: битая сага у старых сейвов сбрасывается', () => {
  const g = newGame(1);
  g.saveVersion = 14;
  (g as { saga?: unknown }).saga = { node: 'S1' }; // без flags — мусор
  const m = migrateSave(g);
  expect(m.saga).toBeUndefined();
});

it('миграция v16: саге проставляются опорные точки времени (Э3)', () => {
  const g = newGame(1);
  g.saveVersion = 15;
  g.week = 500;
  g.saga = { node: 'S1', stage: 'choice', flags: [], artifacts: [], trust: {}, scales: {}, roles: {} };
  const m = migrateSave(g);
  expect(m.saveVersion).toBe(SAVE_VERSION);
  expect(m.saga!.startWeek).toBe(500);
  expect(m.saga!.lastWeek).toBe(500);
  expect(m.saga!.lastGap).toBe(0);
});

it('тексты саги: чистота от служебных пометок (курсивы, S-номера, «сага», ❄)', () => {
  type NodeShape = {
    text?: string[];
    inserts?: Array<{ text?: string }>;
    choices?: Array<{ label?: string; result?: string }>;
    slots?: Record<string, Array<{ text?: string }>>;
  };
  const bad: string[] = [];
  const check = (where: string, s: string | undefined | null) => {
    if (!s) return;
    const txt = s.replace(/\{[^}]*\}/g, ''); // {плейсхолдеры} — легальный синтаксис (роли, слоты)
    if (/\*\(/.test(txt)) bad.push(`${where}: *(…)`);
    if (/\b[Ss]\d+[а-я]?/.test(txt)) bad.push(`${where}: S-номер`);
    if (/сага|саги|сагу|сагой|саге/i.test(txt)) bad.push(`${where}: «сага»`);
    if (/❄|заготовк|Авторская правда/i.test(txt)) bad.push(`${where}: пометка`);
  };
  const nodes = SAGA_NODES as unknown as Record<string, NodeShape>;
  for (const [id, n] of Object.entries(nodes)) {
    (n.text || []).forEach((t, i) => check(`${id}.text${i}`, t));
    (n.inserts || []).forEach((v, i) => check(`${id}.ins${i}`, v.text));
    (n.choices || []).forEach((c, i) => { check(`${id}#${i}.label`, c.label); check(`${id}#${i}.result`, c.result); });
    for (const [k, arr] of Object.entries(n.slots || {})) arr.forEach((v, j) => check(`${id}.slot:${k}[${j}]`, v.text));
  }
  expect(bad, bad.join('; ')).toHaveLength(0);
});

it('варианты выбора: художественные, без служебных пометок', () => {
  type NodeShape = { choices?: Array<{ label?: string }> };
  const bad: string[] = [];
  const nodes = SAGA_NODES as unknown as Record<string, NodeShape>;
  for (const [id, n] of Object.entries(nodes)) {
    (n.choices || []).forEach((c, i) => {
      const l = c.label ?? '';
      if (/\(бесплатн|\(неденежн|\(посмертн|\(просьб|\(условие|\(скандал|\(досье|\(реставратор|^[A-F] · |· шаг|под-развилка/.test(l)) bad.push(`${id}#${i}: ${l}`);
      if (/ \(/.test(l)) bad.push(`${id}#${i}: скобочное пояснение: ${l}`);
    });
  }
  expect(bad, bad.join('; ')).toHaveLength(0);
});

it('числа саги: [СУММА]/[N]/[≈N] не вернулись (включая «[≈N недель]»)', () => {
  const all = JSON.stringify(SAGA_NODES);
  const left = all.match(/\[(?:СУММА|N|≈N)(?:[^а-яёА-ЯЁa-zA-Z]|$)/g);
  expect(left, `остатки: ${left?.join(' ')}`).toBeNull();
});

it('сцены-события: hold ждёт N дней до показа (S13b «Стол»)', () => {
  const g = withRelease();
  let guard = 0;
  let shown = false;
  while (!shown && g.saga?.stage !== 'done' && guard++ < 3000) {
    g.week += 7;
    tickSaga(g);
    let inner = 0;
    while (g.pendingEvent && inner++ < 60) {
      if (g.pendingEvent.type === 'saga' && g.pendingEvent.node === 'S13' && g.saga?.stage === 'choice') { shown = true; break; }
      if (!resolveSaga(g, '').ok) break;
    }
  }
  expect(shown, 'S13 показан').toBe(true);
  const w = g.week;
  let r = resolveSaga(g, '');
  expect(r.ok).toBe(true);
  while (g.pendingEvent && g.saga?.stage === 'result' && r.ok) r = resolveSaga(g, '');
  expect(g.saga?.node).toBe('S13b');
  expect(g.saga?.holdUntil, 'hold = 21 день').toBe(w + 21);
  g.week = w + 20; tickSaga(g);
  expect(g.pendingEvent, 'за день до срока — тишина').toBeNull();
  g.week = w + 21; tickSaga(g);
  expect(g.pendingEvent).toMatchObject({ type: 'saga', node: 'S13b' });
});

it('S3: подводка «откуда слух» разносится по веткам (v1.54.2)', () => {
  const g = withRelease();
  tickSaga(g);
  const st = g.saga!;
  const S3 = SAGA_NODES['S3']!;
  const line = '{s3leak} Модератор присылает приглашение.';
  st.flags = ['сами вышли в сеть'];
  expect(sagaResolveText(line, S3, g)).toContain('бросили');
  st.flags = ['тихая тропа'];
  expect(sagaResolveText(line, S3, g)).toContain('Глеб');
  st.flags = ['картридж: подсобка'];
  expect(sagaResolveText(line, S3, g)).toContain('для своих');
  st.flags = [];
  expect(sagaResolveText(line, S3, g)).toContain('все три тысячи');
  // в самом узле слот стоит вместо безусловной фразы
  expect(String(S3.text[1])).toContain('{s3leak}');
  expect(String(S3.text[1])).not.toContain('Слух о вашей находке разносится');
});
