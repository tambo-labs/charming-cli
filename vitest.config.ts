import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['dist/**', 'vendor/**'],
      reporter: ['text', 'html', 'lcov', 'json'],
    },
    environment: 'node',
    globalSetup: ['./scripts/ensure-dev-host.ts'],
    // Tests that spawn the compiled CLI run several processes each; under coverage on shared CI
    // runners they exceed the 5s default.
    testTimeout: 20_000,
  },
});
