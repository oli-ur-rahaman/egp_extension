// D43: the side panel belongs to the tab where the icon was clicked.
import { beforeAll, describe, expect, it, vi } from 'vitest';

const calls = [];
let clicked;
const listener = () => ({ addListener: () => {} });

beforeAll(async () => {
  globalThis.chrome = {
    runtime: { getManifest: () => ({ version: '0', side_panel: { default_path: 'panel/index.html' } }), onMessage: listener(), sendMessage: vi.fn(async () => {}) },
    sidePanel: {
      setPanelBehavior: async (o) => { calls.push(['behaviour', o]); },
      setOptions: async (o) => { calls.push(['options', o]); },
      open: async (o) => { calls.push(['open', o]); },
    },
    action: { onClicked: { addListener: (fn) => { clicked = fn; } } },
    tabs: { onActivated: listener(), onUpdated: listener() },
    windows: { onFocusChanged: listener(), WINDOW_ID_NONE: -1 },
  };
  await import('../../src/background/service-worker.js');
});

describe('the panel belongs to one tab (D43)', () => {
  it('is off by default, so a new tab has no panel', () => {
    expect(calls).toContainEqual(['options', { enabled: false }]);
  });
  it('does not open by itself: the click is handled here', () => {
    expect(calls).toContainEqual(['behaviour', { openPanelOnActionClick: false }]);
  });
  it('a click turns it on for that tab only, and opens it within the click', () => {
    calls.length = 0;
    clicked({ id: 42 });
    expect(calls).toEqual([
      ['options', { tabId: 42, path: 'panel/index.html', enabled: true }],
      ['open', { tabId: 42 }],
    ]);
  });
  it('a tab with no ID is ignored', () => {
    calls.length = 0;
    clicked({});
    expect(calls).toEqual([]);
  });
});
