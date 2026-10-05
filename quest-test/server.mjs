// QuestTest — локальный стенд теста саги «Синяя Комета» (GameDevStory).
// Запуск: node server.mjs   →   http://127.0.0.1:8899/
// Отдаёт: файлы стенда, win95.css игры (/game/src/ui/win95.css),
// арты игры (/quests/*.png), API настроек (GET/POST /api/settings).
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME = 'E:/MY/GameDevStory';
const PORT = 8899;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
};

const OK_ROOTS = [path.resolve(DIR), path.resolve(GAME)];

function resolveFile(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0] || '/');
  if (p === '/' || p === '') return path.join(DIR, 'index.html');
  if (p.startsWith('/quests/')) return path.join(GAME, 'public', p.slice(1));
  if (p.startsWith('/game/')) return path.join(GAME, p.slice('/game/'.length));
  return path.join(DIR, p.slice(1));
}

function send(res, code, buf, type = 'text/plain; charset=utf-8', head = false) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(head ? undefined : buf);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const settingsFile = path.join(DIR, 'settings.json');

    if (url.pathname === '/api/settings') {
      if (req.method === 'GET') {
        return send(res, 200, await fs.readFile(settingsFile), MIME['.json']);
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const data = JSON.parse(body); // бросает при невалидном JSON
        await fs.writeFile(settingsFile, JSON.stringify(data, null, 2), 'utf8');
        return send(res, 200, Buffer.from('{"ok":true}'), MIME['.json']);
      }
      return send(res, 405, Buffer.from('method not allowed'));
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, Buffer.from('method not allowed'));
    }

    const file = path.resolve(resolveFile(url.pathname));
    if (!OK_ROOTS.some((root) => file.toLowerCase().startsWith(root.toLowerCase() + path.sep)) &&
        !OK_ROOTS.some((root) => file.toLowerCase() === root.toLowerCase())) {
      return send(res, 403, Buffer.from('forbidden'));
    }
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, MIME[ext] || 'application/octet-stream', req.method === 'HEAD');
  } catch (err) {
    const code = err && err.code === 'ENOENT' ? 404 : 500;
    send(res, code, Buffer.from(String((err && err.message) || err)));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`QuestTest (Синяя Комета) → http://127.0.0.1:${PORT}/`);
});
