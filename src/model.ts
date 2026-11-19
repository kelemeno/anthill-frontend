// What the screens need, derived from the graph: reputation as numbers, rank,
// family (parent, children, siblings), how two people relate, and where
// someone's reputation comes from.
import type { CSSProperties } from "react";

import type { Graph, Person } from "./api";

const SENTINEL = "0x0000000000000000000000000000000000000001";
const UNIT = 10n ** 18n;

// 18-decimal string -> number (fine for display)
export function toNumber(value: string | bigint): number {
  const v = typeof value === "bigint" ? value : BigInt(value);
  return Number(v / 10n ** 12n) / 1e6;
}

export function rep(p: Person | undefined): number {
  return p ? toNumber(p.currentRep) : 0;
}

export function formatRep(value: number): string {
  return value.toFixed(2);
}

export function members(graph: Graph): Person[] {
  return Object.values(graph.nodes).filter((p) => p.id !== SENTINEL);
}

export function person(graph: Graph, id: string | undefined): Person | undefined {
  return id === undefined || id === SENTINEL ? undefined : graph.nodes[id];
}

export function parentOf(graph: Graph, p: Person) {
  return person(graph, p.sentTreeVote);
}

export function childrenOf(graph: Graph, p: Person): Person[] {
  return p.recTreeVotes.map((id) => graph.nodes[id]).filter(Boolean);
}

export function siblingsOf(graph: Graph, p: Person): Person[] {
  const parent = parentOf(graph, p);
  return parent ? childrenOf(graph, parent).filter((c) => c.id !== p.id) : [];
}

// root first, ending with p
export function pathTo(graph: Graph, p: Person): Person[] {
  const path: Person[] = [];
  let cur: Person | undefined = p;
  let guard = 0;
  while (cur && guard++ < 1000) {
    path.unshift(cur);
    cur = parentOf(graph, cur);
  }
  return path;
}

export function ranked(graph: Graph): Person[] {
  return members(graph).sort((a, b) => {
    const d = BigInt(b.currentRep) - BigInt(a.currentRep);
    return d > 0n ? 1 : d < 0n ? -1 : a.name.localeCompare(b.name);
  });
}

// Ties share a rank, as on the server: 1 + how many have strictly more
// reputation. 0 for someone not in the tree.
export function rankOf(graph: Graph, id: string): { rank: number; of: number } {
  const list = members(graph);
  const me = person(graph, id);
  if (!me) return { rank: 0, of: list.length };
  const mine = BigInt(me.currentRep);
  return { rank: 1 + list.filter((p) => BigInt(p.currentRep) > mine).length, of: list.length };
}

// Everyone by reputation with their rank (ties share one, like rankOf).
export function rankedWithRank(graph: Graph): { p: Person; rank: number }[] {
  const list = ranked(graph);
  const out: { p: Person; rank: number }[] = [];
  list.forEach((p, i) => {
    const prev = out[i - 1];
    const tied = prev && BigInt(prev.p.currentRep) === BigInt(p.currentRep);
    out.push({ p, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}

// The tree level, counting the root as level 1.
export function level(p: Person): number {
  return p.depth + 1;
}

// How `them` relates to `me`, in a few words ("your parent", "2 levels above
// you", ...). Undefined when they're the same person or one isn't in the tree.
export function relation(graph: Graph, me: Person | undefined, them: Person): string | undefined {
  if (!me || me.id === them.id) return undefined;
  if (me.sentTreeVote === them.id) return "Your parent";
  if (them.sentTreeVote === me.id) return "Under you";
  if (me.sentTreeVote === them.sentTreeVote) return "Next to you";
  const myPath = pathTo(graph, me).map((p) => p.id);
  const theirPath = pathTo(graph, them).map((p) => p.id);
  if (myPath.includes(them.id)) return `${me.depth - them.depth} levels above you, on your branch`;
  if (theirPath.includes(me.id)) return `${them.depth - me.depth} levels below you, on your branch`;
  const diff = me.depth - them.depth;
  if (diff > 0) return `${diff} ${diff === 1 ? "level" : "levels"} above you`;
  if (diff < 0) return `${-diff} ${diff === -1 ? "level" : "levels"} below you`;
  return "On your level";
}

// Each endorsement someone receives adds the endorser's reputation times the
// share of their votes it carries (weight / their total weight).
export function endorsementsIn(graph: Graph, p: Person) {
  return p.recDagVotes
    .map((v) => {
      const voter = graph.nodes[v.id];
      if (!voter) return undefined;
      const total = BigInt(voter.totalWeight);
      const adds =
        total === 0n ? 0n : (BigInt(voter.currentRep) * BigInt(v.weight)) / total;
      return { from: voter, adds: toNumber(adds) };
    })
    .filter((e): e is { from: Person; adds: number } => e !== undefined)
    .sort((a, b) => b.adds - a.adds);
}

// Who someone endorses, and the share of their reputation each one gets.
export function endorsementsOut(graph: Graph, p: Person) {
  const total = BigInt(p.totalWeight);
  return p.sentDagVotes
    .map((v) => {
      const to = graph.nodes[v.id];
      if (!to) return undefined;
      const share = total === 0n ? 0 : Number((BigInt(v.weight) * 1000n) / total) / 1000;
      return { to, share, gives: rep(p) * share };
    })
    .filter((e): e is { to: Person; share: number; gives: number } => e !== undefined)
    .sort((a, b) => rep(b.to) - rep(a.to));
}

export const BASE_REPUTATION = toNumber(UNIT);

// A stable hue per person. (FNV-1a plus a final mix, so ids that differ only
// in their last characters still get clearly different hues.)
function hueOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) % 360;
}

// A stable, soft colour per person (used for avatars and tree nodes): the
// look from before dark mode, darkened only as far as white initials need to
// pass WCAG AA (yellows and greens were as low as 1.7:1; blues and violets
// keep their colour).
export function colorOf(id: string): string {
  const h = hueOf(id);
  return `hsl(${h} 60% ${readableLightness(h, 60, 52)}%)`;
}

// WCAG contrast of white on hsl(h s% l%).
export function whiteContrast(h: number, s: number, l: number): number {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel(0) + 0.7152 * channel(8) + 0.0722 * channel(4);
  return 1.05 / (lum + 0.05);
}

// The lightness, from `from` down, at which white on hsl(h s% l%) passes WCAG
// AA (4.6, a little over 4.5, so browsers' rounding can't take it under).
const lightness = new Map<string, number>();
function readableLightness(h: number, s: number, from: number): number {
  const key = `${h} ${s} ${from}`;
  let l = lightness.get(key);
  if (l === undefined) {
    l = from;
    while (l > 20 && whiteContrast(h, s, l) < 4.6) l--;
    lightness.set(key, l);
  }
  return l;
}

// Its colour in dark mode: the same hue, a little calmer and darker, and dark
// enough for white initials to pass WCAG AA (yellows and greens need it
// darkest).
export function darkColorOf(id: string): string {
  const h = hueOf(id);
  return `hsl(${h} 55% ${readableLightness(h, 55, 50)}%)`;
}

// A community's mark (its initial on a tile): a hue picked from its address,
// as a gradient whose both ends keep white text at WCAG AA, as people's
// colours do. The same in both schemes: a coloured tile reads on either.
const MARK_HUES = [243, 199, 160, 32, 340, 270, 12, 186];
export function markBackground(id: string): string {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const h = MARK_HUES[hash % MARK_HUES.length];
  return `linear-gradient(135deg, hsl(${h} 70% ${readableLightness(h, 70, 58)}%), hsl(${h} 65% ${readableLightness(h, 65, 46)}%))`;
}

// For an element with the avatar or avatar-fill class (index.css): its colour
// in each scheme.
export function avatarStyle(id: string): CSSProperties {
  return { "--avatar": colorOf(id), "--avatar-dark": darkColorOf(id) } as CSSProperties;
}

// (by code point, so a name starting with an emoji keeps it whole)
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).map((w) => Array.from(w));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).join("").toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
