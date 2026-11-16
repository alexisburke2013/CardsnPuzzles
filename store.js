/*
 * SAVE STORE
 * Single seam for reading and writing the player save. Today it is backed by
 * localStorage; a future Supabase sync adapter can implement the same shape
 * without touching app.js or the games.
 *
 * The store owns storage mechanics and schema versioning. It does not know
 * about individual game rules; app.js still validates each game's board via
 * restoreGameState() before a save is accepted.
 */

export const SAVE_VERSION = 2;
const CURRENT_KEY = 'playfield-save-v2';
const LEGACY_KEY = 'playfield-save-v1';

function storage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/* Ordered migrations keyed by the version they upgrade FROM. Each returns the
   next-version shape. Add `1: save => ...` when the v1 shape needs more than
   the legacy fallback below. */
const migrations = {};

export function readRaw() {
  const store = storage();
  if (!store) return null;
  const text = store.getItem(CURRENT_KEY) ?? store.getItem(LEGACY_KEY);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* Returns the save at the current version, or null when nothing valid exists.
   `isSupportedVersion` lets the caller decide which versions are readable. */
export function load({ supportedVersions = [1, 2] } = {}) {
  const raw = readRaw();
  if (!raw || !supportedVersions.includes(raw.version)) return null;
  let save = raw;
  while (save.version < SAVE_VERSION && migrations[save.version]) {
    save = migrations[save.version](save);
  }
  return save;
}

export function save(data) {
  const store = storage();
  if (!store) throw new Error('no-storage');
  store.setItem(CURRENT_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
}

export function clear() {
  const store = storage();
  if (!store) return;
  store.removeItem(CURRENT_KEY);
  store.removeItem(LEGACY_KEY);
}
