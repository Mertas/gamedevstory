// PLAN-18/19: REST авторизации, инвайтов и сохранений. Cookie сессии — httpOnly (SameSite=Strict).
import type { Request, Response, Express } from 'express';
import { STAFF } from '../core/data/db';
import type { CareerId } from '../core/data/schema';
import { INVITE_REQUIRED, PASSWORD_RESET } from './config';
import { generateStudioNames } from './giga';
import type { Mailer } from './mailer';
import { RateLimit } from './ratelimit';
import { nextRank, rankFor } from '../shared/rank';
import { DIFFICULTY, DIFFICULTY_IDS, isDifficultyId } from '../core/difficulty';
import type { InviteRow, SaveMeta, UserService, UserRow } from './users';

export const SESSION_COOKIE = 'gds_session';

/** Минимум, нужный для чтения cookie: подходит и express Request, и WS IncomingMessage. */
export type HeadersLike = { headers: Record<string, string | string[] | undefined> };

/** Сотрудник начального пула — из него игрок выбирает двоих на старте (PLAN-18). */
export interface PoolStaffDto {
  id: string;
  name: string;
  gender: string;
  salary: number;
  hireFee: number;
  stats: { program: number; scenario: number; graphics: number; sound: number };
  activeCareer: CareerId;
}

/** «Initially available» — единственный пул, доступный без найма. */
export function initialPool(): PoolStaffDto[] {
  // persona намеренно не отдаём: характер сотрудника игрок узнаёт уже в игре
  return STAFF.filter((d) => d.unlock.includes('Initially available')).map((d) => ({
    id: d.id, name: d.name, gender: d.gender, salary: d.salary, hireFee: d.hireFee,
    stats: d.stats, activeCareer: d.activeCareer,
  }));
}

/** Жизненный цикл партий пользователя (реализация — SessionRegistry). */
export interface SessionHooks {
  /** Создать новую партию (студия + стартовая пара), сохранить и сделать текущей. */
  create(userId: number, opts: { studioName: string; staffIds: string[]; difficulty?: string }): number;
  /** Сделать сохранение текущим: создать/поднять GameServer пользователя на этом сейве. */
  load(userId: number, saveId: number): void;
  /** Удалить сохранение и (если оно активно) остановить его сессию. */
  drop(userId: number, saveId: number): void;
  /** Активное сохранение (для списка «продолжить»); null — ничего не загружено. */
  activeSaveId(userId: number): number | null;
  /** SER-27: живая сессия игрока (null — не в игре) — для статусов панели «Разговоры». */
  server(userId: number): { lastTypingAt: number } | null;
}

export interface ApiDeps {
  users: UserService;
  mail: Mailer;
  sessions: SessionHooks;
}

function tokenFromReq(req: HeadersLike): string {
  const raw = req.headers.cookie ?? '';
  const header = Array.isArray(raw) ? raw.join('; ') : raw;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === SESSION_COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

function setSession(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

const isSecure = (req: Request): boolean => req.protocol === 'https' || (req.headers['x-forwarded-proto'] ?? '') === 'https';

/** IP клиента: за nginx реальный адрес приходит в X-Forwarded-For (trust proxy = loopback). */
const ipOf = (req: Request): string => req.ip ?? 'unknown';

/** Регистрация маршрутов. Возвращает функцию «кто пришёл» (для WS-авторизации по cookie). */
export function registerApi(app: Express, deps: ApiDeps): (req: HeadersLike) => UserRow | null {
  const { users, mail, sessions } = deps;
  const who = (req: HeadersLike): UserRow | null => users.userByToken(tokenFromReq(req));

  // защита от перебора: вход/сброс — 8 попыток за 10 минут, регистрация — 5 в час (на IP)
  const loginLimit = new RateLimit(8, 10 * 60 * 1000);
  const registerLimit = new RateLimit(5, 60 * 60 * 1000);

  const features = { passwordReset: PASSWORD_RESET, inviteRequired: INVITE_REQUIRED };

  // ─── авторизация ───
  app.post('/api/auth/register', (req, res) => {
    const { login, password, email, invite } = (req.body ?? {}) as { login?: string; password?: string; email?: string; invite?: string };
    if (!registerLimit.allow(`reg:${ipOf(req)}`)) {
      return void res.json({ ok: false, error: 'Слишком много попыток регистрации — попробуйте позже' });
    }
    const code = String(invite ?? '').trim();
    if (INVITE_REQUIRED) {
      if (!code) return void res.json({ ok: false, error: 'Нужен инвайт-код — его выдаёт владелец студии' });
      if (!users.inviteValid(code)) return void res.json({ ok: false, error: 'Инвайт-код не подходит (занят или не существует)' });
    }
    const r = users.register(String(login ?? ''), String(password ?? ''), email);
    if (!r.ok) return void res.json(r);
    if (INVITE_REQUIRED) users.consumeInvite(code, r.user.id); // код сгорает за новичком
    const s = users.login(r.user.login, String(password));
    if (!s.ok) return void res.json(s);
    setSession(res, s.token, isSecure(req));
    res.json({ ok: true, user: s.user });
  });

  app.post('/api/auth/login', (req, res) => {
    const { login, password } = (req.body ?? {}) as { login?: string; password?: string };
    const name = String(login ?? '').trim();
    const key = `login:${ipOf(req)}:${name.toLowerCase()}`;
    if (!loginLimit.allow(key)) {
      return void res.json({ ok: false, error: 'Слишком много попыток входа — подождите 10 минут' });
    }
    const r = users.login(name, String(password ?? ''));
    if (!r.ok) return void res.json(r);
    loginLimit.reset(key);
    setSession(res, r.token, isSecure(req));
    res.json({ ok: true, user: r.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    users.logout(tokenFromReq(req));
    clearSession(res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json({ ok: true, user: who(req), features });
  });

  // ─── восстановление пароля (на публичном сервере выключено: plan/19) ───
  app.post('/api/auth/reset-request', async (req, res) => {
    if (!PASSWORD_RESET) {
      return void res.json({ ok: false, error: 'Восстановление пароля на этом сервере недоступно — напишите владельцу студии' });
    }
    const { login } = (req.body ?? {}) as { login?: string };
    const name = String(login ?? '').trim();
    if (!loginLimit.allow(`reset:${ipOf(req)}:${name.toLowerCase()}`)) {
      return void res.json({ ok: false, error: 'Слишком много запросов — подождите 10 минут' });
    }
    const r = users.startReset(name);
    if (!r.ok) return void res.json(r);
    try {
      const mode = await mail.send(r.to, 'Восстановление пароля — Game Dev Studio',
        `Код восстановления: ${r.code}\nКод действует 15 минут.`);
      res.json({ ok: true, ...(mode === 'dev' ? { devCode: r.code } : {}) });
    } catch (e) {
      res.json({ ok: false, error: e instanceof Error ? e.message : 'Не удалось отправить письмо' });
    }
  });

  app.post('/api/auth/reset-confirm', (req, res) => {
    if (!PASSWORD_RESET) {
      return void res.json({ ok: false, error: 'Восстановление пароля на этом сервере недоступно — напишите владельцу студии' });
    }
    const { login, code, password } = (req.body ?? {}) as { login?: string; code?: string; password?: string };
    const r = users.confirmReset(String(login ?? ''), String(code ?? ''), String(password ?? ''));
    if (!r.ok) return void res.json(r);
    const s = users.login(r.user.login, String(password ?? ''));
    if (!s.ok) return void res.json(s);
    setSession(res, s.token, isSecure(req));
    res.json({ ok: true, user: s.user });
  });

  // ─── инвайты: выдаёт только владелец (серверная проверка, не только интерфейс) ───
  const withUser = (req: Request, res: Response, fn: (u: UserRow) => void): void => {
    const u = who(req);
    if (!u) return void res.status(401).json({ ok: false, error: 'Нужен вход' });
    fn(u);
  };

  const withAdmin = (req: Request, res: Response, fn: (u: UserRow) => void): void => {
    const u = who(req);
    if (!u) return void res.status(401).json({ ok: false, error: 'Нужен вход' });
    if (!u.admin) return void res.status(403).json({ ok: false, error: 'Инвайты выдаёт только владелец студии' });
    fn(u);
  };

  // PLAN-22: профиль игрока — уровень = число открытых комбо, звание по порогам
  app.get('/api/profile', (req, res) => {
    withUser(req, res, (u) => {
      const combos = users.listCombos(u.id);
      const rank = rankFor(combos.length);
      const next = nextRank(combos.length);
      res.json({
        ok: true,
        count: combos.length,
        rank: { icon: rank.icon, name: rank.name, why: rank.why, from: rank.from },
        next: next ? { icon: next.rank.icon, name: next.rank.name, from: next.rank.from, need: next.need } : null,
        total: combos.length,
        combos,
      });
    });
  });

  app.get('/api/invites', (req, res) => {
    withAdmin(req, res, () => {
      const invites: InviteRow[] = users.listInvites();
      res.json({ ok: true, invites });
    });
  });

  app.post('/api/invites', (req, res) => {
    withAdmin(req, res, () => {
      const { note, count } = (req.body ?? {}) as { note?: string; count?: number };
      const invites = users.createInvites(String(note ?? ''), Number(count ?? 1));
      res.json({ ok: true, invites });
    });
  });

  app.delete('/api/invites/:code', (req, res) => {
    withAdmin(req, res, () => {
      const ok = users.revokeInvite(String(req.params.code ?? ''));
      res.json(ok ? { ok: true } : { ok: false, error: 'Код не найден или уже использован' });
    });
  });

  // ─── пул и сохранения ───
  /** PLAN-18: начальный пул сотрудников для экрана новой игры. */
  app.get('/api/pool', (req, res) => {
    withUser(req, res, () => {
      res.json({ ok: true, staff: initialPool() });
    });
  });

  // PLAN-34: мировой список игр всех аккаунтов — «место среди всех» в окне продаж
  // SER-28: личные сообщения между игроками (история, отправка, отметка прочтения)
  app.get('/api/dm/:userId', (req, res) => {
    withUser(req, res, (u) => {
      const peer = Number(req.params.userId);
      if (!Number.isInteger(peer) || peer <= 0 || peer === u.id) return void res.json({ ok: false, error: 'некорректный собеседник' });
      users.dmMarkRead(u.id, peer);
      res.json({ ok: true, rows: users.dmHistory(u.id, peer) });
    });
  });

  app.post('/api/dm/:userId', (req, res) => {
    withUser(req, res, (u) => {
      const peer = Number(req.params.userId);
      if (!Number.isInteger(peer) || peer <= 0 || peer === u.id) return void res.json({ ok: false, error: 'некорректный собеседник' });
      const text = String((req.body ?? {}).text ?? '').trim().slice(0, 1000);
      if (text.length < 1) return void res.json({ ok: false, error: 'пустое сообщение' });
      users.dmSend(u.id, peer, text);
      res.json({ ok: true });
    });
  });

  // SER-27: панель «Разговоры» — все игроки со статусом и последней игрой
  app.get('/api/roster', (req, res) => {
    withUser(req, res, (u) => {
      const now = Date.now();
      const unread = users.dmUnread(u.id);
      // SER-30: себя в списке разговоров не показываем
      const rows = users.roster().filter((r) => r.userId !== u.id).map((r) => {
        const live = sessions.server(r.userId) !== null;
        const typing = (sessions.server(r.userId)?.lastTypingAt ?? 0) > now - 5000;
        const idle = r.updated > 0 ? now - r.updated : Number.POSITIVE_INFINITY;
        const status = typing ? 'typing' : !live || idle > 20 * 60_000 ? 'offline' : idle > 3 * 60_000 ? 'away' : 'online';
        return { ...r, status, unread: unread[r.userId] ?? 0 };
      });
      res.json({ ok: true, me: u.id, rows });
    });
  });

  app.get('/api/leaderboard', (req, res) => {
    withUser(req, res, () => {
      res.json({ ok: true, ...users.leaderboard() });
    });
  });

  // SER-25: имя студии от GigaChat; занятые имена из выдачи отбрасываются, при полной занятости —
  // ещё раунд генерации. На провале LLM клиент подставит локальное название сам.
  app.get('/api/studio-name', (req, res) => {
    void withUser(req, res, async () => {
      try {
        const taken = new Set(users.studioNames().map((n) => n.trim().toLowerCase()));
        for (let round = 0; round < 3; round++) {
          const names = await generateStudioNames(8);
          const free = names.find((n) => !taken.has(n.trim().toLowerCase()));
          if (free) return void res.json({ ok: true, name: free });
        }
        res.json({ ok: false, error: 'все варианты заняты' });
      } catch (e) {
        console.warn('[gds] имя студии: LLM не ответил:', String(e).slice(0, 140));
        res.json({ ok: false, error: 'LLM недоступен' });
      }
    });
  });

  app.get('/api/difficulties', (req, res) => {
    withUser(req, res, () => {
      res.json({
        ok: true,
        difficulties: DIFFICULTY_IDS.map((id) => ({ id, label: DIFFICULTY[id].label, note: DIFFICULTY[id].note })),
      });
    });
  });

  app.get('/api/saves', (req, res) => {
    withUser(req, res, (u) => {
      const list: Array<SaveMeta & { active: boolean }> = users.listSaves(u.id)
        .map((s) => ({ ...s, active: sessions.activeSaveId(u.id) === s.id }));
      res.json({ ok: true, saves: list });
    });
  });

  app.post('/api/saves', (req, res) => {
    withUser(req, res, (u) => {
      const { studioName, staffIds, difficulty } = (req.body ?? {}) as { studioName?: string; staffIds?: unknown; difficulty?: unknown };
      const name = String(studioName ?? '').trim();
      const ids = Array.isArray(staffIds) ? staffIds.filter((x): x is string => typeof x === 'string') : [];
      if (name.length < 1 || name.length > 40) return void res.json({ ok: false, error: 'Название студии: 1–40 символов' });
      if (ids.length !== 2) return void res.json({ ok: false, error: 'Выберите двух сотрудников' });
      const id = sessions.create(u.id, { studioName: name, staffIds: ids, difficulty: isDifficultyId(difficulty) ? difficulty : 'normal' });
      res.json({ ok: true, id });
    });
  });

  app.post('/api/saves/:id/load', (req, res) => {
    withUser(req, res, (u) => {
      const id = Number(req.params.id);
      if (!users.getSave(u.id, id)) return void res.json({ ok: false, error: 'Сохранение не найдено' });
      sessions.load(u.id, id);
      res.json({ ok: true, id });
    });
  });

  app.delete('/api/saves/:id', (req, res) => {
    withUser(req, res, (u) => {
      const id = Number(req.params.id);
      sessions.drop(u.id, id);
      const ok = users.deleteSave(u.id, id);
      res.json(ok ? { ok: true } : { ok: false, error: 'Сохранение не найдено' });
    });
  });

  return who;
}
