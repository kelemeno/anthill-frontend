// Timeline view of how the graph evolved. Fetches per-event snapshots from the
// backend's /history endpoint and lets you scrub / play through them, rendering
// each snapshot with the same GraphFlow renderer.
import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphDataRendering, NodeDataRendering } from "./GraphBase";
import { GraphFlow } from "./GraphSVG/GraphFlow";

const BACKEND_URL = "http://localhost:5001/";
const PLAY_INTERVAL_MS = 700;

type HistoryNode = {
  id: string;
  name: string;
  currentRep: string;
  depth: number;
  sentTreeVote: string;
  recTreeVotes: string[];
  dagVotes: string[];
};
type HistoryStep = {
  index: number;
  eventName: string;
  voter: string;
  recipient: string;
  name: string;
  weight: string;
  blockNumber: number;
  nodes: HistoryNode[];
};

const short = (id: string) =>
  id && id.length > 8 ? `${id.slice(0, 5)}…${id.slice(-3)}` : id;

function describe(step: HistoryStep): string {
  switch (step.eventName) {
    case "JoinTreeEvent":
      return step.recipient &&
        step.recipient !== "0x0000000000000000000000000000000000000001"
        ? `${short(step.voter)} joined under ${short(step.recipient)}`
        : `${short(step.voter)} joined as root`;
    case "AddDagVoteEvent":
      return `${short(step.voter)} → reputation vote → ${short(step.recipient)}`;
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

// Build the renderer graph from a snapshot. parentIds = tree parent (thick edge)
// + dag-vote recipients (thin edges), so both structures show as they appear.
function toRendering(nodes: HistoryNode[]): GraphDataRendering {
  const present = new Set(nodes.map((n) => n.id));
  const graph: GraphDataRendering = {};
  for (const n of nodes) {
    // Tree parent first (drawn thick), then dag-vote recipients (thin),
    // deduped — a join auto-adds a dag vote to the parent, which would
    // otherwise duplicate the tree edge.
    const parentIds: string[] = [];
    const seen = new Set<string>();
    const add = (p: string) => {
      if (present.has(p) && !seen.has(p)) {
        seen.add(p);
        parentIds.push(p);
      }
    };
    add(n.sentTreeVote);
    for (const v of n.dagVotes) add(v);
    graph[n.id] = {
      id: n.id,
      name: n.name,
      totalWeight: 0,
      currentRep: Number(n.currentRep),
      depth: n.depth,
      relRoot: "",
      sentTreeVote: n.sentTreeVote,
      recTreeVotes: n.recTreeVotes,
      parentIds,
      isVotable: false,
      isSwitchable: false,
      isDagVote: false,
    } as NodeDataRendering;
  }
  return graph;
}

export const GraphHistory = () => {
  const [steps, setSteps] = useState<HistoryStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(BACKEND_URL + "history")
      .then((r) => {
        if (!r.ok) throw new Error(`history ${r.status}`);
        return r.json();
      })
      .then((d: { steps: HistoryStep[] }) => {
        setSteps(d.steps);
        setCurrent(d.steps.length ? d.steps.length - 1 : 0);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Play: advance one step on an interval, stop at the end.
  useEffect(() => {
    if (!playing || steps.length === 0) return;
    timer.current = setInterval(() => {
      setCurrent((c) => {
        if (c >= steps.length - 1) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, PLAY_INTERVAL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, steps.length]);

  const step = steps[current];
  const graph = useMemo(
    () => (step ? toRendering(step.nodes) : {}),
    [step],
  );
  const rootId = useMemo(
    () => step?.nodes.find((n) => n.depth === 0)?.id ?? "",
    [step],
  );

  const play = () => {
    if (current >= steps.length - 1) setCurrent(0);
    setPlaying(true);
  };

  if (error) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif" }}>
        Couldn't load history from {BACKEND_URL}history — is the backend
        running? <br />
        <code>{error}</code>
      </div>
    );
  }
  if (steps.length === 0) {
    return (
      <div style={{ padding: 20, fontFamily: "sans-serif" }}>
        Loading history…
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          fontFamily: "sans-serif",
          borderBottom: "1px solid #eee",
        }}
      >
        <strong>History</strong>
        <button type="button" onClick={() => (playing ? setPlaying(false) : play())}>
          {playing ? "⏸ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={current}
          onChange={(e) => {
            setPlaying(false);
            setCurrent(Number(e.target.value));
          }}
          style={{ flex: 1, maxWidth: 600 }}
        />
        <span style={{ whiteSpace: "nowrap" }}>
          {current + 1} / {steps.length}
        </span>
        <span style={{ color: "#444", minWidth: 280 }}>{describe(step)}</span>
      </div>
      <GraphFlow
        graph={graph}
        clickedNode={rootId}
        expandAll
        onNodeClick={() => {}}
        onNodeMouseEnter={() => {}}
        onNodeMouseLeave={() => {}}
      />
    </div>
  );
};
