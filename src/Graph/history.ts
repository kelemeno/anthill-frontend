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
  // The currently focused node + the active view — the history is scoped to
  // these so the scrubber always shows the changes relevant to what's on screen.
  focus: string;
  viewMode: "tree" | "votes" | "rep";
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
): ViewStep[] {
  const visible = new Set(view.visibleIds);
  if (history.length === 0 || visible.size === 0) return [];

  const { focus, viewMode } = view;
  const rootIds = view.collapseRoots.map((r) => r.id);
  const rootDesc = new Map(
    view.collapseRoots.map((r) => [r.id, new Set(r.descendants)]),
  );
  const relevant = new Set(view.visibleIds);
  for (const r of view.collapseRoots) for (const d of r.descendants) relevant.add(d);

  const steps: ViewStep[] = [];
  let lastSig = "";
  let prevVisible = new Set<string>();
  let prevCounts = new Map<string, number>(); // root id -> hidden child count
  let prevDag = ""; // previous view-specific vote set (for diffing labels)

  for (const step of history) {
    const present = new Set(
      step.nodes.filter((n) => relevant.has(n.id)).map((n) => n.id),
    );
    if (![...present].some((id) => visible.has(id))) continue;

    // The focused node's votes at this point in time.
    const focusNode = step.nodes.find((n) => n.id === focus);
    const outVotes = (focusNode?.dagVotes ?? []).filter((id) => present.has(id));
    const inVoters = step.nodes
      .filter((n) => present.has(n.id) && n.dagVotes.includes(focus))
      .map((n) => n.id);

    const graph: GraphDataRendering = {};
    for (const n of step.nodes) {
      if (!present.has(n.id)) continue;
      graph[n.id] = {
        id: n.id,
        name: n.name,
        totalWeight: 0,
        currentRep: Number(n.currentRep),
        depth: n.depth,
        relRoot: "",
        sentTreeVote: n.sentTreeVote,
        recTreeVotes: n.recTreeVotes,
        parentIds: present.has(n.sentTreeVote) ? [n.sentTreeVote] : [],
        isVotable: false,
        isSwitchable: false,
        isDagVote: false,
      } as NodeDataRendering;
    }
    // Carry the focus's votes so the overlay renders during playback too.
    if (graph[focus]) {
      graph[focus].dagEdges = [
        ...outVotes.map((to) => ({ to, weight: 1, outgoing: true })),
        ...inVoters.map((to) => ({ to, weight: 1, outgoing: false })),
      ];
    }

    // Visible tree structure (opened nodes + their tree edges among visible).
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
    // View-specific vote signature: outgoing in "+ Votes", incoming in "Rep".
    const dagSig =
      viewMode === "votes"
        ? `out:${[...outVotes].sort().join(",")}`
        : viewMode === "rep"
          ? `in:${[...inVoters].sort().join(",")}`
          : "";

    const sig = `${visiblePresent
      .sort()
      .map((id) => `${id}:${edges.get(id)}`)
      .join("|")}#${[...counts.entries()]
      .sort()
      .map(([r, c]) => `${r}:${c}`)
      .join(",")}||${dagSig}`;
    if (sig === lastSig) continue;
    lastSig = sig;

    // Label from the diff vs the previous shown step.
    let label = "";
    const newNodes = visiblePresent.filter((id) => !prevVisible.has(id));
    const grown = rootIds.find(
      (r) => counts.has(r) && counts.get(r) !== (prevCounts.get(r) ?? 0),
    );
    if (newNodes.length > 0) {
      const n0 = newNodes[0];
      const parent = graph[n0]?.sentTreeVote;
      label =
        parent && present.has(parent)
          ? `${short(n0)} joined under ${short(parent)}`
          : `${short(n0)} joined`;
    } else if (grown) {
      label = `branch ${short(grown)} grew to ${counts.get(grown)} hidden`;
    } else if (dagSig !== prevDag) {
      const before = new Set(
        prevDag.replace(/^(out|in):/, "").split(",").filter(Boolean),
      );
      const now = viewMode === "votes" ? outVotes : inVoters;
      const added = now.find((v) => !before.has(v));
      const removed = [...before].find((v) => !now.includes(v));
      if (viewMode === "votes") {
        label = added
          ? `${short(focus)} voted for ${short(added)}`
          : removed
            ? `${short(focus)} removed vote for ${short(removed)}`
            : "votes changed";
      } else {
        label = added
          ? `${short(added)} voted for ${short(focus)}`
          : removed
            ? `${short(removed)} removed vote for ${short(focus)}`
            : "votes changed";
      }
    } else {
      label = "updated";
    }

    steps.push({
      label,
      graph,
      collapsedIds: rootIds.filter((r) => present.has(r)),
    });

    prevVisible = new Set(visiblePresent);
    prevCounts = counts;
    prevDag = dagSig;
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
