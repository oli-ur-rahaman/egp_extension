// @ts-nocheck: the vendored library has no types here. Covered by the e2e run tests.
// M5: where a run lives. IndexedDB, on this PC only, reachable by the worker and the panel. Rows are written as they arrive.

import { openDB } from '../../vendor/idb.js';

const DB_NAME = 'pdms-runs';

/** @returns {Promise<any>} */
const open = () => openDB(DB_NAME, 1, {
  upgrade(db) {
    db.createObjectStore('runs', { keyPath: 'id' });
    const rows = db.createObjectStore('rows', { keyPath: ['runId', 'key'] });
    rows.createIndex('pending', ['runId', 'pending', 'seq']);
    rows.createIndex('order', ['runId', 'seq']);
  },
});

const rowRange = (runId) => IDBKeyRange.bound([runId], [runId, []]);

export function createStore() {
  /** @type {Promise<any> | null} */
  let dbPromise = null;
  const db = () => (dbPromise ??= open());
  return {
    getRun: async (id) => (await db()).get('runs', id),
    saveRun: async (run) => {
      await (await db()).put('runs', run);
    },
    allRuns: async () => (await db()).getAll('runs'),
    countRows: async (runId) => (await db()).count('rows', rowRange(runId)),
    /** The same row twice stays one row, and keeps its detail. */
    addRows: async (runId, rows) => {
      const tx = (await db()).transaction('rows', 'readwrite');
      let seq = await tx.store.count(rowRange(runId));
      for (const row of rows) {
        const existing = await tx.store.get([runId, row.key]);
        if (existing) continue;
        tx.store.put({ ...row, runId, seq });
        seq += 1;
      }
      await tx.done;
    },
    nextPending: async (runId) => {
      const range = IDBKeyRange.bound([runId, 1], [runId, 1, []]);
      return (await db()).getFromIndex('rows', 'pending', range);
    },
    saveDetail: async (runId, key, change) => {
      const tx = (await db()).transaction('rows', 'readwrite');
      const row = await tx.store.get([runId, key]);
      if (row) tx.store.put({ ...row, ...change, pending: 0 });
      await tx.done;
    },
    allRows: async (runId) => (await db()).getAllFromIndex('rows', 'order', IDBKeyRange.bound([runId], [runId, []])),
    deleteRun: async (runId) => {
      const handle = await db();
      const tx = handle.transaction(['rows', 'runs'], 'readwrite');
      await tx.objectStore('rows').delete(rowRange(runId));
      await tx.objectStore('runs').delete(runId);
      await tx.done;
    },
  };
}
