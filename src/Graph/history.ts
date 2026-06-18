// Helpers for the in-graph history scrubber. The backend's /history endpoint
// returns global per-event snapshots; here we scope them to what's actually on
// screen — the currently VISIBLE (opened) nodes + the current mode (tree vs dag
// edges) — and fold a collapsed branch's hidden-children growth into a single
// aggregate step (the +N badge changing). A step is created only when the
// visible view changes, and its label is derived from WHAT changed (a join, a
// branch growing, or a dag vote in dag mode) — never from off-mode events.
import type { GraphDataRendering, NodeDataRendering } from "./GraphBase";

export type HistoryNode = {
  id: string;
  name: string;
  currentRep: string;
  depth: number;
  sentTreeVote: string;
  recTreeVotes: string[];
  dagVotes: string[];
};
export type HistoryStep = {
  index: number;
  eventName: string;
  voter: string;
  recipient: string;
  name: string;
  weight: string;
  blockNumber: number;
  nodes: HistoryNode[];
};

// The live view GraphFlow reports: rendered nodes (opened + collapsed-branch
// root badges), and for each collapsed root its hidden tree-descendants.
export type LiveView = {
  visibleIds: string[];
  collapseRoots: { id: string; descendants: string[] }[];
};

export type ViewStep = {
  label: string;
  graph: GraphDataRendering;
  collapsedIds: string[];
};

const short = (id: string) =>
  id && id.length > 8 ? `${id.slice(0, 5)}…${id.slice(-3)}` : id;

export const describeStep = (step?: ViewStep): string => step?.label ?? "";

export function buildViewSteps(
  history: HistoryStep[],
  view: LiveView,
  treeMode: boolean,
): ViewStep[] {
  const visible = new Set(view.visibleIds);
  if (history.length === 0 || visible.size === 0) return [];

  const rootIds = view.collapseRoots.map((r) => r.id);
  const rootDesc = new Map(
    view.collapseRoots.map((r) => [r.id, new Set(r.descendants)]),
  );
  const relevant = new Set(view.visibleIds);
  for (const r of view.collapseRoots) for (const d of r.descendants) relevant.add(d);

  const steps: ViewStep[] = [];
  let lastSig = "";
  let prevVisible = new Set<string>();
  let prevEdges = new Map<string, string>(); // visible id -> sorted parentIds
  let prevCounts = new Map<string, number>(); // root id -> hidden child count

  for (const step of history) {
    const present = new Set(
      step.nodes.filter((n) => relevant.has(n.id)).map((n) => n.id),
    );
    if (![...present].some((id) => visible.has(id))) continue;

    const graph: GraphDataRendering = {};
    for (const n of step.nodes) {
      if (!present.has(n.id)) continue;
      const parentIds: string[] = [];
      if (treeMode) {
        if (present.has(n.sentTreeVote)) parentIds.push(n.sentTreeVote);
      } else {
        for (const v of n.dagVotes) if (present.has(v)) parentIds.push(v);
      }
      graph[n.id] = {
        id: n.id,
        name: n.name,
        totalWeight: 0,
        currentRep: Number(n.currentRep),
        depth: n.depth,
        relRoot: "",
        sentTreeVote: n.sentTreeVote,
        recTreeVotes: n.recTreeVotes,
        parentIds: [...new Set(parentIds)],
        isVotable: false,
        isSwitchable: false,
        isDagVote: false,
      } as NodeDataRendering;
    }

    // Visible structure: opened nodes + their mode-edges among visible.
    const visiblePresent = [...present].filter((id) => visible.has(id));
    const edges = new Map<string, string>();
    for (const id of visiblePresent) {
      edges.set(
        id,
        graph[id].parentIds.filter((p) => visible.has(p)).sort().join(","),
      );
    }
    const counts = new Map<string, number>();
    for (const r of rootIds) {
      if (!present.has(r)) continue;
      let c = 0;
      for (const d of rootDesc.get(r) ?? []) if (present.has(d)) c++;
      counts.set(r, c);
    }

    const sig =
      visiblePresent
        .sort()
        .map((id) => `${id}:${edges.get(id)}`)
        .join("|") +
      "#" +
      [...counts.entries()].sort().map(([r, c]) => `${r}:${c}`).join(",");
    if (sig === lastSig) continue;
    lastSig = sig;

    // Label from the diff vs the previous shown step.
    let label = "";
    const newNodes = visiblePresent.filter((id) => !prevVisible.has(id));
    if (newNodes.length > 0) {
      const n0 = newNodes[0];
      const parent = graph[n0]?.sentTreeVote;
      label =
        parent && present.has(parent)
          ? `${short(n0)} joined under ${short(parent)}`
          : `${short(n0)} joined`;
    } else {
      const grown = rootIds.find(
        (r) => counts.has(r) && counts.get(r) !== (prevCounts.get(r) ?? 0),
      );
      if (grown) {
        label = `branch ${short(grown)} grew to ${counts.get(grown)} hidden`;
      } else {
        // an edge changed among visible nodes (a dag vote in dag mode)
        let changed = "";
        for (const id of visiblePresent) {
          const before = new Set(
            (prevEdges.get(id) ?? "").split(",").filter(Boolean),
          );
          const after = (edges.get(id) ?? "").split(",").filter(Boolean);
          const added = after.find((p) => !before.has(p));
          if (added) {
            changed = `${short(id)} voted for ${short(added)}`;
            break;
          }
          const removed = [...before].find((p) => !after.includes(p));
          if (removed) {
            changed = `${short(id)} removed vote for ${short(removed)}`;
            break;
          }
        }
        label = changed || "updated";
      }
    }

    steps.push({
      label,
      graph,
      collapsedIds: rootIds.filter((r) => present.has(r)),
    });

    prevVisible = new Set(visiblePresent);
    prevEdges = edges;
    prevCounts = counts;
  }

  // Collapse a run of consecutive aggregate-only steps into a single step (its
  // final count), so a burst of hidden-child joins shows as one "branch grew"
  // step rather than one per child.
  const merged: ViewStep[] = [];
  for (const s of steps) {
    const prev = merged[merged.length - 1];
    if (s.label.startsWith("branch ") && prev?.label.startsWith("branch ")) {
      merged[merged.length - 1] = s;
    } else {
      merged.push(s);
    }
  }
  return merged;
}
