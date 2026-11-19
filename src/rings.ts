// The capability ring of a file, as a commons' rules classify it (the ledger's
// rules.rings: the genesis's, or the last rulesChange's), so the approve form
// can scope a task at the ring of the files its proposal points at. A task
// scoped above the ring of a file its change touches fails the commons' rings
// gate, and a task can't be re-ringed. This copies agent-commons
// src/gates/rings.ts ringOf and src/rules.ts globToRegExp: the first matching
// glob wins, unmatched files are ring 1, a spelling in another letter case is
// never a higher ring than the file it can become, and a path that can't name
// a file in the repository is ring 0.
import type { Ring, RingRule } from "./api";

// agent-commons globToRegExp, or undefined for a glob the commons would
// refuse (its rules never hold one; skipped rather than guessed at).
export function globToRegExp(glob: string): RegExp | undefined {
  if (glob === "" || glob.startsWith("/") || glob.includes("\\") || glob.includes("***")) return undefined;
  if (glob.split("/").includes("")) return undefined;
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i] as string;
    if (c === "*" && glob[i + 1] === "*") {
      const atSegmentStart = i === 0 || glob[i - 1] === "/";
      if (atSegmentStart && glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
    } else if (c === "*") {
      re += "[^/]*";
      i += 1;
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

// agent-commons normalizeRepoPath: the one spelling of a repo-relative POSIX
// path, or null when it can't name a file inside the repository.
export function normalizeRepoPath(p: string): string | null {
  if (p === "" || p.includes("\0") || p.includes("\\") || p.startsWith("/")) return null;
  const out: string[] = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else out.push(part);
  }
  return out.length === 0 ? null : out.join("/");
}

const isRing = (r: unknown): r is Ring => r === 0 || r === 1 || r === 2;

// The ring of `path` under `rules`.
export function ringOf(path: string, rules: RingRule[]): Ring {
  const n = normalizeRepoPath(path);
  if (n === null) return 0;
  let exact: Ring | undefined;
  let folded: Ring | undefined;
  for (const { glob, ring } of rules) {
    if (!isRing(ring) || typeof glob !== "string") continue;
    const re = globToRegExp(glob);
    if (!re) continue;
    if (exact === undefined && re.test(n)) exact = ring;
    if (folded === undefined && new RegExp(re.source, "i").test(n)) folded = ring;
    if (exact !== undefined && folded !== undefined) break;
  }
  return Math.min(exact ?? 1, folded ?? 1) as Ring;
}

// The files named, each with its ring, lowest ring first (ties in the order
// given), each file once.
export function ringsOf(files: string[], rules: RingRule[]): { file: string; ring: Ring }[] {
  return [...new Set(files)].map((file) => ({ file, ring: ringOf(file, rules) })).sort((a, b) => a.ring - b.ring);
}
