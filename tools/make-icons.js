// Draws the extension's PNG icons from icons/icon.svg. Run after changing the icon: node tools/make-icons.js
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', 'icons');
const svg = await readFile(path.join(dir, 'icon.svg'), 'utf8');
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: path.join(dir, `icon-${size}.png`), omitBackground: true });
  await page.close();
}
await browser.close();
