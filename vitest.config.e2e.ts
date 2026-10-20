import { defineConfig } from 'vitest/config';

// E2E tests: test/**/*.e2e-spec.ts — the real app over HTTP against the local/CI Postgres (seeded).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['test/setup-env.ts'],
    fileParallelism: false,
  },
});
