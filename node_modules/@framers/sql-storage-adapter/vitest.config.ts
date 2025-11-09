import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/shims.d.ts',
        'node_modules/**'
      ],
      thresholds: {
        statements: 9,
        branches: 50,
        functions: 45,
        lines: 9
      }
    },
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist', 'coverage']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});