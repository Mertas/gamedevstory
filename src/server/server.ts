// Локальный сервер: WebSocket (игра + чат) + /api/save + статика dist.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { PORT, gigaReady } from './config';
import { GameServer, type ClientAction } from './game';
import { llmStatus } from './giga';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const DIST = path.join(ROOT, 'dist');

const app = express();
app.use(express.json({ limit: '2mb' }));

const server = app.listen(PORT, () => {
  console.log(`[gds] сервер на :${PORT}; GigaChat: ${gigaReady ? 'подключён' : 'НЕТ ключей (чат будет молчать)'}`);
});

const game = new GameServer();

// ─── WebSocket: игра и чат ───
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  if (req.url !== '/ws') {
    ws.close(1008, 'wrong path');
    return;
  }
  ws.send(JSON.stringify({ type: 'meta', data: game.meta() }));
  // сразу шлём текущее состояние: новый клиент или переподключение на паузе (событие
  // висит, тикер молчит) иначе не получат state, и попап решения не вернётся
  ws.send(JSON.stringify({ type: 'state', ...game.snapshot() }));
  const unsub = game.subscribe((snap) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'state', ...snap }));
  });
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as ClientAction;
      game.handle(msg);
      const ar = game.actionResult();
      if (ar && !ar.ok) ws.send(JSON.stringify({ type: 'action_result', error: ar.error }));
    } catch (e) {
      ws.send(JSON.stringify({ type: 'action_result', error: String(e).slice(0, 200) }));
    }
  });
  game.setStoryCb((res) => ws.send(JSON.stringify({ type: 'story_result', ...res })));
  ws.on('close', () => unsub());
});

// ─── HTTP: экспорт/импорт сейва ───
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: llmStatus() });
});

app.get('/api/save', (_req, res) => {
  res.type('application/json').send(game.exportSave());
});

app.post('/api/save', (req, res) => {
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
