// React Flow rendering of the Anthill graph. d3-dag is used purely as a layout
// calculator (Sugiyama, top-down layered) — the same layout as the old d3 SVG
// renderer — and React Flow draws colored circle nodes + gradient edges, so the
// look/feel is preserved while node/edge rendering and interactions become
// idiomatic React components.
import {
  BaseEdge,
  Background,
  Controls,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { interpolateRainbow } from "d3";
import {
  coordCenter,
  decrossOpt,
  graphStratify,
  layeringSimplex,
  sugiyama,
} from "d3-dag";
import { useMemo } from "react";

import {
  type GraphDataRendering,
  nameShortener,
  type NodeDataRendering,
} from "../GraphBase";

const NODE_RADIUS = 30;

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
  ring: boolean;
};
type AnthillNode = Node<AnthillNodeData, "anthill">;

type GradientEdgeData = {
  sourceColor: string;
  targetColor: string;
  width: number;
};
type GradientEdge = Edge<GradientEdgeData, "gradient">;

function AnthillNodeView({ data }: NodeProps<AnthillNode>) {
  const d = NODE_RADIUS * 2;
  return (
    <div style={{ position: "relative", width: d, height: d }}>
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
          fontSize: 11,
          textAlign: "center",
          lineHeight: 1.1,
          textShadow: "0 1px 2px rgba(0,0,0,0.65)",
          userSelect: "none",
          cursor: "pointer",
        }}
      >
        {data.label}
      </div>
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
  markerEnd,
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
        markerEnd={markerEnd}
        style={{ stroke: `url(#${gid})`, strokeWidth: data?.width ?? 2 }}
      />
    </>
  );
}

const nodeTypes = { anthill: AnthillNodeView };
const edgeTypes = { gradient: GradientEdgeView };

function layoutPositions(
  graph: GraphDataRendering,
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const data = Object.values(graph);
  if (data.length === 0) return pos;

  const dag = graphStratify()(data);
  sugiyama()
    .layering(layeringSimplex())
    .decross(decrossOpt())
    .coord(coordCenter())
    .nodeSize(() => [1.5 * 2 * NODE_RADIUS, 1.2 * 1.5 * 2 * NODE_RADIUS])(dag);

  for (const n of dag.nodes()) {
    pos.set(n.data.id, { x: n.x ?? 0, y: n.y ?? 0 });
  }
  return pos;
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
  const { nodes, edges } = useMemo(() => {
    const positions = layoutPositions(props.graph);
    const entries = Object.values(props.graph);

    const nodes: AnthillNode[] = entries.map((n) => {
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      return {
        id: n.id,
        type: "anthill",
        position: { x: p.x - NODE_RADIUS, y: p.y - NODE_RADIUS },
        draggable: false,
        data: {
          node: n,
          label: nameShortener(n.name),
          color: colorOf(n.id),
          ring: n.id === props.clickedNode,
        },
      };
    });

    const edges: GradientEdge[] = [];
    for (const n of entries) {
      for (const parentId of n.parentIds) {
        if (!props.graph[parentId]) continue;
        // The tree-vote edge is drawn thick, like the old renderer.
        const isTreeEdge = n.sentTreeVote === parentId;
        edges.push({
          id: `${parentId}->${n.id}`,
          source: parentId,
          target: n.id,
          type: "gradient",
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: colorOf(parentId),
            width: 16,
            height: 16,
          },
          data: {
            sourceColor: colorOf(parentId),
            targetColor: colorOf(n.id),
            width: isTreeEdge ? 6 : 2,
          },
        });
      }
    }

    return { nodes, edges };
  }, [props.graph, props.clickedNode]);

  return (
    <div className="Graph" style={{ width: "100%", height: "80vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        minZoom={0.1}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
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
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
