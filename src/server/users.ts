// PLAN-18: пользователи, сессии, сброс пароля и сохранения — в SQLite (data/users.db).
// Пароли: scrypt + соль (node:crypto, без новых зависимостей). Токены сессий: 32 случайных байта.
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

export interface UserRow {
  id: number;
  login: string;
  email: string | null;
  created: number;
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

/** scrypt-хэш пароля (соль генерируется, если не передана). */
export function hashPassword(pass: string, salt = randomBytes(16).toString('hex')): { salt: string; hash: string } {
  return { salt, hash: scryptSync(pass, salt, 64).toString('hex') };
}

function verifyPassword(pass: string, salt: string, hash: string): boolean {
  const got = scryptSync(pass, salt, 64);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
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
        email TEXT, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, created INTEGER NOT NULL
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
    `);
  }

  close(): void {
    this.db.close();
  }

  private userByLogin(login: string): RawUser | undefined {
    return this.db.prepare('SELECT id, login, email, created, pass_hash, salt FROM users WHERE login = ?')
      .get(login) as RawUser | undefined;
  }

  /** Регистрация: логин уникален (без учёта регистра), пароль ≥ 6 символов. */
  register(login: string, password: string, email?: string): Res<{ user: UserRow }> {
    const name = login.trim();
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(name)) return { ok: false, error: 'Логин: 3–24 символа (латиница, цифры, _ . -)' };
    if (password.length < 6) return { ok: false, error: 'Пароль — не короче 6 символов' };
    if (this.userByLogin(name)) return { ok: false, error: 'Такой логин уже занят' };
    const { salt, hash } = hashPassword(password);
    const created = Date.now();
    this.db.prepare('INSERT INTO users (login, email, pass_hash, salt, created) VALUES (?, ?, ?, ?, ?)')
      .run(name, email?.trim() || null, hash, salt, created);
    const u = this.userByLogin(name)!;
    return { ok: true, user: { id: u.id, login: u.login, email: u.email, created: u.created } };
  }

  /** Вход: проверка пароля + выдача токена сессии. */
  login(login: string, password: string): Res<{ user: UserRow; token: string }> {
    const u = this.userByLogin(login.trim());
    if (!u || !verifyPassword(password, u.salt, u.pass_hash)) return { ok: false, error: 'Неверный логин или пароль' };
    const token = randomBytes(32).toString('hex');
    const now = Date.now();
    this.db.prepare('INSERT INTO sessions (token, user_id, created, expires) VALUES (?, ?, ?, ?)')
      .run(token, u.id, now, now + SESSION_MS);
    return { ok: true, user: { id: u.id, login: u.login, email: u.email, created: u.created }, token };
  }

  /** Пользователь по токену сессии (просроченные вычищаются). */
  userByToken(token: string): UserRow | null {
    if (!token) return null;
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    const row = this.db.prepare(
      `SELECT u.id, u.login, u.email, u.created FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires >= ?`,
    ).get(token, Date.now()) as UserRow | undefined;
    return row ?? null;
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
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
    if (password.length < 6) return { ok: false, error: 'Пароль — не короче 6 символов' };
    const row = this.db.prepare('SELECT code_hash, expires FROM resets WHERE login = ?').get(name) as { code_hash: string; expires: number } | undefined;
    if (!row || row.expires < Date.now()) return { ok: false, error: 'Код истёк — запросите новый' };
    if (row.code_hash !== sha256(`${name}:${code.trim()}`)) return { ok: false, error: 'Неверный код' };
    const u = this.userByLogin(name);
    if (!u) return { ok: false, error: 'Пользователь не найден' };
    const { salt, hash } = hashPassword(password);
    this.db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').run(hash, salt, u.id);
    this.db.prepare('DELETE FROM resets WHERE login = ?').run(name);
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); // старые сессии — вон
    return { ok: true, user: { id: u.id, login: u.login, email: u.email, created: u.created } };
  }

  /** Сид пользователя (Mertas) — создаётся при первом старте, если ещё нет. */
  ensureUser(login: string, password: string, email?: string): void {
    if (!this.userByLogin(login)) this.register(login, password, email);
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
