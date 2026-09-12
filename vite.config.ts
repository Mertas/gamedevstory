import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

import { buildDefine } from './build-define';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: buildDefine,
  resolve: {
    alias: {
      // Winamp: локальные исходники (webamp + workspace-пакеты) вместо npm-пакета.
      // Типы для 'webamp-internal' — в src/webamp-internal.d.ts (tsc их не тянет в program)
      'webamp-internal': r('libs/webamp/js/Webamp.ts'),
      'winamp-eqf': r('libs/winamp-eqf/index.ts'),
      'ani-cursor': r('libs/ani-cursor/src/index.ts'),
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
