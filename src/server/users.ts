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
import { drawMinigame, type MinigameBag } from '../shared/minigames';

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
  /** M6: уровень сложности партии (старые сейвы — 'normal') */
  difficulty: string;
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

/** PLAN-34: строка мирового списка (игра аккаунта по проданным копиям). */
export interface LeaderboardRow {
  name: string;
  units: number;
  revenue: number;
  studio: string;
}

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
      CREATE TABLE IF NOT EXISTS autopilot_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL,
        build TEXT, kind TEXT NOT NULL, target TEXT, label TEXT, step_kind TEXT, app TEXT,
        dom TEXT, extra TEXT
      );
      CREATE TABLE IF NOT EXISTS dm_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user INTEGER NOT NULL,
        to_user INTEGER NOT NULL,
        text TEXT NOT NULL,
        created INTEGER NOT NULL,
        read_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS dm_pair ON dm_messages(from_user, to_user, id);
      CREATE INDEX IF NOT EXISTS dm_inbox ON dm_messages(to_user, read_at);
      CREATE TABLE IF NOT EXISTS user_combos (
        user_id INTEGER NOT NULL, combo TEXT NOT NULL, first_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'start', PRIMARY KEY (user_id, combo)
      );
      -- PLAN-39/40: флаги аккаунта (мешок мини-игр и будущие награды) — прогресс вне сейвов
      CREATE TABLE IF NOT EXISTS user_flags (
        user_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL,
        PRIMARY KEY (user_id, key)
      );
    `);
    this.migrate();
  }

  /** Миграции схемы: достраивает старые базы (колонки, появившиеся позже). */
  private migrate(): void {
    const cols = (this.db.prepare('PRAGMA table_info(users)').all() as Array<Record<string, unknown>>)
      .map((c) => String(c.name));
    if (!cols.includes('admin')) this.db.exec('ALTER TABLE users ADD COLUMN admin INTEGER NOT NULL DEFAULT 0');
    // M6: уровень сложности партии (старые сейвы без колонки — «нормальный»)
    const saveCols = (this.db.prepare('PRAGMA table_info(saves)').all() as Array<Record<string, unknown>>)
      .map((c) => String(c.name));
    if (!saveCols.includes('difficulty')) this.db.exec("ALTER TABLE saves ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'normal'");
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

  /**
   * PLAN-26: журнал промахов автопилота (цель не найдена/скрыта/перекрыта) — пишется из клиента,
   * читается sqlite-запросом. Храним последние 4000 строк: это диагностика, а не телеметрия.
   */
  logAutopilot(entry: Record<string, unknown>): void {
    try {
      this.db.prepare(
        `INSERT INTO autopilot_log (ts, build, kind, target, label, step_kind, app, dom, extra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        Date.now(),
        entry.serverBuild != null ? String(entry.serverBuild).slice(0, 64) : null,
        String(entry.kind ?? 'unknown').slice(0, 64),
        entry.target != null ? String(entry.target).slice(0, 140) : null,
        entry.label != null ? String(entry.label).slice(0, 220) : null,
        entry.stepKind != null ? String(entry.stepKind).slice(0, 32) : null,
        (entry.dom as Record<string, unknown> | null)?.windowApp != null
          ? String((entry.dom as Record<string, unknown>).windowApp).slice(0, 64) : null,
        JSON.stringify(entry.dom ?? null).slice(0, 4000),
        JSON.stringify({ ...entry, kind: undefined, target: undefined, label: undefined, stepKind: undefined, dom: undefined }).slice(0, 6000),
      );
      this.db.prepare('DELETE FROM autopilot_log WHERE id < (SELECT MAX(id) - 4000 FROM autopilot_log)').run();
    } catch (e) {
      console.error('[gds] лог автопилота не записался:', String(e).slice(0, 200));
    }
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

  // ─── PLAN-39/40: флаги аккаунта (мешок мини-игр и будущие награды) ───

  getFlag(userId: number, key: string): string | null {
    const row = this.db.prepare('SELECT value FROM user_flags WHERE user_id = ? AND key = ?').get(userId, key) as { value: string } | undefined;
    return row ? String(row.value) : null;
  }

  setFlag(userId: number, key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO user_flags (user_id, key, value, updated) VALUES (?, ?, ?, ?)')
      .run(userId, key, value, Date.now());
  }

  /** PLAN-39: следующая мини-игра из мешка аккаунта — все четыре по разу, затем новый круг. */
  nextMinigameId(userId: number): string {
    let bag: MinigameBag = { q: [], last: null };
    try {
      const raw = this.getFlag(userId, 'mg_bag');
      if (raw) {
        const p = JSON.parse(raw) as Partial<MinigameBag>;
        bag = { q: Array.isArray(p.q) ? p.q.map(String) : [], last: p.last ? String(p.last) : null };
      }
    } catch {
      bag = { q: [], last: null };
    }
    const { id, bag: next } = drawMinigame(bag, Math.random);
    this.setFlag(userId, 'mg_bag', JSON.stringify(next));
    return id;
  }

  // ─── сохранения ───

  /**
   * PLAN-34: мировой список — все выпущенные игры всех аккаунтов, по проданным копиям.
   * Читает истории из payload'ов сохранений; кэш 60 с (окно продаж спрашивает часто).
   */
  leaderboard(limit = 500): { rows: LeaderboardRow[]; total: number } {
    const now = Date.now();
    if (this.lbCache && now - this.lbCache.at < 60_000) return this.lbCache.data;
    const rows: LeaderboardRow[] = [];
    const saves = this.db.prepare('SELECT studio_name AS studio, payload FROM saves').all() as Array<{
      studio: string;
      payload: string;
    }>;
    for (const s of saves) {
      try {
        const parsed = JSON.parse(s.payload) as {
          game?: { history?: Array<{ name?: string; units?: number; revenue?: number; paidUnits?: number; paidRevenue?: number }> };
        };
        for (const h of parsed.game?.history ?? []) {
          if (!h?.name) continue;
          rows.push({
            name: String(h.name),
            units: h.paidUnits ?? h.units ?? 0, // та же основа сравнения, что в окне продаж
            revenue: Math.round(h.paidRevenue ?? h.revenue ?? 0),
            studio: String(s.studio ?? ''),
          });
        }
      } catch {
        /* битый payload — пропускаем */
      }
    }
    rows.sort((a, b) => b.units - a.units);
    const data = { rows: rows.slice(0, limit), total: rows.length };
    this.lbCache = { at: now, data };
    return data;
  }

  private lbCache: { at: number; data: { rows: LeaderboardRow[]; total: number } } | null = null;

  /**
   * SER-27: игроки для панели «Разговоры»: логин, студия, последняя игра, время записи сейва.
   * Сканируем по одному свежему сейву на игрока — панель небольшая, стоимость ок.
   */
  roster(): Array<{ userId: number; login: string; studio: string; updated: number; lastGame: { name: string; score: number; units: number } | null }> {
    const us = this.db.prepare('SELECT id, login FROM users ORDER BY id').all() as Array<{ id: number; login: string }>;
    const getSave = this.db.prepare('SELECT studio_name AS studio, updated, payload FROM saves WHERE user_id = ? ORDER BY updated DESC LIMIT 1');
    return us.map((u) => {
      const s = getSave.get(u.id) as { studio: unknown; updated: unknown; payload: unknown } | undefined;
      let lastGame: { name: string; score: number; units: number } | null = null;
      if (s) {
        try {
          const p = JSON.parse(String(s.payload)) as {
            game?: { history?: Array<{ name?: string; score?: number; units?: number; paidUnits?: number }> };
          };
          const h = p.game?.history?.[(p.game.history?.length ?? 0) - 1];
          if (h?.name) {
            lastGame = {
              name: String(h.name),
              score: Math.round(h.score ?? 0),
              units: Math.round((h.paidUnits ?? h.units ?? 0) * 10) / 10,
            };
          }
        } catch {
          /* битый payload — просто без игры */
        }
      }
      return {
        userId: Number(u.id),
        login: String(u.login),
        studio: s ? String(s.studio) : '',
        updated: s ? Number(s.updated) : 0,
        lastGame,
      };
    });
  }

  // ─── SER-28: личные сообщения между игроками ───

  /** История пары (последние limit, от старых к новым). */
  dmHistory(a: number, b: number, limit = 100): Array<{ id: number; from: number; to: number; text: string; created: number; read: boolean }> {
    const rows = this.db
      .prepare(
        `SELECT id, from_user AS f, to_user AS t, text, created, read_at AS readAt FROM dm_messages
          WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
          ORDER BY id DESC LIMIT ?`,
      )
      .all(a, b, b, a, limit) as Array<{ id: number; f: number; t: number; text: string; created: number; readAt: number | null }>;
    return rows.reverse().map((r) => ({
      id: Number(r.id),
      from: Number(r.f),
      to: Number(r.t),
      text: String(r.text),
      created: Number(r.created),
      read: r.readAt != null,
    }));
  }

  dmSend(from: number, to: number, text: string): void {
    this.db.prepare('INSERT INTO dm_messages (from_user, to_user, text, created) VALUES (?, ?, ?, ?)').run(from, to, text, Date.now());
  }

  dmMarkRead(me: number, peer: number): void {
    this.db.prepare('UPDATE dm_messages SET read_at = ? WHERE to_user = ? AND from_user = ? AND read_at IS NULL').run(Date.now(), me, peer);
  }

  /** Непрочитанные по отправителям: { userId: count }. */
  dmUnread(me: number): Record<number, number> {
    const rows = this.db
      .prepare('SELECT from_user AS f, COUNT(*) AS n FROM dm_messages WHERE to_user = ? AND read_at IS NULL GROUP BY from_user')
      .all(me) as Array<{ f: number; n: number }>;
    const out: Record<number, number> = {};
    for (const r of rows) out[Number(r.f)] = Number(r.n);
    return out;
  }

  userLogin(id: number): string | null {
    const r = this.db.prepare('SELECT login FROM users WHERE id = ?').get(id) as { login?: unknown } | undefined;
    return r ? String(r.login) : null;
  }

  /** SER-25: все занятые названия студий (для гарантированно свободного от LLM). */
  studioNames(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT studio_name AS n FROM saves').all() as Array<{ n: unknown }>;
    return rows.map((r) => String(r.n));
  }

  listSaves(userId: number): SaveMeta[] {
    const rows = this.db.prepare(
      'SELECT id, studio_name AS studioName, created, updated, week, year, money, difficulty FROM saves WHERE user_id = ? ORDER BY updated DESC',
    ).all(userId) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      studioName: String(r.studioName),
      created: Number(r.created),
      updated: Number(r.updated),
      week: Number(r.week),
      year: Number(r.year),
      money: Number(r.money),
      difficulty: String(r.difficulty ?? 'normal'),
    }));
  }

  createSave(userId: number, studioName: string, payload: string, week = 1, year = 1, money = 0, difficulty = 'normal'): number {
    const now = Date.now();
    const info = this.db.prepare(
      'INSERT INTO saves (user_id, studio_name, created, updated, week, year, money, payload, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, studioName, now, now, week, year, money, payload, difficulty);
    return Number(info.lastInsertRowid);
  }

  getSave(userId: number, saveId: number): (SaveMeta & { payload: string }) | null {
    const row = this.db.prepare(
      `SELECT id, studio_name AS studioName, created, updated, week, year, money, difficulty, payload
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

  /**
   * PLAN-18+: «Удалить весь прогресс» — все сохранения, достижения (открытые комбо/звание)
   * и флаги аккаунта (мешок мини-игр и будущие награды). Сам аккаунт, вход и инвайты
   * не трогаются. Действие необратимо; живую сессию игрока роняет вызывающий (api.ts).
   */
  wipeProgress(userId: number): { saves: number; combos: number; flags: number } {
    const saves = Number(this.db.prepare('DELETE FROM saves WHERE user_id = ?').run(userId).changes);
    const combos = Number(this.db.prepare('DELETE FROM user_combos WHERE user_id = ?').run(userId).changes);
    const flags = Number(this.db.prepare('DELETE FROM user_flags WHERE user_id = ?').run(userId).changes);
    return { saves, combos, flags };
  }
}
