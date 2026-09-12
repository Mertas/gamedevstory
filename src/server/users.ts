// PLAN-18/21: пользователи, сессии, сброс пароля и сохранения — в SQLite (data/users.db).
// В базе нет ни паролей, ни токенов в открытом виде:
//   pass_hash = "s2$N$r$p$<hex>" (scrypt + уникальная соль + перец сервера из GDS_PEPPER),
//   сессии  — sha256(токен), коды сброса — sha256(логин:код).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite';
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const USERS_DB_PATH = path.join(ROOT, 'data', 'users.db');

// node:sqlite грузим через require (как core/data/db.ts): vite/vitest не умеют его бандлить
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
const RESET_MS = 15 * 60 * 1000; // код восстановления — 15 минут
/** Публичный сервер: 6 символов мало. */
export const MIN_PASSWORD = 8;
/** scrypt: N=32768 (~32 МБ и десятки мс на проверку) вместо дефолтных 16384. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const;
/** Легаси-хэши в базе считались дефолтным scrypt и без перца — читаем их так же. */
const LEGACY_SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 } as const;
const KEYLEN = 64;
/** Перец: секрет сервера, которого нет в базе. Утечка одного файла БД не даёт перебирать пароли. */
const pepper = (): string => process.env.GDS_PEPPER ?? '';

export interface UserRow {
  id: number;
  login: string;
  email: string | null;
  created: number;
  /** владелец: выдаёт инвайты (окно «Инвайты»); сервер проверяет это сам, а не только клиент */
  admin: boolean;
}

/** Инвайт-код: одноразовый, выдаётся владельцем, «сгорает» при регистрации. */
export interface InviteRow {
  code: string;
  note: string | null;
  created: number;
  /** логин того, кто использовал код (null — свободен) */
  usedBy: string | null;
  usedAt: number | null;
}

export interface SaveMeta {
  id: number;
  studioName: string;
  created: number;
  updated: number;
  week: number;
  year: number;
  money: number;
}

type Res<T> = ({ ok: true } & T) | { ok: false; error: string };

interface RawUser extends UserRow {
  pass_hash: string;
  salt: string;
}

/** scrypt-хэш пароля: параметры схемы лежат в самой строке — есть путь для апгрейда. */
export function hashPassword(pass: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  const key = scryptSync(pepper() + pass, salt, KEYLEN, SCRYPT);
  return { salt, hash: `s2$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${key.toString('hex')}` };
}

interface StoredHash { n: number; r: number; p: number; hex: string; peppered: boolean }

const scryptOpts = (q: { n: number; r: number; p: number }) => ({ N: q.n, r: q.r, p: q.p, maxmem: SCRYPT.maxmem });

/** Разбор строки из базы: "s2$N$r$p$hex" (новая схема) либо просто hex (легаси: 16384, без перца). */
function parseStored(stored: string): StoredHash {
  const m = /^s2\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]+)$/.exec(stored);
  if (m) return { n: Number(m[1]), r: Number(m[2]), p: Number(m[3]), hex: m[4] ?? '', peppered: true };
  return { n: LEGACY_SCRYPT.N, r: LEGACY_SCRYPT.r, p: LEGACY_SCRYPT.p, hex: stored, peppered: false };
}

function verifyPassword(pass: string, salt: string, stored: string): boolean {
  const q = parseStored(stored);
  const got = scryptSync((q.peppered ? pepper() : '') + pass, salt, KEYLEN, scryptOpts(q));
  const want = Buffer.from(q.hex, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Пересчитать хэш при успешном входе: легаси-схема или слабые параметры. */
function needsRehash(stored: string): boolean {
  const q = parseStored(stored);
  return !q.peppered || q.n < SCRYPT.N || q.r < SCRYPT.r || q.p < SCRYPT.p;
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export class UserService {
  private readonly db: SqliteDatabase;

  constructor(dbPath?: string) {
    // GDS_USERS_DB: прогоны/тесты работают на своей базе и не трогают живую
    const file = dbPath ?? process.env.GDS_USERS_DB ?? USERS_DB_PATH;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL,
        admin INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saves (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        studio_name TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
        week INTEGER NOT NULL DEFAULT 1, year INTEGER NOT NULL DEFAULT 1, money REAL NOT NULL DEFAULT 0,
        payload TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resets (
        login TEXT PRIMARY KEY COLLATE NOCASE, code_hash TEXT NOT NULL, expires INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY, note TEXT, created INTEGER NOT NULL,
        used_by INTEGER, used_at INTEGER
      );
      -- PLAN-22: открытые комбо — прогресс аккаунта, живёт вне сейвов
      CREATE TABLE IF NOT EXISTS user_combos (
        user_id INTEGER NOT NULL, combo TEXT NOT NULL, first_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'start', PRIMARY KEY (user_id, combo)
      );
    `);
    this.migrate();
  }

  /** Миграции схемы: достраивает старые базы (колонки, появившиеся позже). */
  private migrate(): void {
    const cols = (this.db.prepare('PRAGMA table_info(users)').all() as Array<Record<string, unknown>>)
      .map((c) => String(c.name));
    if (!cols.includes('admin')) this.db.exec('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
    this.db.exec('PRAGMA journal_mode = WAL');
  }

  close(): void {
    this.db.close();
  }

  private userByLogin(login: string): RawUser | undefined {
    return this.db.prepare('SELECT id, login, email, created, admin, pass_hash, salt FROM users WHERE login = ?')
      .get(login) as RawUser | undefined;
  }

  /** Строка БД → наружу (admin: 0/1 → boolean). */
  private static toUser(u: RawUser | UserRow): UserRow {
    return { id: u.id, login: u.login, email: u.email, created: u.created, admin: Boolean(u.admin) };
  }

  /** Регистрация: логин уникален (без учёта регистра), пароль от MIN_PASSWORD символов. */
  register(login: string, password: string, email?: string): Res<{ user: UserRow }> {
    const name = login.trim();
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(name)) return { ok: false, error: 'Логин: 3–24 символа (латиница, цифры, _ . -)' };
    if (password.length < MIN_PASSWORD) return { ok: false, error: `Пароль — не короче ${MIN_PASSWORD} символов` };
    if (this.userByLogin(name)) return { ok: false, error: 'Такой логин уже занят' };
    const { salt, hash } = hashPassword(password);
    const created = Date.now();
    this.db.prepare('INSERT INTO users (login, email, pass_hash, salt, created, admin) VALUES (?, ?, ?, ?, ?, 0)')
      .run(name, email?.trim() || null, hash, salt, created);
    const u = this.userByLogin(name)!;
    return { ok: true, user: UserService.toUser(u) };
  }

  /** Вход: проверка пароля + выдача токена сессии. */
  login(login: string, password: string): Res<{ user: UserRow; token: string }> {
    const u = this.userByLogin(login.trim());
    if (!u || !verifyPassword(password, u.salt, u.pass_hash)) return { ok: false, error: 'Неверный логин или пароль' };
    // старый хэш (без перца/слабые параметры) молча апгрейдим, пока пароль под рукой
    if (needsRehash(u.pass_hash)) {
      const fresh = hashPassword(password);
      this.db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(fresh.hash, fresh.salt, u.id);
    }
    const token = randomBytes(32).toString('hex'); // клиенту — открытый токен
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?, ?, ?, ?)')
      .run(sha256(token), u.id, now, now + SESSION_MS); // в базе — только его хэш
    return { ok: true, user: UserService.toUser(u), token };
  }

  /** Пользователь по токену сессии (просроченные вычищаются). В базе лежит sha256(токен). */
  userByToken(token: string): UserRow | null {
    if (!token) return null;
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    const row = this.db.prepare(
      `SELECT u.id, u.login, u.email, u.created, u.admin FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires >= ?`,
    ).get(sha256(token), Date.now()) as UserRow | undefined;
    return row ? UserService.toUser(row) : null;
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
  }

  /** Сколько активных сессий у игрока (диагностика/отладка). */
  countSessions(userId: number): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND expires >= ?').get(userId, Date.now()) as { n: number };
    return Number(row.n);
  }

  /** Сменить пароль пользователя (владелец/скрипт обслуживания). */
  setPassword(userId: number, password: string): boolean {
    if (password.length < MIN_PASSWORD) return false;
    const { salt, hash } = hashPassword(password);
    this.db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); // старые сессии — вон
    return true;
  }

  /** Код восстановления: 6 цифр; хранится хэшем, живёт 15 минут. */
  startReset(login: string): Res<{ login: string; code: string; to: string }> {
    const u = this.userByLogin(login.trim());
    if (!u) return { ok: false, error: 'Пользователь не найден' };
    const code = String(randomInt(100000, 999999));
    this.db.prepare('INSERT OR REPLACE INTO resets (login, code_hash, expires) VALUES (?, ?, ?)')
      .run(u.login, sha256(`${u.login}:${code}`), Date.now() + RESET_MS);
    return { ok: true, login: u.login, code, to: u.email ?? u.login };
  }

  confirmReset(login: string, code: string, password: string): Res<{ user: UserRow }> {
    const name = login.trim();
    if (password.length < MIN_PASSWORD) return { ok: false, error: `Пароль — не короче ${MIN_PASSWORD} символов` };
    const row = this.db.prepare('SELECT code_hash, expires FROM resets WHERE login = ?').get(name) as { code_hash: string; expires: number } | undefined;
    if (!row || row.expires < Date.now()) return { ok: false, error: 'Код истёк — запросите новый' };
    if (row.code_hash !== sha256(`${name}:${code.trim()}`)) return { ok: false, error: 'Неверный код' };
    const u = this.userByLogin(name);
    if (!u) return { ok: false, error: 'Пользователь не найден' };
    const { salt, hash } = hashPassword(password);
    this.db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, u.id);
    this.db.prepare('DELETE FROM resets WHERE login = ?').run(name);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // старые сессии — вон
    return { ok: true, user: UserService.toUser(u) };
  }

  /** Сид пользователя (Mertas) — создаётся при первом старте, если ещё нет; admin — владелец. */
  ensureUser(login: string, password: string, email?: string, admin = false): void {
    // сид — внутренний: политику длины не применяем (иначе установка «с нуля» осталась бы без владельца)
    if (!this.userByLogin(login)) {
      const { salt, hash } = hashPassword(password);
      this.db.prepare('INSERT INTO users (login, email, pass_hash, salt, created, admin) VALUES (?, ?, ?, ?, ?, ?)')
        .run(login.trim(), email?.trim() || null, hash, salt, Date.now(), admin ? 1 : 0);
    }
    // admin выставляем и существующему пользователю: базы, созданные до появления колонки
    if (admin) this.db.prepare('UPDATE users SET admin = 1 WHERE login = ?').run(login.trim());
  }

  // ─── инвайты (регистрация только по коду владельца) ───

  /** Алфавит без похожих символов (0/O, 1/I) — код диктуют голосом и копируют руками. */
  private static readonly INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** Новые одноразовые коды вида GDS-XXXX-XXXX. */
  createInvites(note: string | null, count = 1): InviteRow[] {
    const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const now = Date.now();
    const alpha = UserService.INVITE_ALPHABET;
    const part = (len: number): string => Array.from({ length: len }, () => alpha[randomInt(0, alpha.length)] ?? 'A').join('');
    const out: InviteRow[] = [];
    for (let i = 0; i < n; i++) {
      let code = '';
      do { code = `GDS-${part(4)}-${part(4)}`; } while (this.db.prepare('SELECT 1 FROM invites WHERE code = ?').get(code));
      const clean = note?.trim() || null;
      this.db.prepare('INSERT INTO invites (code, note, created, used_by, used_at) VALUES (?, ?, ?, NULL, NULL)')
        .run(code, clean, now);
      out.push({ code, note: clean, created: now, usedBy: null, usedAt: null });
    }
    return out;
  }

  listInvites(): InviteRow[] {
    const rows = this.db.prepare(
      `SELECT i.code, i.note, i.created, i.used_at AS usedAt, u.login AS usedBy
       FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created DESC LIMIT 200`,
    ).all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      code: String(r.code),
      note: r.note === null || r.note === undefined ? null : String(r.note),
      created: Number(r.created),
      usedBy: r.usedBy === null || r.usedBy === undefined ? null : String(r.usedBy),
      usedAt: r.usedAt === null || r.usedAt === undefined ? null : Number(r.usedAt),
    }));
  }

  /** Код свободен и годится для регистрации. */
  inviteValid(code: string): boolean {
    const c = code.trim().toUpperCase();
    if (!c) return false;
    const row = this.db.prepare('SELECT used_by FROM invites WHERE code = ?').get(c) as Record<string, unknown> | undefined;
    return Boolean(row) && (row?.used_by === null || row?.used_by === undefined);
  }

  /** Сжечь код за пользователем (после успешной регистрации). */
  consumeInvite(code: string, userId: number): boolean {
    const info = this.db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL')
      .run(userId, Date.now(), code.trim().toUpperCase());
    return Number(info.changes) > 0;
  }

  /** Отозвать свободный код (использованные не трогаем — это история). */
  revokeInvite(code: string): boolean {
    const info = this.db.prepare('DELETE FROM invites WHERE code = ? AND used_by IS NULL').run(code.trim().toUpperCase());
    return Number(info.changes) > 0;
  }

  // ─── открытые комбо (PLAN-22: уровень игрока, живёт в аккаунте, а не в сейве) ───

  /** Все пары «жанр|тип», открытые игроком когда-либо. */
  listCombos(userId: number): string[] {
    const rows = this.db.prepare('SELECT combo FROM user_combos WHERE user_id = ? ORDER BY first_at').all(userId) as Array<{ combo: string }>;
    return rows.map((r) => String(r.combo));
  }

  /** Дописать пары (только новые): набор открытий никогда не уменьшается. */
  addCombos(userId: number, combos: string[], source = 'start'): number {
    if (!combos.length) return 0;
    const st = this.db.prepare('INSERT OR IGNORE INTO user_combos (user_id, combo, first_at, source) VALUES (?, ?, ?, ?)');
    const now = Date.now();
    let added = 0;
    for (const c of combos) if (Number(st.run(userId, String(c), now, source).changes) > 0) added++;
    return added;
  }

  /** Сколько комбо открыто — это и есть уровень игрока. */
  combosCount(userId: number): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM user_combos WHERE user_id = ?').get(userId) as { n: number };
    return Number(row.n);
  }

  // ─── сохранения ───

  listSaves(userId: number): SaveMeta[] {
    const rows = this.db.prepare(
      'SELECT id, studio_name AS studioName, created, updated, week, year, money FROM saves WHERE user_id = ? ORDER BY updated DESC',
    ).all(userId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      studioName: String(r.studioName),
      created: Number(r.created),
      updated: Number(r.updated),
      week: Number(r.week),
      year: Number(r.year),
      money: Number(r.money),
    }));
  }

  createSave(userId: number, studioName: string, payload: string, week = 1, year = 1, money = 0): number {
    const now = Date.now();
    const info = this.db.prepare(
      'INSERT INTO saves (user_id, studio_name, created, updated, week, year, money, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, studioName, now, now, week, year, money, payload);
    return Number(info.lastInsertRowid);
  }

  getSave(userId: number, saveId: number): (SaveMeta & { payload: string }) | null {
    const row = this.db.prepare(
      `SELECT id, studio_name AS studioName, created, updated, week, year, money, payload
       FROM saves WHERE id = ? AND user_id = ?`,
    ).get(saveId, userId) as (SaveMeta & { payload: string }) | undefined;
    return row ?? null;
  }

  /** Автосейв: обновляет полезную нагрузку и метаданные (студия/дата/деньги). */
  updateSave(userId: number, saveId: number, payload: string, week: number, year: number, money: number): boolean {
    const info = this.db.prepare(
      'UPDATE saves SET payload = ?, week = ?, year = ?, money = ?, updated = ? WHERE id = ? AND user_id = ?',
    ).run(payload, week, year, money, Date.now(), saveId, userId);
    return Number(info.changes) > 0;
  }

  deleteSave(userId: number, saveId: number): boolean {
    const info = this.db.prepare('DELETE FROM saves WHERE id = ? AND user_id = ?').run(saveId, userId);
    return Number(info.changes) > 0;
  }
}
