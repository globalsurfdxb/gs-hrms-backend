import { defineConfig } from 'vitest/config';

// Unit tests: src/**/*.spec.ts — pure logic (domain rules, helpers). No database.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
  },
});
