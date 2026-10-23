// The last data each page showed, kept in localStorage so the next visit paints
// at once while fresh data loads in the background. Private communities' trees
// are never kept.
const PREFIX = "anthill.cache.v1.";

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
