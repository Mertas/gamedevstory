// PLAN-18 (этапы 2–3): пользователи, сессии, сохранения в БД и REST-API.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import { createRequire } from 'node:module';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { registerApi } from '../src/server/api';
import { SessionRegistry } from '../src/server/sessions';
import { UserService } from '../src/server/users';
import { SAVE_PAYLOAD_MAX_BYTES } from '../src/server/limits';
import { CONFIG } from '../src/core/config';
import { currentDifficulty, DIFFICULTY } from '../src/core/difficulty';

const dirs: string[] = [];
function tmpDb(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-users-'));
  dirs.push(d);
  return path.join(d, 'users.db');
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('PLAN-18: пользователи (SQLite)', () => {
  it('регистрация, вход, дубликат логина, неверный пароль, выход', () => {
    const u = new UserService(tmpDb());
    expect(u.register('Mertas', '12345678').ok).toBe(true);
    expect(u.register('mertas', 'abcdefgh').ok).toBe(false); // логин без учёта регистра
    expect(u.login('Mertas', 'wrong').ok).toBe(false);
    const s = u.login('Mertas', '12345678');
    expect(s.ok).toBe(true);
    const token = s.ok ? s.token : '';
    expect(u.userByToken(token)?.login).toBe('Mertas');
    u.logout(token);
    expect(u.userByToken(token)).toBeNull();
    u.close();
  });

  it('SER-28: личные сообщения — история пары, непрочитанные и отметка прочтения', () => {
    const u = new UserService(tmpDb());
    u.register('Anna', '12345678');
    u.register('Boris', '12345678');
    const aT = u.login('Anna', '12345678');
    const bT = u.login('Boris', '12345678');
    const a = u.userByToken(aT.ok ? aT.token : '')!.id;
    const b = u.userByToken(bT.ok ? bT.token : '')!.id;
    u.dmSend(a, b, 'Привет, сосед!');
    u.dmSend(b, a, 'Привет! Как дела?');
    expect(u.dmHistory(a, b).map((m) => m.text)).toEqual(['Привет, сосед!', 'Привет! Как дела?']);
    expect(u.dmUnread(a)).toEqual({ [b]: 1 }); // ответ Бориса не прочитан
    expect(u.dmUnread(b)).toEqual({ [a]: 1 });
    u.dmMarkRead(a, b); // Анна открыла переписку
    expect(u.dmUnread(a)).toEqual({});
    expect(u.dmUnread(b)).toEqual({ [a]: 1 }); // у Бориса по-прежнему непрочитанное
    expect(u.dmHistory(a, b).every((m) => m.to !== a || m.read)).toBe(true);
    u.close();
  });

  it('правила логина и пароля', () => {
    const u = new UserService(tmpDb());
    expect(u.register('ab', '12345678').ok).toBe(false); // короткий логин
    expect(u.register('кириллица', '12345678').ok).toBe(false); // только латиница/цифры/_.-
    expect(u.register('mertas', '12345').ok).toBe(false); // пароль короче 6
    u.close();
  });

  it('восстановление пароля: код → смена → старый пароль не работает, код одноразовый', () => {
    const u = new UserService(tmpDb());
    u.register('Mertas', '12345678', 'mertas@example.com');
    const r = u.startReset('Mertas');
    expect(r.ok).toBe(true);
    const code = r.ok ? r.code : '';
    expect(u.confirmReset('Mertas', '000000', 'newpass1').ok).toBe(false);
    expect(u.confirmReset('Mertas', code, 'newpass1').ok).toBe(true);
    expect(u.login('Mertas', '12345678').ok).toBe(false);
    expect(u.login('Mertas', 'newpass1').ok).toBe(true);
    expect(u.confirmReset('Mertas', code, 'another1').ok).toBe(false);
    u.close();
  });

  it('сохранения: список/создание/обновление/удаление — только свои', () => {
    const u = new UserService(tmpDb());
    u.register('Mertas', '12345678');
    u.register('Drugoi', '12345678');
    const a = u.login('Mertas', '12345678');
    const b = u.login('Drugoi', '12345678');
    const aid = a.ok ? a.user.id : 0;
    const bid = b.ok ? b.user.id : 0;
    const id = u.createSave(aid, 'Пиксель-Плюс', '{"game":{}}', 1, 1, 500);
    expect(u.listSaves(aid).length).toBe(1);
    expect(u.listSaves(aid)[0]!.studioName).toBe('Пиксель-Плюс');
    expect(u.getSave(bid, id)).toBeNull(); // чужое сохранение не читается
    expect(u.updateSave(aid, id, '{"game":{"week":9}}', 9, 2, 700)).toBe(true);
    expect(u.getSave(aid, id)?.week).toBe(9);
    expect(u.deleteSave(bid, id)).toBe(false);
    expect(u.deleteSave(aid, id)).toBe(true);
    expect(u.listSaves(aid).length).toBe(0);
    u.close();
  });

  it('владелец: admin ставится сиду, обычный игрок — не админ', () => {
    const u = new UserService(tmpDb());
    u.ensureUser('Mertas', '12345678', undefined, true);
    const boss = u.login('Mertas', '12345678');
    expect(boss.ok).toBe(true);
    expect(boss.ok && boss.user.admin).toBe(true);
    u.register('Drug', '12345678');
    const drug = u.login('Drug', '12345678');
    expect(drug.ok).toBe(true);
    expect(drug.ok && drug.user.admin).toBe(false);
    u.close();
  });

  it('инвайты: одноразовые, отзыв только свободных, история использованных', () => {
    const u = new UserService(tmpDb());
    const [a, b] = u.createInvites('Витя', 2);
    expect(a!.code).toMatch(/^GDS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(u.inviteValid(a!.code)).toBe(true);
    expect(u.inviteValid(a!.code.toLowerCase())).toBe(true); // регистр не важен — код диктуют руками
    expect(u.inviteValid('GDS-XXXX-YYYY')).toBe(false);
    const r = u.register('Vitya', '12345678');
    expect(r.ok).toBe(true);
    expect(u.consumeInvite(a!.code, r.ok ? r.user.id : 0)).toBe(true);
    expect(u.consumeInvite(a!.code, r.ok ? r.user.id : 0)).toBe(false); // второй раз не сжечь
    expect(u.inviteValid(a!.code)).toBe(false); // код занят
    expect(u.listInvites().length).toBe(2);
    expect(u.listInvites().find((i) => i.code === a!.code)?.usedBy).toBe('Vitya');
    expect(u.revokeInvite(b!.code)).toBe(true); // свободный отзывается
    expect(u.revokeInvite(a!.code)).toBe(false); // использованный — история
    expect(u.listInvites().length).toBe(1);
    u.close();
  });
});

describe('PLAN-18: REST — вход, cookie, создание партии, список сохранений', () => {
  it('регистрация → cookie → «Новая игра» из двух сотрудников → список с активным сейвом', async () => {
    const users = new UserService(tmpDb());
    const registry = new SessionRegistry(users);
    const app = express();
    app.use(express.json());
    registerApi(app, { users, mail: { send: async () => 'dev' as const }, sessions: registry });
    const srv = app.listen(0);
    const port = (srv.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      // регистрация без инвайт-кода закрыта (plan/19)
      const noInvite = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'BezKoda', password: '12345678' }),
      });
      expect(((await noInvite.json()) as { ok: boolean }).ok).toBe(false);

      const code = users.createInvites('тест', 1)[0]!.code;
      const reg = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'Mertas', password: '12345678', invite: code }),
      });
      expect(reg.status).toBe(200);

      // код одноразовый: второй раз не пройдёт
      const reuse = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'Vtoroy', password: '12345678', invite: code }),
      });
      expect(((await reuse.json()) as { ok: boolean }).ok).toBe(false);
      const cookie = reg.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      expect(cookie).toContain('gds_session=');

      const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
      expect(((await me.json()) as { user?: { login: string } }).user?.login).toBe('Mertas');

      const mk = await fetch(`${base}/api/saves`, {
        method: 'POST', headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ studioName: 'Пиксель', staffIds: ['dee-coder', 's-presso'] }),
      });
      const mkBody = (await mk.json()) as { ok: boolean; id?: number };
      expect(mkBody.ok).toBe(true);

      const list = await fetch(`${base}/api/saves`, { headers: { cookie } });
      const saves = ((await list.json()) as { saves: Array<{ studioName: string; active: boolean }> }).saves;
      expect(saves.length).toBe(1);
      expect(saves[0]!.studioName).toBe('Пиксель');
      expect(saves[0]!.active).toBe(true);

      const anon = await fetch(`${base}/api/saves`);
      expect(anon.status).toBe(401); // без входа — отказ

      // активная сессия создана: ровно выбранные сотрудники и название студии
      const token = cookie.slice('gds_session='.length);
      const user = users.userByToken(token)!;
      const server = registry.server(user.id)!;
      expect(server.game.staff.map((s) => s.id)).toEqual(['dee-coder', 's-presso']);
      expect(server.game.studioName).toBe('Пиксель');

      // загрузка того же сохранения идемпотентна, удаление закрывает сессию
      const load = await fetch(`${base}/api/saves/${mkBody.id}/load`, { method: 'POST', headers: { cookie } });
      expect(((await load.json()) as { ok: boolean }).ok).toBe(true);
      const del = await fetch(`${base}/api/saves/${mkBody.id}`, { method: 'DELETE', headers: { cookie } });
      expect(((await del.json()) as { ok: boolean }).ok).toBe(true);
      expect(registry.server(user.id)).toBeNull();
    } finally {
      registry.disposeAll();
      srv.close();
      users.close();
    }
  });
});

describe('безопасность паролей: s2-схема, перец и хэш сессий', () => {
  const require2 = createRequire(import.meta.url);
  const { DatabaseSync } = require2('node:sqlite') as typeof import('node:sqlite');

  it('пароль короче 8 символов не принимается', () => {
    const u = new UserService(tmpDb());
    expect(u.register('Mertas', '1234567').ok).toBe(false);
    expect(u.register('Mertas', '12345678').ok).toBe(true);
    u.close();
  });

  it('в базе лежит sha256(токен), а не сам токен; вход по открытому токену работает', () => {
    const file = tmpDb();
    const u = new UserService(file);
    u.register('Mertas', '12345678');
    const r = u.login('Mertas', '12345678');
    expect(r.ok).toBe(true);
    const token = r.ok ? r.token : '';
    const raw = new DatabaseSync(file);
    const rows = raw.prepare('SELECT token FROM sessions').all() as Array<{ token: string }>;
    raw.close();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token).not.toBe(token);
    expect(rows[0]?.token).toBe(createHash('sha256').update(token).digest('hex'));
    expect(u.userByToken(token)?.login).toBe('Mertas');
    expect(u.userByToken(token.slice(0, -2) + 'ff')).toBeNull();
    u.close();
  });

  it('легаси-хэш (16384, без перца) принимается и молча апгрейдится до s2', () => {
    delete process.env.GDS_PEPPER; // легаси считался без перца
    const file = tmpDb();
    const u = new UserService(file);
    u.register('Mertas', '12345678');
    const salt = randomBytes(16).toString('hex');
    const legacy = scryptSync('12345678', salt, 64).toString('hex');
    const raw = new DatabaseSync(file);
    raw.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE login = ?').run(legacy, salt, 'Mertas');
    raw.close();
    expect(u.login('Mertas', '12345678').ok).toBe(true);
    const raw2 = new DatabaseSync(file);
    const after = raw2.prepare('SELECT pass_hash FROM users WHERE login = ?').get('Mertas') as { pass_hash: string };
    raw2.close();
    expect(after.pass_hash.startsWith('s2$32768$8$1$')).toBe(true);
    expect(u.login('Mertas', '12345678').ok).toBe(true);
    u.close();
  });

  it('перец обязателен: хэш, посчитанный с другим перцем, не подходит', () => {
    const file = tmpDb();
    process.env.GDS_PEPPER = 'perec-odin';
    const u = new UserService(file);
    u.register('Mertas', '12345678');
    expect(u.login('Mertas', '12345678').ok).toBe(true);
    process.env.GDS_PEPPER = 'perec-dva';
    expect(u.login('Mertas', '12345678').ok).toBe(false);
    delete process.env.GDS_PEPPER;
    u.close();
  });

  it('setPassword меняет пароль и разлогинивает все сессии', () => {
    const file = tmpDb();
    const u = new UserService(file);
    u.register('Mertas', '12345678');
    const first = u.login('Mertas', '12345678');
    const token = first.ok ? first.token : '';
    const me = u.userByToken(token);
    expect(me).not.toBeNull();
    expect(u.setPassword(me!.id, '1234567')).toBe(false);
    expect(u.setPassword(me!.id, 'sovsemNovy1')).toBe(true);
    expect(u.userByToken(token)).toBeNull();
    expect(u.login('Mertas', '12345678').ok).toBe(false);
    expect(u.login('Mertas', 'sovsemNovy1').ok).toBe(true);
    u.close();
  });
});

describe('PLAN-22: открытые комбо в аккаунте', () => {
  it('addCombos дописывает только новые, combosCount = уровень', () => {
    const file = tmpDb();
    const u = new UserService(file);
    const reg = u.register('Mertas', '12345678');
    expect(reg.ok).toBe(true);
    if (!reg.ok) throw new Error('регистрация не прошла');
    const id = reg.user.id;
    expect(u.listCombos(id)).toEqual([]);
    expect(u.combosCount(id)).toBe(0);
    expect(u.addCombos(id, ['rpg|pirate', 'table|puzzle'])).toBe(2);
    expect(u.addCombos(id, ['rpg|pirate', 'table|puzzle'])).toBe(0); // дубликаты не считаются
    expect(u.addCombos(id, ['rpg|pirate', 'action|racing'])).toBe(1);
    expect(u.combosCount(id)).toBe(3); // набор только растёт
    expect(u.listCombos(id)).toContain('action|racing');
    u.close();
  });
});

describe('PLAN-27: партия переживает перезапуск сервера', () => {
  it('пустой реестр (после деплоя) + подключение → поднимается последнее сохранение', () => {
    const users = new UserService(tmpDb());
    const r1 = new SessionRegistry(users);
    const reg = users.register('Mertas', '12345678');
    expect(reg.ok).toBe(true);
    const uid = reg.ok ? reg.user.id : 0;
    const saveId = r1.create(uid, { studioName: 'Тёплый Ламповый', staffIds: ['dee-coder', 's-presso'] });

    // перезапуск сервера: реестр пуст, как в свежем процессе
    const r2 = new SessionRegistry(users);
    expect(r2.server(uid)).toBeNull(); // раньше это давало «нет активной партии» и вылет в меню
    expect(r2.attach(uid)).not.toBeNull();
    expect(r2.activeSaveId(uid)).toBe(saveId);
    expect(r2.server(uid)?.game.studioName).toBe('Тёплый Ламповый');

    // у кого сохранений нет — честный отказ (клиент уйдёт в меню новых партий)
    const fresh = users.register('Pustoy', '12345678');
    const freshId = fresh.ok ? fresh.user.id : 0;
    expect(users.listSaves(freshId).length).toBe(0);
    expect(r2.attach(freshId)).toBeNull();

    r2.disposeAll();
    users.close();
  });
});

describe('аудит-51 СВОД-P1-1: две партии разных уровней не перетирают числа', () => {
  it('каждая операция сессии применяет конфиг своей партии', () => {
    const users = new UserService(tmpDb());
    const ra = users.register('Legkiy', '12345678');
    const rb = users.register('Tyazhkiy', '12345678');
    const aid = ra.ok ? ra.user.id : 0;
    const bid = rb.ok ? rb.user.id : 0;
    const reg = new SessionRegistry(users);
    reg.create(aid, { studioName: 'Лёгкая', difficulty: 'easy' });
    reg.create(bid, { studioName: 'Тяжёлая', difficulty: 'hard' });
    const srvA = reg.server(aid);
    const srvB = reg.server(bid);
    expect(srvA).not.toBeNull();
    expect(srvB).not.toBeNull();

    // стартовые числа партий — из их уровней
    expect(srvA!.snapshot().game.money).toBe(DIFFICULTY.easy.overrides.START_MONEY);
    expect(srvB!.snapshot().game.money).toBe(DIFFICULTY.hard.overrides.START_MONEY);

    // CONFIG после созданий — «hard» (последняя загрузка); операция A обязана вернуть ЕЁ числа
    srvA!.handle({ type: 'set_speed', v: 0 });
    expect(currentDifficulty()).toBe('easy');
    expect(CONFIG.START_MONEY).toBe(DIFFICULTY.easy.overrides.START_MONEY);

    // операция B — снова её уровень, чужие числа не залипли
    srvB!.handle({ type: 'set_speed', v: 0 });
    expect(currentDifficulty()).toBe('hard');
    expect(CONFIG.START_MONEY).toBe(DIFFICULTY.hard.overrides.START_MONEY);

    // и обратно: A — easy
    srvA!.handle({ type: 'set_speed', v: 0 });
    expect(currentDifficulty()).toBe('easy');
    expect(CONFIG.START_MONEY).toBe(DIFFICULTY.easy.overrides.START_MONEY);

    reg.disposeAll();
    users.close();
  });
});

describe('аудит-51 P1-4: квоты DM и сейвов', () => {
  it('DM: хранятся только последние 500 сообщений пары', () => {
    const u = new UserService(tmpDb());
    const a = u.register('Spam', '12345678');
    const b = u.register('Mirny', '12345678');
    const aid = a.ok ? a.user.id : 0;
    const bid = b.ok ? b.user.id : 0;
    for (let i = 0; i < 505; i++) u.dmSend(aid, bid, `m${i}`);
    const kept = u.dmHistory(aid, bid, 1000);
    expect(kept.length).toBe(500);
    const texts = kept.map((m) => m.text);
    expect(texts).toContain('m5'); // самый старый из сохранившихся
    expect(texts).toContain('m504'); // самый новый
    expect(texts).not.toContain('m4');
    expect(texts).not.toContain('m0');
    u.close();
  });

  it('DM: счётчик отправленных за минуту работает', () => {
    const u = new UserService(tmpDb());
    const a = u.register('Chatty', '12345678');
    const b = u.register('Tihiy', '12345678');
    const aid = a.ok ? a.user.id : 0;
    const bid = b.ok ? b.user.id : 0;
    u.dmSend(aid, bid, 'раз');
    u.dmSend(aid, bid, 'два');
    expect(u.dmRecentCount(aid, 60_000)).toBe(2);
    expect(u.dmRecentCount(bid, 60_000)).toBe(0);
    u.close();
  });

  it('сейвы: payload сверх жёсткого лимита не записывается', () => {
    const u = new UserService(tmpDb());
    const a = u.register('Pukhlyak', '12345678');
    const aid = a.ok ? a.user.id : 0;
    const id = u.createSave(aid, 'Нормальная', '{}');
    const fat = 'x'.repeat(SAVE_PAYLOAD_MAX_BYTES + 1);
    expect(() => u.updateSave(aid, id, fat, 1, 1, 0)).toThrow();
    expect(() => u.createSave(aid, 'Жирная', fat)).toThrow();
    expect(u.getSave(aid, id)!.payload).toBe('{}'); // старый payload не пострадал
    u.close();
  });
});

describe('PLAN-34: мировой список всех аккаунтов', () => {
  it('одна таблица по всем сохранениям: копии по убыванию, студии видны', async () => {
    const users = new UserService(tmpDb());
    const a = users.register('Mertas', '12345678');
    const b = users.register('Vtoroy', '12345678');
    const aid = a.ok ? a.user.id : 0;
    const bid = b.ok ? b.user.id : 0;
    const rec = (name: string, units: number) => ({ name, units, revenue: units * 10, releaseWeek: 1 });
    users.createSave(aid, 'Тёплый Ламповый', JSON.stringify({ game: { history: [rec('Хит', 50), rec('Слабая', 5)] }, chat: {} }));
    users.createSave(bid, 'Пиксель', JSON.stringify({ game: { history: [rec('Чужая', 30)] }, chat: {} }));
    const lb = await users.leaderboard();
    expect(lb.total).toBe(3);
    expect(lb.rows.map((r) => r.name)).toEqual(['Хит', 'Чужая', 'Слабая']);
    expect(lb.rows[0]!.studio).toBe('Тёплый Ламповый');
    expect(lb.rows[1]!.studio).toBe('Пиксель');
    // факт важнее плана: paidUnits перекрывает units
    users.updateSave(aid, users.listSaves(aid)[0]!.id, JSON.stringify({ game: { history: [{ ...rec('Слабая', 5), paidUnits: 99 }] }, chat: {} }), 1, 1, 0);
    users.close();
  });
});

describe('PLAN-18+: «Удалить весь прогресс» — все сейвы и достижения аккаунта', () => {
  it('сервис: wipeProgress чистит сейвы/комбо/флаги, но только своего аккаунта', () => {
    const u = new UserService(tmpDb());
    const a = u.register('Aaa', '12345678');
    const b = u.register('Bbb', '12345678');
    const ida = a.ok ? a.user.id : 0;
    const idb = b.ok ? b.user.id : 0;
    u.createSave(ida, 'Студия A', '{}');
    u.createSave(ida, 'Студия A2', '{}');
    u.createSave(idb, 'Студия B', '{}');
    u.addCombos(ida, ['rpg|action', 'sim|girl']);
    u.addCombos(idb, ['rpg|action']);
    u.setFlag(ida, 'mg_bag', '{"q":[]}');
    u.setFlag(idb, 'mg_bag', '{"q":[]}');

    expect(u.wipeProgress(ida)).toEqual({ saves: 2, combos: 2, flags: 1 });
    expect(u.listSaves(ida)).toEqual([]);
    expect(u.listCombos(ida)).toEqual([]);
    expect(u.getFlag(ida, 'mg_bag')).toBeNull();
    // чужой аккаунт не тронут
    expect(u.listSaves(idb).length).toBe(1);
    expect(u.listCombos(idb).length).toBe(1);
    expect(u.getFlag(idb, 'mg_bag')).not.toBeNull();
    // повторный вайп — нечего удалять, всё по нулям
    expect(u.wipeProgress(ida)).toEqual({ saves: 0, combos: 0, flags: 0 });
    u.close();
  });

  it('REST: POST /api/saves/purge роняет живую сессию, обнуляет профиль и не трогает соседей', async () => {
    const users = new UserService(tmpDb());
    const registry = new SessionRegistry(users);
    const app = express();
    app.use(express.json());
    registerApi(app, { users, mail: { send: async () => 'dev' as const }, sessions: registry });
    const srv = app.listen(0);
    const port = (srv.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    try {
      const reg = async (login: string): Promise<string> => {
        const code = users.createInvites('тест', 1)[0]!.code;
        const r = await fetch(`${base}/api/auth/register`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ login, password: '12345678', invite: code }),
        });
        return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      };
      const cookieA = await reg('PurgeA');
      const cookieB = await reg('PurgeB');
      const mk = async (cookie: string, name: string): Promise<void> => {
        const r = await fetch(`${base}/api/saves`, {
          method: 'POST', headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ studioName: name, staffIds: ['dee-coder', 's-presso'] }),
        });
        expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
      };
      await mk(cookieA, 'К Пепелищу');
      await mk(cookieB, 'Сосед');

      const userA = users.userByToken(cookieA.slice('gds_session='.length))!;
      const userB = users.userByToken(cookieB.slice('gds_session='.length))!;
      users.addCombos(userA.id, ['rpg|action']);
      users.setFlag(userA.id, 'mg_bag', '{"q":[],"last":null}');
      expect(registry.server(userA.id)).not.toBeNull();

      // без входа — отказ
      const anon = await fetch(`${base}/api/saves/purge`, { method: 'POST' });
      expect(anon.status).toBe(401);

      const purge = await fetch(`${base}/api/saves/purge`, { method: 'POST', headers: { cookie: cookieA } });
      const body = (await purge.json()) as { ok: boolean; deleted: { saves: number; combos: number; flags: number } };
      expect(body.ok).toBe(true);
      expect(body.deleted).toEqual({ saves: 1, combos: 1, flags: 1 });

      // у A: пусто, сессия закрыта, профиль обнулён
      const listA = await fetch(`${base}/api/saves`, { headers: { cookie: cookieA } });
      expect(((await listA.json()) as { saves: unknown[] }).saves.length).toBe(0);
      expect(registry.server(userA.id)).toBeNull();
      const profA = await fetch(`${base}/api/profile`, { headers: { cookie: cookieA } });
      expect(((await profA.json()) as { count: number }).count).toBe(0);

      // у B всё на месте (и его сессия жива)
      const listB = await fetch(`${base}/api/saves`, { headers: { cookie: cookieB } });
      const savesB = ((await listB.json()) as { saves: Array<{ studioName: string }> }).saves;
      expect(savesB.length).toBe(1);
      expect(savesB[0]!.studioName).toBe('Сосед');
      expect(registry.server(userB.id)).not.toBeNull();
    } finally {
      registry.disposeAll();
      srv.close();
      users.close();
    }
  });
});
