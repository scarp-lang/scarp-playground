import { defineConfig } from 'vitest/config';

// Unit tests and browser E2E tests use separate runners. Playwright specs must
// never be collected by Vitest, where test() is a different API.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
