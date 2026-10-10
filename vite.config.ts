import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { buildDefine } from './build-define';

/**
 * PLAN-39: dev-отдача песочницы мини-игр по /lab/ (в проде — nginx, каталог /srv/gds/lab).
 * Каталог — E:/MY/gds-minigames, переопределяется GDS_LAB_DIR.
 */
function labStatic(): Plugin {
  const dir = process.env.GDS_LAB_DIR ?? 'E:/MY/gds-minigames';
  const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.otf': 'font/otf',
    '.woff2': 'font/woff2',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };
  return {
    name: 'gds-lab-static',
    configureServer(server) {
      server.middlewares.use('/lab', (req, res, next) => {
        try {
          const raw = (req.url ?? '/').split('?')[0] ?? '/';
          if (raw.includes('..')) {
            res.statusCode = 403;
            res.end('forbidden');
            return;
          }
          const u = decodeURIComponent(raw);
          if (u.includes('..')) {
            res.statusCode = 403;
            res.end('forbidden');
            return;
          }
          const rel = u === '/' || u === '' ? '/index.html' : u;
          const abs = path.join(dir, rel);
          if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return next();
          res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
          fs.createReadStream(abs).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), labStatic()],
  define: buildDefine,
  resolve: {
    alias: {
      // Winamp: локальные исходники (webamp + workspace-пакеты) вместо npm-пакета.
      // Типы для 'webamp-internal' — в src/webamp-internal.d.ts (tsc их не тянет в program)
      'webamp-internal': r('libs/webamp/js/Webamp.ts'),
      'winamp-eqf': r('libs/winamp-eqf/index.ts'),
      'ani-cursor': r('libs/ani-cursor/src/index.ts'),
      // аудит-51 P1-7: вендоренный webamp берёт из `music-metadata-browser` только типы
      // (IAudioMetadata/IOptions), а разбор треков уже идёт через `music-metadata`;
      // старый пакет тянул уязвимую music-metadata@7 — выкинут, импорт ведём на новый пакет.
      'music-metadata-browser': 'music-metadata',
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      // SRV-19: dev-клиент ходит на относительный /ws — проксируем на игровой сервер
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022', // нужен top-level await (sql.js init в db.ts)
  },
});
