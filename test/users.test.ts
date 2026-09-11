// PLAN-18 (этапы 2–3): пользователи, сессии, сохранения в БД и REST-API.
import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import { registerApi } from '../src/server/api';
import { SessionRegistry } from '../src/server/sessions';
import { UserService } from '../src/server/users';

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
    expect(u.register('Mertas', '123456').ok).toBe(true);
    expect(u.register('mertas', 'abcdef').ok).toBe(false); // логин без учёта регистра
    expect(u.login('Mertas', 'wrong').ok).toBe(false);
    const s = u.login('Mertas', '123456');
    expect(s.ok).toBe(true);
    const token = s.ok ? s.token : '';
    expect(u.userByToken(token)?.login).toBe('Mertas');
    u.logout(token);
    expect(u.userByToken(token)).toBeNull();
    u.close();
  });

  it('правила логина и пароля', () => {
    const u = new UserService(tmpDb());
    expect(u.register('ab', '123456').ok).toBe(false); // короткий логин
    expect(u.register('кириллица', '123456').ok).toBe(false); // только латиница/цифры/_.-
    expect(u.register('mertas', '12345').ok).toBe(false); // пароль короче 6
    u.close();
  });

  it('восстановление пароля: код → смена → старый пароль не работает, код одноразовый', () => {
    const u = new UserService(tmpDb());
    u.register('Mertas', '123456', 'mertas@example.com');
    const r = u.startReset('Mertas');
    expect(r.ok).toBe(true);
    const code = r.ok ? r.code : '';
    expect(u.confirmReset('Mertas', '000000', 'newpass1').ok).toBe(false);
    expect(u.confirmReset('Mertas', code, 'newpass1').ok).toBe(true);
    expect(u.login('Mertas', '123456').ok).toBe(false);
    expect(u.login('Mertas', 'newpass1').ok).toBe(true);
    expect(u.confirmReset('Mertas', code, 'another1').ok).toBe(false);
    u.close();
  });

  it('сохранения: список/создание/обновление/удаление — только свои', () => {
    const u = new UserService(tmpDb());
    u.register('Mertas', '123456');
    u.register('Drugoi', '123456');
    const a = u.login('Mertas', '123456');
    const b = u.login('Drugoi', '123456');
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
    u.ensureUser('Mertas', '123456', undefined, true);
    const boss = u.login('Mertas', '123456');
    expect(boss.ok).toBe(true);
    expect(boss.ok && boss.user.admin).toBe(true);
    u.register('Drug', '123456');
    const drug = u.login('Drug', '123456');
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
    const r = u.register('Vitya', '123456');
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
        body: JSON.stringify({ login: 'BezKoda', password: '123456' }),
      });
      expect(((await noInvite.json()) as { ok: boolean }).ok).toBe(false);

      const code = users.createInvites('тест', 1)[0]!.code;
      const reg = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'Mertas', password: '123456', invite: code }),
      });
      expect(reg.status).toBe(200);

      // код одноразовый: второй раз не пройдёт
      const reuse = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'Vtoroy', password: '123456', invite: code }),
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
