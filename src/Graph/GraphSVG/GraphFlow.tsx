// React Flow rendering of the Anthill graph with focus+context navigation:
//   - focus-distance sizing: nodes shrink the farther they are (by graph hops)
//     from the focused/clicked node, so the local area stays prominent.
//   - collapse/expand: a node's tree-subtree can be folded into a "+N" badge,
//     so you only render what you've opened.
//   - hover-enlarge: hovering a (small) node scales it up to reveal its label.
// d3-dag stays a pure layout calculator (Sugiyama, scalable heuristics).
import {
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { interpolateRainbow } from "d3";
import {
  coordCenter,
  decrossTwoLayer,
  graphStratify,
  layeringLongestPath,
  sugiyama,
} from "d3-dag";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type GraphDataRendering,
  nameShortener,
  type NodeDataRendering,
} from "../GraphBase";

const BASE_RADIUS = 30;
const MIN_RADIUS = 8;
const SHRINK = 0.8; // radius multiplier per hop away from focus

function radiusForDistance(distance: number): number {
  if (!Number.isFinite(distance)) return MIN_RADIUS;
  return Math.max(MIN_RADIUS, BASE_RADIUS * SHRINK ** distance);
}

// Same per-id rainbow hash the old renderer used, so colours are identical.
function colorOf(id: string): string {
  const hash = [...id].reduce(
    (acc, ch) => ch.charCodeAt(0) + ((acc << 5) - acc),
    0,
  );
  return interpolateRainbow(((Math.sin(hash) / 2 + 1 / 2) * 10) % 1);
}

type AnthillNodeData = {
  node: NodeDataRendering;
  label: string;
  color: string;
  radius: number;
  ring: boolean;
  hasChildren: boolean;
  collapsed: boolean;
  hiddenCount: number;
  onToggle: (id: string) => void;
};
type AnthillNode = Node<AnthillNodeData, "anthill">;

type GradientEdgeData = {
  sourceColor: string;
  targetColor: string;
  width: number;
};
type GradientEdge = Edge<GradientEdgeData, "gradient">;

function AnthillNodeView({ data }: NodeProps<AnthillNode>) {
  const [hovered, setHovered] = useState(false);
  const d = data.radius * 2;
  // Scale small nodes up on hover so the label/details become readable.
  const hoverScale = Math.min(5, Math.max(1, (BASE_RADIUS * 1.2) / data.radius));
  const fontSize = Math.max(7, data.radius * 0.5);

  return (
    <div
      style={{ position: "relative", width: d, height: d }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ opacity: 0 }}
      />
      <div
        style={{
          width: d,
          height: d,
          borderRadius: "50%",
          background: data.color,
          boxShadow: data.ring ? "0 0 0 4px #2b2b2b" : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontWeight: "bold",
          fontFamily: "sans-serif",
          fontSize,
          textAlign: "center",
          lineHeight: 1.1,
          textShadow: "0 1px 2px rgba(0,0,0,0.65)",
          userSelect: "none",
          cursor: "pointer",
          transform: hovered ? `scale(${hoverScale})` : "scale(1)",
          transformOrigin: "center",
          transition: "transform 0.12s ease",
          zIndex: hovered ? 1000 : 1,
          position: "relative",
        }}
      >
        {data.label}
      </div>
      {data.hasChildren && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggle(data.node.id);
          }}
          title={data.collapsed ? "Expand subtree" : "Collapse subtree"}
          style={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: 16,
            height: 16,
            padding: "0 4px",
            borderRadius: 8,
            border: "1px solid #888",
            background: "#fff",
            color: "#333",
            fontSize: 10,
            lineHeight: "14px",
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          {data.collapsed ? `+${data.hiddenCount}` : "−"}
        </button>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ opacity: 0 }}
      />
    </div>
  );
}

function GradientEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<GradientEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const gid = `grad-${id}`;
  return (
    <>
      <defs>
        <linearGradient
          id={gid}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={data?.sourceColor} />
          <stop offset="100%" stopColor={data?.targetColor} />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: `url(#${gid})`, strokeWidth: data?.width ?? 2 }}
      />
    </>
  );
}

const nodeTypes = { anthill: AnthillNodeView };
const edgeTypes = { gradient: GradientEdgeView };

// Undirected BFS hop-distance from the focus node to every node.
function distancesFrom(
  graph: GraphDataRendering,
  focus: string,
): Map<string, number> {
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)?.push(b);
  };
  for (const n of Object.values(graph)) {
    for (const p of n.parentIds) {
      if (graph[p]) {
        add(n.id, p);
        add(p, n.id);
      }
    }
  }
  const dist = new Map<string, number>();
  const start = graph[focus] ? focus : Object.keys(graph)[0];
  if (!start) return dist;
  const queue = [start];
  dist.set(start, 0);
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const dcur = dist.get(cur) ?? 0;
    for (const nb of adj.get(cur) ?? []) {
      if (!dist.has(nb)) {
        dist.set(nb, dcur + 1);
        queue.push(nb);
      }
    }
  }
  return dist;
}

export const GraphFlow = (props: {
  graph: GraphDataRendering;
  clickedNode: string;
  onNodeClick: (id: string, name: string, rep: number) => void;
  onNodeMouseEnter: (
    event: React.MouseEvent<HTMLElement>,
    node: NodeDataRendering,
  ) => void;
  onNodeMouseLeave: () => void;
}) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Reset collapse state when a different (sub)graph is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setCollapsed(new Set()), [props.graph]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes, edges } = useMemo(() => {
    const graph = props.graph;
    const distances = distancesFrom(graph, props.clickedNode);

    // Tree children (a node's tree parent is its sentTreeVote).
    const children = new Map<string, string[]>();
    for (const n of Object.values(graph)) {
      const parent = n.sentTreeVote;
      if (graph[parent]) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)?.push(n.id);
      }
    }

    // A node is hidden if any tree-ancestor is collapsed.
    const isHidden = (id: string): boolean => {
      let cur = graph[id]?.sentTreeVote;
      let guard = 0;
      while (cur && graph[cur] && guard++ < 1000) {
        if (collapsed.has(cur)) return true;
        cur = graph[cur].sentTreeVote;
      }
      return false;
    };

    // Count of hidden descendants for a collapsed node's badge.
    const subtreeCount = (id: string): number => {
      let total = 0;
      const stack = [...(children.get(id) ?? [])];
      let guard = 0;
      while (stack.length && guard++ < 100000) {
        const c = stack.pop() as string;
        total++;
        stack.push(...(children.get(c) ?? []));
      }
      return total;
    };

    const visible = Object.values(graph).filter((n) => !isHidden(n.id));
    const visibleIds = new Set(visible.map((n) => n.id));

    // Layout the visible nodes, sizing each layout cell by its (distance) radius.
    const positions = new Map<string, { x: number; y: number }>();
    if (visible.length > 0) {
      const layoutInput = visible.map((n) => ({
        id: n.id,
        parentIds: n.parentIds.filter((p) => visibleIds.has(p)),
      }));
      const dag = graphStratify()(layoutInput);
      sugiyama()
        .layering(layeringLongestPath())
        .decross(decrossTwoLayer())
        .coord(coordCenter())
        .nodeSize(() => [2 * BASE_RADIUS, 1.4 * 2 * BASE_RADIUS])
        .gap([BASE_RADIUS, BASE_RADIUS * 1.2])(dag);
      for (const node of dag.nodes()) {
        positions.set(node.data.id, { x: node.x ?? 0, y: node.y ?? 0 });
      }
    }

    const nodes: AnthillNode[] = visible.map((n) => {
      const r = radiusForDistance(distances.get(n.id) ?? Infinity);
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      const hasChildren = (children.get(n.id) ?? []).length > 0;
      const isCollapsed = collapsed.has(n.id);
      return {
        id: n.id,
        type: "anthill",
        position: { x: p.x - r, y: p.y - r },
        width: 2 * r,
        height: 2 * r,
        draggable: false,
        data: {
          node: n,
          label: nameShortener(n.name),
          color: colorOf(n.id),
          radius: r,
          ring: n.id === props.clickedNode,
          hasChildren,
          collapsed: isCollapsed,
          hiddenCount: isCollapsed ? subtreeCount(n.id) : 0,
          onToggle: toggleCollapse,
        },
      };
    });

    const edges: GradientEdge[] = [];
    for (const n of visible) {
      for (const parentId of n.parentIds) {
        if (!visibleIds.has(parentId)) continue;
        const isTreeEdge = n.sentTreeVote === parentId;
        const rFactor = Math.min(
          1,
          radiusForDistance(distances.get(n.id) ?? Infinity) / BASE_RADIUS,
        );
        edges.push({
          id: `${parentId}->${n.id}`,
          source: parentId,
          target: n.id,
          type: "gradient",
          data: {
            sourceColor: colorOf(parentId),
            targetColor: colorOf(n.id),
            width: Math.max(0.75, (isTreeEdge ? 6 : 2) * rFactor),
          },
        });
      }
    }

    return { nodes, edges };
  }, [props.graph, props.clickedNode, collapsed, toggleCollapse]);

  return (
    <div className="Graph" style={{ width: "100%", height: "80vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.05}
        onlyRenderVisibleElements={nodes.length > 300}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#ffffff" }}
        onNodeClick={(_event, node) =>
          props.onNodeClick(
            node.data.node.id,
            node.data.node.name,
            node.data.node.currentRep,
          )
        }
        onNodeMouseEnter={(event, node) =>
          props.onNodeMouseEnter(
            event as unknown as React.MouseEvent<HTMLElement>,
            node.data.node,
          )
        }
        onNodeMouseLeave={() => props.onNodeMouseLeave()}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
