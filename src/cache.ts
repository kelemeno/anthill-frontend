// The last data each page showed, kept in localStorage so the next visit paints
// at once while fresh data loads in the background. Only public data is kept
// (private communities' trees and names never are), under the viewer it was
// fetched for, and a signed-out account's entries are dropped.
// (v2: the commons became a new, empty community; v3: per viewer, public only)
const PREFIX = "anthill.cache.v3.";

// drop what older versions kept
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("anthill.cache.") && !key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
} catch {}

// Whose data it is: the signed-in account, or anyone.
export const viewerKey = (session: { user: { id: string } } | undefined) => session?.user.id ?? "anyone";

// Older entries aren't shown: what was public then may not be now.
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const entry = raw ? (JSON.parse(raw) as { at?: number; value?: T }) : undefined;
    if (typeof entry?.at !== "number" || Date.now() - entry.at > MAX_AGE) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
}

export function dropCache(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}

// Drops every entry whose key starts with `prefix`.
export function dropCacheUnder(prefix: string) {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX + prefix)) localStorage.removeItem(key);
    }
  } catch {}
}

// In-memory caches of what pages showed this visit (they may hold private
// data); all of them are emptied when the account changes.
const memories = new Set<Map<string, unknown>>();

export function memory<T>(): Map<string, T> {
  const map = new Map<string, T>();
  memories.add(map as Map<string, unknown>);
  return map;
}

export function forgetMemories() {
  for (const map of memories) map.clear();
}
