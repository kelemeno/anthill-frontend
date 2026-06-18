// Helpers for the in-graph history scrubber. The backend's /history endpoint
// returns global per-event snapshots; here we scope them to the currently
// displayed node set + mode (tree vs dag), keeping only the steps where that
// displayed view actually changed.
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

export type ViewStep = {
  eventName: string;
  voter: string;
  recipient: string;
  name: string;
  graph: GraphDataRendering;
};

const short = (id: string) =>
  id && id.length > 8 ? `${id.slice(0, 5)}…${id.slice(-3)}` : id;

export function describeStep(step?: ViewStep): string {
  if (!step) return "";
  switch (step.eventName) {
    case "JoinTreeEvent":
      return step.recipient &&
        step.recipient !== "0x0000000000000000000000000000000000000001"
        ? `${short(step.voter)} joined under ${short(step.recipient)}`
        : `${short(step.voter)} joined as root`;
    case "AddDagVoteEvent":
      return `${short(step.voter)} voted for ${short(step.recipient)}`;
    case "RemoveDagVoteEvent":
      return `${short(step.voter)} removed vote for ${short(step.recipient)}`;
    case "LeaveTreeEvent":
      return `${short(step.voter)} left the tree`;
    case "SwitchPositionWithParentEvent":
      return `${short(step.voter)} switched with its parent`;
    case "MoveTreeVoteEvent":
      return `${short(step.voter)} moved under ${short(step.recipient)}`;
    case "ChangeNameEvent":
      return `${short(step.voter)} renamed to "${step.name}"`;
    default:
      return step.eventName;
  }
}

// Restrict each global snapshot to `displayedIds`, build edges from tree votes
// (treeMode) OR dag votes (rep mode) — keeping the two separate — and dedupe
// consecutive snapshots that produce the identical displayed view.
export function buildViewSteps(
  history: HistoryStep[],
  displayedIds: string[],
  treeMode: boolean,
): ViewStep[] {
  if (history.length === 0 || displayedIds.length === 0) return [];
  const wanted = new Set(displayedIds);
  const steps: ViewStep[] = [];
  let lastSig = "";

  for (const step of history) {
    const present = new Set(
      step.nodes.filter((n) => wanted.has(n.id)).map((n) => n.id),
    );
    if (present.size === 0) continue;

    const graph: GraphDataRendering = {};
    for (const n of step.nodes) {
      if (!wanted.has(n.id)) continue;
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

    // Signature of the displayed view (nodes + their edges); skip no-op steps.
    const sig = Object.keys(graph)
      .sort()
      .map((id) => `${id}:${[...graph[id].parentIds].sort().join(",")}`)
      .join("|");
    if (sig === lastSig) continue;
    lastSig = sig;

    steps.push({
      eventName: step.eventName,
      voter: step.voter,
      recipient: step.recipient,
      name: step.name,
      graph,
    });
  }
  return steps;
}
