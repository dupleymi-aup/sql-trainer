import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 10000,
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    setupFiles: ['src/__tests__/vitest-setup.ts'],
    env: {
      AUTH_SECRET: 'test-secret-for-csrf-unit-tests',
      LOG_LEVEL: 'debug',
    },
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules/', 'src/components/ui/', '**/*.d.ts', '**/*.config.*', 'src/__tests__/**'],
      thresholds: {
        statements: 55,
        branches: 50,
        functions: 50,
        lines: 55,
      },
    },
  },
  resolve: {
    alias: {
      '@': __dirname + '/src',
    },
  },
});
