// M0-AT2: the manifest is valid MV3 and asks for the minimum permissions only (EXECUTION_PLAN M0-T03).
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));

describe('manifest.json', () => {
  it('is Manifest V3 with a module service worker', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches the package version', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(manifest.version).toBe(pkg.version);
  });

  it('requests exactly the agreed permissions', () => {
    expect([...manifest.permissions].sort()).toEqual(['alarms', 'downloads', 'notifications', 'scripting', 'sidePanel', 'storage', 'tabs']);
  });

  it('never requests proxy, cookies, webRequest or broad host access', () => {
    const all = JSON.stringify(manifest);
    for (const banned of ['proxy', 'cookies', 'webRequest', 'debugger', '<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']) {
      expect(all).not.toContain(`"${banned}"`);
    }
    expect(manifest.host_permissions).toEqual(['*://*.eprocure.gov.bd/*']);
  });

  it('allows no remote scripts', () => {
    const csp = manifest.content_security_policy.extension_pages;
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/https?:/);
  });

  it('points at source files that exist', () => {
    expect(existsSync(path.join(root, 'src/background/service-worker.js'))).toBe(true);
    expect(existsSync(path.join(root, 'src', manifest.side_panel.default_path))).toBe(true);
  });
});
