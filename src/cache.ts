// The last data each page showed, kept in localStorage so the next visit paints
// at once while fresh data loads in the background. Private communities' trees
// are never kept.
// (v2: the commons became a new, empty community)
const PREFIX = "anthill.cache.v2.";

// drop what older versions kept
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("anthill.cache.") && !key.startsWith(PREFIX)) localStorage.removeItem(key);
  }
} catch {}

export function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {}
}

export function dropCache(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
}
