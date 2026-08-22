import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['dist/**'],
      reporter: ['text', 'html', 'lcov', 'json'],
    },
    environment: 'node',
  },
});
