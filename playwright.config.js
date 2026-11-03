import { defineConfig } from '@playwright/test';

// E2E runs the real unpacked extension (dist/) in Playwright's Chromium,
// against the local mock eGP server once it exists (M1-T08). Never against the live portal.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
});
