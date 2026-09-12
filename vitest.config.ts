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
  },
});
