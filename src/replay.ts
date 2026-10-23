// The replay: a community's history step by step. Each step is the whole tree
// right after one action; this turns it into a graph the tree view can draw
// and says in words what happened.
import type { Graph, HistoryStep, Person } from "./api";

const SENTINEL = "0x0000000000000000000000000000000000000001";

// The tree after `step`, shaped like the live graph (endorsement weights and
// positions aren't recorded, so every endorsement counts as one).
export function graphAt(step: HistoryStep, live: Graph): Graph {
  const nodes: Record<string, Person> = {};
  for (const n of step.nodes) {
    nodes[n.id] = {
      id: n.id,
      name: n.name,
      currentRep: n.currentRep,
      totalWeight: "0",
      depth: n.depth,
      sentTreeVote: n.sentTreeVote,
      recTreeVotes: n.recTreeVotes,
      sentDagVotes: n.dagVotes.map((id) => ({ id, weight: "1", dist: 0, posInOther: 0 })),
      recDagVotes: [],
    };
  }
  for (const n of step.nodes) {
    for (const to of n.dagVotes) nodes[to]?.recDagVotes.push({ id: n.id, weight: "1", dist: 0, posInOther: 0 });
  }
  const root = step.nodes.find((n) => n.sentTreeVote === SENTINEL) ?? step.nodes.find((n) => n.depth === 0);
  return { ...live, version: step.index, rootId: root?.id ?? "", nodes };
}

// What happened in `step`, in words. `before` is the step before it (for
// people who left, and parents who were swapped with).
export function caption(step: HistoryStep, before: HistoryStep | undefined): string {
  const names = new Map<string, string>();
  for (const n of before?.nodes ?? []) names.set(n.id, n.name);
  for (const n of step.nodes) names.set(n.id, n.name);
  const who = (id: string) => names.get(id) || "Someone";
  const voter = who(step.voter);
  const recipient = who(step.recipient);
  switch (step.eventName) {
    case "JoinTreeEvent":
      return `${step.name || voter} joined under ${recipient}`;
    case "joinTreeAsRoot":
      return `${step.name || voter} started the tree`;
    case "AddDagVoteEvent":
      return `${voter} endorsed ${recipient}`;
    case "RemoveDagVoteEvent":
      return `${voter} stopped endorsing ${recipient}`;
    case "SwitchPositionWithParentEvent": {
      const parent = before?.nodes.find((n) => n.id === step.voter)?.sentTreeVote;
      return parent && names.has(parent) ? `${voter} climbed above ${who(parent)}` : `${voter} swapped places with their parent`;
    }
    case "MoveTreeVoteEvent":
      return `${voter} moved under ${recipient}`;
    case "LeaveTreeEvent":
      return `${voter} left`;
    case "ChangeNameEvent": {
      const old = before?.nodes.find((n) => n.id === step.voter)?.name;
      return old && old !== voter ? `${old} is now called ${voter}` : `${voter} changed their name`;
    }
    default:
      return voter;
  }
}

// The people a step is about, to highlight: who acted, and who it was aimed at.
export function actors(step: HistoryStep): { voter: string; recipient?: string; endorsement: boolean } {
  const endorsement = step.eventName === "AddDagVoteEvent" || step.eventName === "RemoveDagVoteEvent";
  const aimed = endorsement || step.eventName === "JoinTreeEvent" || step.eventName === "MoveTreeVoteEvent";
  return { voter: step.voter, recipient: aimed && step.recipient ? step.recipient : undefined, endorsement };
}
