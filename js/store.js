// store.js — the single localStorage wrapper (§5.0). All views and logic receive
// this instance; nothing else touches localStorage directly (§2, §4).
//
// Storage backend and clock are injected so the same code runs under `node --test`
// with an in-memory backend (§9 store round-trip test) and in the browser with
// window.localStorage.

const PREFIX = 'ba42.';
const SCHEMA_VERSION = 1;

// The versioned sections from §4. Object-valued sections default to {}; the two
// singletons (checkpoint, decisions) default to null / {}.
// `checklist` extends §4: it persists race-week checklist ticks ({ [itemId]: true }).
// It participates in backup/restore like every other section.
export const SECTIONS = [
  'meta',
  'sessionLogs',
  'checkins',
  'hydration',
  'weighins',
  'checkpoint',
  'decisions',
  'checklist',
  'mealSuggestions',
  'foods',
];

const DEFAULTS = {
  meta: null, // seeded by ensureInitialized()
  sessionLogs: {},
  checkins: {},
  hydration: {},
  weighins: {},
  checkpoint: null,
  decisions: {},
  checklist: {},
  mealSuggestions: {}, // { [mealKey]: [{ foodId, amount }] } — the athlete's go-to meal, Fuel §6
  foods: {}, // { [foodId]: {carb,protein,fat,name?,unit?,ref?} } — overrides/custom foods, Fuel §6
};

/** A minimal in-memory backend (localStorage-shaped) — used by tests and as a
 *  safe fallback when no Web Storage is present. */
export function memoryBackend(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}

export function createStore({ backend, now } = {}) {
  const store = backend || (typeof globalThis !== 'undefined' && globalThis.localStorage) || memoryBackend();
  const clock = now || (() => new Date().toISOString());

  function assertKnown(key) {
    if (!SECTIONS.includes(key)) throw new Error(`unknown store key: ${key}`);
  }

  function get(key) {
    assertKnown(key);
    const raw = store.getItem(PREFIX + key);
    if (raw == null) return structuredCloneDefault(key);
    try {
      return JSON.parse(raw);
    } catch {
      // Corrupt value — fail safe to the default rather than crashing boot.
      return structuredCloneDefault(key);
    }
  }

  function set(key, value) {
    assertKnown(key);
    store.setItem(PREFIX + key, JSON.stringify(value));
    return value;
  }

  function remove(key) {
    assertKnown(key);
    store.removeItem(PREFIX + key);
  }

  function structuredCloneDefault(key) {
    const d = DEFAULTS[key];
    return d == null ? d : JSON.parse(JSON.stringify(d));
  }

  /** Seed meta on first run; also self-heals a missing/corrupt meta or one that
   *  lacks a valid schemaVersion (get() fail-safes corrupt values to null).
   *  Idempotent. */
  function ensureInitialized() {
    const meta = get('meta'); // null if absent or unparseable
    if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
      set('meta', {
        schemaVersion: SCHEMA_VERSION,
        installedAt: (meta && meta.installedAt) || clock(),
        lastBackupAt: (meta && meta.lastBackupAt) || null,
      });
    }
    return get('meta');
  }

  /** Whole-store backup as a JSON string (§4 backup blob). */
  function exportBlob() {
    const blob = { exportedAt: clock() };
    for (const key of SECTIONS) blob[key] = get(key);
    // Guarantee a valid schemaVersion travels with the blob even if meta was never
    // seeded or was corrupted — otherwise the app could emit a non-reimportable file.
    if (!blob.meta || blob.meta.schemaVersion !== SCHEMA_VERSION) {
      blob.meta = {
        schemaVersion: SCHEMA_VERSION,
        installedAt: (blob.meta && blob.meta.installedAt) || null,
        lastBackupAt: (blob.meta && blob.meta.lastBackupAt) || null,
      };
    }
    return JSON.stringify(blob, null, 2);
  }

  /** Restore from a backup blob (string or object). Validates schemaVersion,
   *  then replaces every section wholesale. Throws on incompatible/invalid input. */
  function importBlob(json) {
    let blob;
    if (typeof json === 'string') {
      try {
        blob = JSON.parse(json);
      } catch (e) {
        throw new Error(`backup is not valid JSON: ${e.message}`);
      }
    } else {
      blob = json;
    }
    // Reject anything that isn't a plain object — including JSON that parses to
    // null / a number / a string — with a descriptive message, not a raw TypeError.
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
      throw new Error('backup is empty or not an object');
    }
    const version = blob.meta && blob.meta.schemaVersion;
    if (version !== SCHEMA_VERSION) {
      throw new Error(`incompatible backup schemaVersion: ${version} (expected ${SCHEMA_VERSION})`);
    }
    // Replace WHOLESALE (§4): every section is overwritten, and any section absent
    // from the blob is reset to its default rather than left stale.
    for (const key of SECTIONS) {
      set(key, key in blob ? blob[key] : structuredCloneDefault(key));
    }
    return get('meta');
  }

  /** Record that a backup just happened (drives the Sunday nag, §6). */
  function markBackedUp() {
    const meta = ensureInitialized();
    set('meta', { ...meta, lastBackupAt: clock() });
  }

  /** Approximate bytes used by ba42.* keys — for the Settings storage panel (§6). */
  function usageBytes() {
    let total = 0;
    for (const key of SECTIONS) {
      const raw = store.getItem(PREFIX + key);
      if (raw != null) total += (PREFIX + key).length + raw.length;
    }
    return total;
  }

  /** No-op at v1; migration seam for future schema bumps (§5.0). */
  function migrate() {
    return SCHEMA_VERSION;
  }

  return {
    SCHEMA_VERSION,
    get,
    set,
    remove,
    ensureInitialized,
    exportBlob,
    importBlob,
    markBackedUp,
    usageBytes,
    migrate,
  };
}
