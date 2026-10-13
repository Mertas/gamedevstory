import { defineConfig } from 'vitest/config';

import { buildDefine } from './build-define';

export default defineConfig({
  define: buildDefine,
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    server: {
      deps: {
        external: [/node:sqlite/],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text'],
      // аудит-51 04-P3-6: пороги ядра с запасом (факт 13.10: строки 92.9%, ветки 82.9%, функции 86.4%)
      thresholds: {
        'src/core/**': { statements: 85, branches: 70, functions: 80, lines: 85 },
      },
    },
  },
});
