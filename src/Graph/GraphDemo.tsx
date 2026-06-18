// Dev/demo page for stress-testing the React Flow graph rendering at scale.
// Open /demo?n=255 (or use the buttons) to generate a synthetic binary-tree
// graph of N nodes — with a few cross (reputation-vote) edges — and render it
// through the real GraphFlow component. Lets us see layout + render behaviour
// on graphs much larger than the seeded contract, without touching the chain.
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { GraphDataRendering, NodeDataRendering } from "./GraphBase";
import { GraphFlow } from "./GraphSVG/GraphFlow";

const idOf = (i: number) => "0x" + i.toString(16).padStart(40, "0");

function buildSyntheticGraph(n: number): GraphDataRendering {
  const graph: GraphDataRendering = {};
  for (let i = 0; i < n; i++) {
    const id = idOf(i);
    const parentIndex = i === 0 ? -1 : Math.floor((i - 1) / 2);
    const parentId = parentIndex >= 0 ? idOf(parentIndex) : "";
    const depth = Math.floor(Math.log2(i + 1));
    const parentIds: string[] = parentIndex >= 0 ? [parentId] : [];

    // Sprinkle in a few cross "reputation vote" edges to a grandparent so the
    // graph isn't a pure tree (these render as the thin, non-tree edges).
    if (i > 3 && i % 6 === 0) {
      const grandparent = Math.floor((parentIndex - 1) / 2);
      if (grandparent >= 0) parentIds.push(idOf(grandparent));
    }

    graph[id] = {
      id,
      name: "N" + i,
      totalWeight: 0,
      currentRep: (n - i) * 1e18,
      depth,
      relRoot: idOf(0),
      sentTreeVote: parentId, // the (thick) tree edge points at the parent
      recTreeVotes: [],
      parentIds,
      isVotable: false,
      isSwitchable: false,
      isDagVote: false,
    } as NodeDataRendering;
  }
  return graph;
}

const PRESETS = [15, 31, 63, 127, 255, 511, 1023];

export const GraphDemo = () => {
  const [params, setParams] = useSearchParams();
  const n = Math.max(1, Math.min(4000, Number(params.get("n")) || 63));
  const graph = useMemo(() => buildSyntheticGraph(n), [n]);

  const setN = (value: number) => setParams({ n: String(value) });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          flexWrap: "wrap",
        }}
      >
        <strong>Graph demo</strong>
        <span>nodes: {n}</span>
        <input
          type="range"
          min={1}
          max={1023}
          value={Math.min(n, 1023)}
          onChange={(e) => setN(Number(e.target.value))}
          style={{ width: 240 }}
        />
        {PRESETS.map((value) => (
          <button type="button" key={value} onClick={() => setN(value)}>
            {value}
          </button>
        ))}
      </div>
      <GraphFlow
        graph={graph}
        clickedNode={idOf(0)}
        treeMode={true}
        onNodeClick={() => {}}
        onNodeMouseEnter={() => {}}
        onNodeMouseLeave={() => {}}
      />
    </div>
  );
};
