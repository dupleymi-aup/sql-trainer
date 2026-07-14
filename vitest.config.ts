import { defineConfig } from 'vitest/config';

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
      exclude: ['node_modules/', 'src/components/ui/', '**/*.d.ts', '**/*.config.*'],
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
