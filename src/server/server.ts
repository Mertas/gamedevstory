// Локальный сервер: WebSocket (игра + чат) + /api/save + статика dist.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Request } from 'express';
import { PORT, HOST, gigaReady } from './config';
import { type ClientAction } from './game';
import { llmStatus } from './giga';
import { gameVersion, buildId } from './version';
import { createSeqGuard } from './wire';
import { registerApi } from './api';
import { createMailer } from './mailer';
import { SessionRegistry } from './sessions';
import { UserService } from './users';
import { setAutopilotLogSink } from './actions';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = path.join(ROOT, 'dist');

// SRV-06: seq/ack на WS-канале — клиент повторяет недоставленные действия после обрыва
// (очередь с TTL); guard отсекает уже обработанные (их ack потерялся вместе с сокетом).
// PLAN-18: guard — на пользователя (у каждого своя партия и свой поток действий)
const guards = new Map<number, ReturnType<typeof createSeqGuard>>();

// SRV-13: heartbeat — полумёртвый сокет (Wi-Fi уснул, ноут в суспенде) не выглядит закрытым:
// пингуем и закрываем молчунов. Backpressure: нечитающему клиенту снапшоты не копим — они
// полные, свежий придёт после разгрузки; иначе буфер рос бы бесконечно.
const HEARTBEAT_MS = 30_000;
const MAX_BUFFERED = 1_000_000;
type LiveSocket = WebSocket & { isAlive?: boolean };
function sendSafe(ws0: WebSocket, payload: string): void {
  if (ws0.readyState !== ws0.OPEN) return;
  if (ws0.bufferedAmount > MAX_BUFFERED) return; // SRV-13: клиент не читает — не копим хвост
  ws0.send(payload);
}

const app = express();
app.use(express.json({ limit: '8mb' }));
// за nginx: реальный IP клиента приходит в X-Forwarded-For (нужен для rate-limit)
app.set('trust proxy', 'loopback');

const server = app.listen(PORT, HOST, () => {
  console.log(`[gds] сервер на http://${HOST}:${PORT}; GigaChat: ${gigaReady ? `подключён (аккаунтов: ${llmStatus().gigaAccounts})` : 'НЕТ ключей (чат будет молчать)'}`);
});

// PLAN-18: пользователи, почта, реестр партий — у каждого пользователя своя игровая сессия.
const users = new UserService();
// PLAN-26: журнал промахов автопилота пишем в ту же базу (users.db), читаем sqlite-запросом
setAutopilotLogSink((entry) => users.logAutopilot({ serverBuild: buildId(), ...entry }));
// прод без перца = пароли, которые можно перебирать по одной базе: не стартуем
if (process.env.PROD === '1' && !process.env.GDS_PEPPER) {
  console.error('[gds] GDS_PEPPER не задан — в проде пароли без перца запрещены');
  process.exit(1);
}
users.ensureUser('Mertas', process.env.GDS_OWNER_PASSWORD ?? '123456', undefined, true); // сид-владелец (пароль — только для чистой установки)
const mail = createMailer();
const registry = new SessionRegistry(users);
// REST авторизации/сохранений; who(req) — пользователь по cookie сессии (ниже — для WS)
const who = registerApi(app, { users, mail, sessions: registry });
/** Активная партия по запросу (для /api/save: у каждого пользователя свой экспорт). */
const activeGame = (req: Request) => {
  const u = who(req);
  return u ? registry.server(u.id) : null;
};

// SRV-07/SRV-08: последний рубеж — не терять партию при падении/остановке
process.on('uncaughtException', (e) => {
  console.error('[gds] uncaughtException:', e);
  try { registry.disposeAll(); } catch { /* noop */ }
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('[gds] unhandledRejection:', String(e).slice(0, 300));
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[gds] ${sig}: сохраняю партии игроков…`);
    try { registry.disposeAll(); } catch { /* noop */ }
    process.exit(0);
  });
}

// ─── WebSocket: игра и чат ───
// PLAN-45: крупные кадры (первый снапшот, meta) — со сжатием; мелкие кадры не трогаем (порог)
const wss = new WebSocketServer({ server, perMessageDeflate: { threshold: 4096 } });
// SRV-14: без обработчика 'error' необработанная ошибка сокета роняла процесс
wss.on('error', (e) => console.error('[gds] wss error:', String(e).slice(0, 300)));
wss.on('connection', (ws, req) => {
  if (req.url !== '/ws') {
    ws.close(1008, 'wrong path');
    return;
  }
  // PLAN-18: партия — по cookie сессии; без входа или без загруженного сохранения не пускаем
  const user = who(req);
  if (!user) {
    ws.close(1008, 'нужен вход');
    return;
  }
  // PLAN-27: без живой сессии поднимаем последнюю партию игрока (переживает перезапуск сервера)
  const game = registry.attach(user.id);
  if (!game) {
    ws.close(1008, 'нет активной партии');
    return;
  }
  const seqGuard = guards.get(user.id) ?? createSeqGuard();
  guards.set(user.id, seqGuard);
  ws.on('error', (e) => console.error('[gds] ws error:', String(e).slice(0, 300))); // SRV-14
  const live = ws as LiveSocket;
  live.isAlive = true; // SRV-13: сердцебиение — молчуна отключит heartbeat-тик
  ws.on('pong', () => { live.isAlive = true; });
  ws.send(JSON.stringify({ type: 'meta', data: game.meta() }));
  // PLAN-45: полный снапшот — только вход/восстановление; дальше кадры-диффы {state2}.
  // Новый клиент и переподключение (в т.ч. на паузе — событие висит, тикер молчит) получают
  // полное состояние прямо здесь, поэтому get_state при открытии сокета больше не нужен.
  let myVer = -1; // версия состояния у этого сокета (-1 = ещё не синхронизирован)
  let hidden = false; // фоновая вкладка: кадры не шлём, они копятся в кольце (догон при возврате)
  // Отправка с учётом backpressure: если клиент не читает (буфер полон) — myVer НЕ двигаем,
  // иначе кадр потерялся бы молча; следующий триггер даст догон из кольца (или полный снапшот).
  const trySend = (json: string, ver: number): void => {
    if (ws.readyState !== ws.OPEN || ws.bufferedAmount > MAX_BUFFERED) return;
    ws.send(json);
    myVer = ver;
  };
  const sendDelta = (): void => {
    if (hidden) return;
    const p = game.syncPayload(myVer);
    if (!p) return;
    trySend(p.json, p.ver);
  };
  {
    const p = game.syncPayloadFull();
    trySend(p.json, p.ver);
  }
  const unsub = game.subscribeSync((f) => {
    if (f.full) {
      // состояние заменено целиком (импорт сейва / новая партия) — только полный снапшот
      const p = game.syncPayloadFull();
      trySend(p.json, p.ver);
      return;
    }
    sendDelta();
  });
  ws.on('message', (raw) => {
    let seq: number | undefined;
    try {
      const msg = JSON.parse(String(raw)) as ClientAction & { sid?: string; seq?: number };
      seq = typeof msg.seq === 'number' ? msg.seq : undefined;
      // PLAN-45: видимость вкладки — в фоне кадры не шлём (вне seq-очереди, без ack)
      if (msg.type === 'visibility') {
        hidden = msg.visible === false;
        if (!hidden) sendDelta(); // вернулись из фона — догон кадров (или полный снапшот)
        return;
      }
      // PLAN-45: полный снапшот — точечно этому сокету (раньше уходил broadcast'ом всем)
      if (msg.type === 'get_state') {
        const p = game.syncPayloadFull();
        trySend(p.json, p.ver);
        if (seq !== undefined) sendSafe(ws, JSON.stringify({ type: 'action_result', seq, ok: true }));
        return;
      }
      if (seqGuard.check(typeof msg.sid === 'string' ? msg.sid : null, seq) === 'dup') {
        // SRV-06: повтор при переподключении — уже обрабатывали, только подтверждаем
        sendSafe(ws, JSON.stringify({ type: 'action_result', seq, ok: true, dup: true }));
        return;
      }
      game.handle(msg);
      const ar = game.actionResult();
      const ok = !(ar && ar.ok === false);
      // SRV-06: ack на каждое действие (не только на ошибку) — клиент снимает его с очереди
      if (seq !== undefined) {
        sendSafe(ws, JSON.stringify({ type: 'action_result', seq, ok, ...(ok ? {} : { error: ar?.error }) }));
      } else if (!ok) {
        sendSafe(ws, JSON.stringify({ type: 'action_result', error: ar?.error }));
      }
    } catch (e) {
      console.error('[gds] WS-сообщение не обработано:', String(e).slice(0, 300));
      sendSafe(ws, JSON.stringify({
        type: 'action_result', ...(seq !== undefined ? { seq } : {}), ok: false, error: String(e).slice(0, 200),
      }));
    }
  });
  // SRV-05: каждая вкладка слушает результат сама; сюжет несёт reqId запроса
  const unsubStory = game.addStoryListener((res) => sendSafe(ws, JSON.stringify({ type: 'story_result', ...res })));
  const unsubSteps = game.subscribeSteps((step) => sendSafe(ws, JSON.stringify({ type: 'autopilot_step', step })));
  ws.on('close', () => {
    unsub();
    unsubSteps();
    unsubStory();
  });
});

// SRV-13: раз в 30 с — живым ping, молчунам terminate (полумёртвый TCP сам не закрывается)
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    const s = client as LiveSocket;
    if (s.isAlive === false) { s.terminate(); continue; }
    s.isAlive = false;
    try { s.ping(); } catch { /* сокет уже мёртв — добьём следующим тиком */ }
  }
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

// ─── HTTP: экспорт/импорт сейва ───
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: llmStatus(), version: gameVersion(), build: buildId() });
});

app.get('/api/save', (req, res) => {
  const game = activeGame(req);
  if (!game) return void res.status(401).json({ ok: false, error: 'Нужен вход и активная партия' });
  res.type('application/json').send(game.exportSave());
});

app.post('/api/save', (req, res) => {
  const game = activeGame(req);
  if (!game) return void res.status(401).json({ ok: false, error: 'Нужен вход и активная партия' });
  const ok = game.importSave(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  res.json({ ok });
});

// ─── музыка для Winamp (public/music, рекурсивно по подкаталогам) ───
// Метаданные (теги mp3) извлекаются НА СЕРВЕРЕ и кешируются в SQLite
// по (имя файла, размер, дата изменения): повторные запросы мгновенны.
const MUSIC_DIR = path.join(ROOT, 'public', 'music');
const MUSIC_META_DB = path.join(ROOT, 'data', 'music-meta.sqlite');

import { DatabaseSync } from 'node:sqlite';
import { parseFile } from 'music-metadata';

let musicDb: DatabaseSync | null = null;
try {
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  musicDb = new DatabaseSync(MUSIC_META_DB);
  musicDb.exec(`CREATE TABLE IF NOT EXISTS meta (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL,
    mtime INTEGER NOT NULL,
    title TEXT, artist TEXT, album TEXT, duration REAL
  )`);
} catch {
  musicDb = null; // нет node:sqlite/доступа — работаем без кеша
}

function walkMusic(dir: string, base = ''): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkMusic(path.join(dir, entry.name), rel));
    else if (entry.name.toLowerCase().endsWith('.mp3')) out.push(rel);
  }
  return out;
}

interface MusicMeta { title: string; artist: string; album: string; duration: number | null }

function metaFromCache(file: string, size: number, mtime: number): MusicMeta | null {
  if (!musicDb) return null;
  try {
    const row = musicDb.prepare('SELECT title, artist, album, duration FROM meta WHERE path = ? AND size = ? AND mtime = ?')
      .get(file, size, mtime) as { title: string | null; artist: string | null; album: string | null; duration: number | null } | undefined;
    if (!row) return null;
    return { title: row.title ?? '', artist: row.artist ?? '', album: row.album ?? '', duration: row.duration };
  } catch {
    return null;
  }
}

async function metaFromFile(full: string, file: string, size: number, mtime: number): Promise<MusicMeta> {
  let meta: MusicMeta = { title: '', artist: '', album: '', duration: null };
  try {
    const md = await parseFile(full, { duration: true });
    const c = md.common;
    meta = {
      title: (c.title ?? '').trim(),
      artist: (c.artist ?? '').trim(),
      album: (c.album ?? '').trim(),
      duration: md.format.duration ?? null,
    };
  } catch {
    // нет тегов/битый файл — имя файла станет заголовком на клиенте
  }
  if (musicDb) {
    try {
      musicDb.prepare('INSERT OR REPLACE INTO meta (path, size, mtime, title, artist, album, duration) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(file, size, mtime, meta.title, meta.artist, meta.album, meta.duration);
    } catch { /* noop */ }
  }
  return meta;
}

app.get('/api/music', async (_req, res) => {
  try {
    const files = walkMusic(MUSIC_DIR).sort();
    const tracks: Array<{ file: string; title: string; artist: string; album: string; duration: number | null }> = [];
    const missing: Array<Promise<void>> = [];
    for (const file of files) {
      const full = path.join(MUSIC_DIR, file);
      let st: fs.Stats | null = null;
      try { st = fs.statSync(full); } catch { /* noop */ }
      if (!st) continue;
      const size = st.size;
      const mtime = Math.round(st.mtimeMs);
      const cached = metaFromCache(file, size, mtime);
      if (cached) {
        tracks.push({ file, ...cached });
      } else {
        // парсим параллельно, порядок сохраняем по индексу
        const idx = tracks.length;
        tracks.push({ file, title: '', artist: '', album: '', duration: null });
        missing.push(metaFromFile(full, file, size, mtime).then((meta) => {
          tracks[idx] = { file, ...meta };
        }));
      }
    }
    await Promise.all(missing);
    res.json({ tracks });
  } catch {
    res.json({ tracks: [] });
  }
});
app.use('/music', express.static(MUSIC_DIR));
app.use('/skin', express.static(path.join(ROOT, 'public', 'winamp-skin')));

// ─── статика собранного клиента (после pnpm build) ───
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, {
    setHeaders: (res, p) => {
      if (p.endsWith('.wasm')) res.type('application/wasm');
    },
  }));
  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}
