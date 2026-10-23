// What the screens need, derived from the graph: reputation as numbers, rank,
// family (parent, children, siblings), how two people relate, and where
// someone's reputation comes from.
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

export function rankOf(graph: Graph, id: string): { rank: number; of: number } {
  const list = ranked(graph);
  return { rank: list.findIndex((p) => p.id === id) + 1, of: list.length };
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

// A stable, soft colour per person (used for avatars and tree nodes).
// (FNV-1a plus a final mix, so ids that differ only in their last characters
// still get clearly different hues.)
export function colorOf(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return `hsl(${(h >>> 0) % 360} 60% 52%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
