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

// ─── музыка для Winamp (public/music) ───
const MUSIC_DIR = path.join(ROOT, 'public', 'music');
app.get('/api/music', (_req, res) => {
  try {
    const files = fs.readdirSync(MUSIC_DIR)
      .filter((f) => f.toLowerCase().endsWith('.mp3'))
      .sort();
    res.json({ files });
  } catch {
    res.json({ files: [] });
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
