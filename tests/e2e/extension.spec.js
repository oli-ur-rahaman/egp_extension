// Smoke test: the built extension loads, its service worker starts, and the panel connects to it.
// Run `npm run build` first.
import { test, expect, chromium } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dist = path.resolve(import.meta.dirname, '..', '..', 'dist');

test('extension loads and the side panel reports Ready', async () => {
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'egp-e2e-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).host;

    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/panel/index.html`);
    await expect(panel.locator('#status')).toHaveText('Ready');
    await expect(panel.locator('#version')).toHaveText(/^v\d+\.\d+\.\d+$/);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
