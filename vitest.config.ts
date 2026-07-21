import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    testTimeout: 10_000,
    globals: true,
  },
  resolve: {
    alias: { '@': new URL('./', import.meta.url).pathname },
  },
});
