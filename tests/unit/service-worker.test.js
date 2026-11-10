// D43: the side panel belongs to the tab where the icon was clicked.
import { beforeAll, describe, expect, it, vi } from 'vitest';

const calls = [];
let clicked;
const listener = () => ({ addListener: () => {} });

beforeAll(async () => {
  globalThis.self ??= { addEventListener: () => {} };
  globalThis.chrome = {
    runtime: { getManifest: () => ({ version: '0', side_panel: { default_path: 'panel/index.html' } }), onMessage: listener(), onConnect: listener(), sendMessage: vi.fn(async () => {}) },
    sidePanel: {
      setPanelBehavior: async (o) => { calls.push(['behaviour', o]); },
      setOptions: async (o) => { calls.push(['options', o]); },
      open: async (o) => { calls.push(['open', o]); },
    },
    action: {
      onClicked: { addListener: (fn) => { clicked = fn; } },
      setBadgeBackgroundColor: async () => {},
      setBadgeText: async (o) => { calls.push(['badge', o]); },
    },
    scripting: { executeScript: async (o) => { calls.push(['page', { tabId: o.target.tabId }]); } },
    tabGroups: { update: async (id, o) => { calls.push(['label', { id, ...o }]); } },
    storage: { session: { get: async () => ({}), set: async () => {} } },
    alarms: { create: () => {}, get: async () => undefined, onAlarm: listener() },
    tabs: {
      onActivated: listener(), onUpdated: listener(), onRemoved: listener(),
      get: async (id) => ({ id, groupId: id === 7 ? 99 : -1 }),
      group: async (o) => { calls.push(['group', o]); return 500; },
      ungroup: async (id) => { calls.push(['ungroup', id]); },
    },
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
    expect(calls.slice(0, 2)).toEqual([
      ['options', { tabId: 42, path: 'panel/index.html?tab=42', enabled: true }],
      ['open', { tabId: 42 }],
    ]);
  });
  it('the click puts that tab in a labelled tab group, and leaves the website as it is (D70)', async () => {
    calls.length = 0;
    clicked({ id: 42 });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toContainEqual(['badge', { tabId: 42, text: 'ON' }]);
    expect(calls).toContainEqual(['group', { tabIds: 42 }]);
    expect(calls).toContainEqual(['label', { id: 500, title: 'PDMS', color: 'blue', collapsed: false }]);
  });
  it('a tab already in a group the user made stays in it', async () => {
    calls.length = 0;
    clicked({ id: 7 });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls.some(([k]) => k === 'group')).toBe(false);
    expect(calls).toContainEqual(['badge', { tabId: 7, text: 'ON' }]);
  });
  it('a tab with no ID is ignored', () => {
    calls.length = 0;
    clicked({});
    expect(calls).toEqual([]);
  });
});
