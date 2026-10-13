// QuestTest — локальный стенд теста саги «Синяя Комета» (GameDevStory).
// Запуск: node server.mjs   →   http://127.0.0.1:8899/
// Отдаёт ТОЛЬКО: файлы стенда, арты игры (/quests/*.png) и стиль игры
// (/game/src/ui/win95.css — явный список; аудит-51 P1-5: раньше через /game/ был виден
// весь репозиторий вместе с .env, ключами и data/users.db).
// API настроек (GET/POST /api/settings) — только JSON-объект с лимитом размера (аудит-51 02-P2-10).
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(DIR, '..'); // аудит-51 04-P3-7: без абсолютного пути — стенд лежит в корне репозитория
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

// Единственное, что стенду нужно из репозитория игры, — стиль win95 (подключён в index.html)
const GAME_FILES = new Set(['src/ui/win95.css']);
const SETTINGS_MAX = 256 * 1024;

// сегмент пути, начинающийся с точки (.env, .git, «..») — запрещён где угодно
function hasHidden(p) {
  return p.split(/[\\/]+/).some((s) => s.startsWith('.'));
}

function resolveFile(urlPath) {
  const p = decodeURIComponent(urlPath.split('?')[0] || '/');
  if (p === '/' || p === '') return path.join(DIR, 'index.html');
  if (hasHidden(p)) return null;
  if (p.startsWith('/quests/')) {
    const rel = p.slice('/quests/'.length);
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(rel)) return null;
    return path.join(GAME, 'public', 'quests', rel);
  }
  if (p.startsWith('/game/')) {
    const rel = p.slice('/game/'.length);
    return GAME_FILES.has(rel) ? path.join(GAME, rel) : null;
  }
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
        // аудит-51 02-P2-10: только JSON-объект в разумных пределах
        if (!String(req.headers['content-type'] || '').includes('application/json')) {
          return send(res, 415, Buffer.from('application/json expected'));
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > SETTINGS_MAX) return send(res, 413, Buffer.from('body too large'));
        }
        let data;
        try {
          data = JSON.parse(body);
        } catch {
          return send(res, 400, Buffer.from('invalid json'));
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          return send(res, 400, Buffer.from('object expected'));
        }
        await fs.writeFile(settingsFile, JSON.stringify(data, null, 2), 'utf8');
        return send(res, 200, Buffer.from('{"ok":true}'), MIME['.json']);
      }
      return send(res, 405, Buffer.from('method not allowed'));
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, Buffer.from('method not allowed'));
    }

    const resolved = resolveFile(url.pathname);
    if (!resolved) return send(res, 403, Buffer.from('forbidden'));
    const file = path.resolve(resolved);
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
