// store.test.js — §9 store cases (jsdom-free, in-memory backend).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, SECTIONS } from '../js/store.js';

const FIXED_NOW = '2026-07-13T09:00:00.000Z';

function seededStore() {
  const store = createStore({ backend: memoryBackend(), now: () => FIXED_NOW });
  store.ensureInitialized();
  store.set('sessionLogs', {
    w01s02: { sessionId: 'w01s02', status: 'completed', actualDistanceKm: 5, rpe: 4, painScore: 0, loggedAt: FIXED_NOW },
  });
  store.set('checkins', { '2026-07-13': { date: '2026-07-13', rhr: 51, sleepHours: 7.5, status: 'normal', reasons: [] } });
  store.set('hydration', { '2026-07-13': 1500 });
  store.set('weighins', { '2026-07-13': 90.3 });
  store.set('decisions', { notes: 'feeling good' });
  store.set('checklist', { bib_pickup: true, 'carbload_2026-09-18': true }); // M5 section
  store.set('mealSuggestions', { breakfast: '100 g oats, 3 eggs, 1 banana, 300 ml milk' });
  return store;
}

test('export → import round-trip is identical', () => {
  const src = seededStore();
  const blob = src.exportBlob();

  const dst = createStore({ backend: memoryBackend(), now: () => FIXED_NOW });
  dst.importBlob(blob);

  for (const key of SECTIONS) {
    assert.deepEqual(dst.get(key), src.get(key), `section "${key}" differs after round-trip`);
  }
  // A second export from the restored store equals the first byte-for-byte.
  assert.equal(dst.exportBlob(), blob);
});

test('import with wrong schemaVersion throws', () => {
  const store = createStore({ backend: memoryBackend(), now: () => FIXED_NOW });
  const bad = JSON.stringify({ exportedAt: FIXED_NOW, meta: { schemaVersion: 2 }, sessionLogs: {} });
  assert.throws(() => store.importBlob(bad), /schemaVersion/);
});

test('import of non-JSON throws', () => {
  const store = createStore({ backend: memoryBackend() });
  assert.throws(() => store.importBlob('{not json'), /valid JSON/);
});

test('unknown key is rejected', () => {
  const store = createStore({ backend: memoryBackend() });
  assert.throws(() => store.get('bogus'), /unknown store key/);
});

// --- import is a WHOLESALE replace (review finding #2) ----------------------
test('import resets sections absent from the blob to defaults', () => {
  const store = createStore({ backend: memoryBackend(), now: () => FIXED_NOW });
  store.ensureInitialized();
  store.set('checkpoint', { evaluatedAt: FIXED_NOW, outcome: 'pass' });

  // Import a valid blob that omits `checkpoint` entirely.
  const blob = JSON.stringify({ meta: { schemaVersion: 1, installedAt: FIXED_NOW, lastBackupAt: null } });
  store.importBlob(blob);

  assert.equal(store.get('checkpoint'), null, 'stale checkpoint should be reset, not merged');
  assert.deepEqual(store.get('sessionLogs'), {}, 'absent object section resets to {}');
});

// --- malformed-input guards (review finding #4) ----------------------------
test('import of JSON literal null throws descriptive error', () => {
  const store = createStore({ backend: memoryBackend() });
  assert.throws(() => store.importBlob('null'), /empty or not an object/);
});

test('import of a JSON array throws descriptive error', () => {
  const store = createStore({ backend: memoryBackend() });
  assert.throws(() => store.importBlob('[]'), /empty or not an object/);
});

// --- self-healing meta (review finding #3) ---------------------------------
test('corrupt meta self-heals and yields a re-importable backup', () => {
  const backend = memoryBackend({ 'ba42.meta': '{corrupt-not-json' });
  const store = createStore({ backend, now: () => FIXED_NOW });

  const meta = store.ensureInitialized();
  assert.equal(meta.schemaVersion, 1, 'schemaVersion restored');

  store.markBackedUp();
  const blob = store.exportBlob();
  // The produced backup must round-trip back in (schemaVersion present & valid).
  const dst = createStore({ backend: memoryBackend(), now: () => FIXED_NOW });
  assert.doesNotThrow(() => dst.importBlob(blob));
  assert.equal(dst.get('meta').schemaVersion, 1);
});
