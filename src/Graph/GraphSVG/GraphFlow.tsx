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
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { interpolateRainbow } from "d3";
import {
  coordCenter,
  decrossDfs,
  graphStratify,
  layeringLongestPath,
  sugiyama,
} from "d3-dag";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type GraphDataRendering,
  nameShortener,
  type NodeDataRendering,
} from "../GraphBase";

const BASE_RADIUS = 30;
const MIN_RADIUS = 8;
const SHRINK = 0.8; // radius multiplier per hop away from focus

// Touch devices have no hover; enlarge tap targets (the collapse badge) there.
const IS_TOUCH =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: none)").matches;

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
  onSelect: () => void;
  // Touch only: open the node's popover (info + actions) anchored to the tapped
  // element — the popover is otherwise hover-driven and unreachable on a phone.
  onInfo: (el: HTMLElement) => void;
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
  // Scale the whole node (circle + collapse button) up on hover, so the label
  // becomes readable AND the collapse button becomes a big, easy target. The
  // button lives inside the hover region so reaching it keeps the node enlarged.
  const hoverScale = Math.min(3, Math.max(1, (BASE_RADIUS * 1.1) / data.radius));
  const fontSize = Math.max(7, data.radius * 0.5);

  return (
    <div
      style={{
        position: "relative",
        width: d,
        height: d,
        transform: hovered ? `scale(${hoverScale})` : "scale(1)",
        transformOrigin: "center",
        // Soft ease-out so the hover-zoom glides instead of snapping.
        transition: "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        zIndex: hovered ? 1000 : 1,
      }}
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
        // pointerup fires on a real touch tap (unlike hover/onNodeClick, which
        // the pan/zoom layer or touch hardware swallow). On a phone a tap opens
        // the popover (info + actions) — there's no hover to trigger it — while
        // on desktop it selects/focuses as before. Drilling stays on the badge.
        onPointerUp={(e) => {
          if (IS_TOUCH) data.onInfo(e.currentTarget as HTMLElement);
          else data.onSelect();
        }}
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
            // Kept inside the node box so hovering it keeps the node enlarged.
            bottom: IS_TOUCH ? -6 : 0,
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: IS_TOUCH ? 28 : 16,
            height: IS_TOUCH ? 24 : 14,
            padding: "0 6px",
            borderRadius: IS_TOUCH ? 12 : 7,
            border: "1px solid #888",
            background: "#fff",
            color: "#333",
            fontSize: IS_TOUCH ? 13 : 9,
            lineHeight: IS_TOUCH ? "22px" : "12px",
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

// Re-fits the view whenever the displayed graph / focus changes, so a reload or
// navigation always opens centered instead of scrolled off somewhere.
function AutoFitView({
  graph,
  focus,
}: {
  graph: GraphDataRendering;
  focus: string;
}) {
  const { fitView, getNode } = useReactFlow();
  const prevFocus = useRef<string | null>(null);
  const prevWorld = useRef<{ x: number; y: number } | null>(null);
  // First fit (initial load) is instant — no animated shift on open. Later
  // re-fits (navigation) animate.
  const firstFit = useRef(true);
  const centerOf = (node: ReturnType<typeof getNode>) =>
    node
      ? {
          x: node.position.x + (node.width ?? 0) / 2,
          y: node.position.y + (node.height ?? 0) / 2,
        }
      : null;
  // Re-fit only when the loaded graph or focus changes — NOT on hover/collapse,
  // so peeking a branch open never moves the viewport out from under the cursor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const world = centerOf(getNode(focus));
      // How far the focused node moved since the last fit. ~0 means the layout
      // is unchanged (e.g. toggling tree/votes/reputation, which share node
      // positions) — keep the viewport so the switch isn't jumpy. Any real move
      // (first/staged load, navigation, re-layout) means re-fit and centre.
      const moved =
        prevFocus.current === focus && world && prevWorld.current
          ? Math.hypot(
              prevWorld.current.x - world.x,
              prevWorld.current.y - world.y,
            )
          : Number.POSITIVE_INFINITY;
      if (moved >= 1) {
        // First fit (initial load) snaps instantly — no shift on open; later
        // re-fits (navigation) animate.
        fitView({ padding: 0.15, duration: firstFit.current ? 0 : 300 });
        firstFit.current = false;
      }
      prevFocus.current = focus;
      prevWorld.current = world;
    });
    return () => cancelAnimationFrame(id);
  }, [graph, focus]);
  return null;
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
        style={{
          stroke: `url(#${gid})`,
          strokeWidth: data?.width ?? 2,
          // matches the node hover-zoom easing, so curves thicken in sync
          transition: "stroke-width 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </>
  );
}

const nodeTypes = { anthill: AnthillNodeView };
const edgeTypes = { gradient: GradientEdgeView };

// --- Reputation (dag-vote) view ---------------------------------------------
// A focused 3-row layout: the selected person in the middle, everyone they vote
// for above (outgoing reputation), everyone who votes for them below (incoming).
// Edges go only to/from the centre, coloured by direction and thickened by vote
// weight. No tree-collapse — this is a flat 1-hop neighbourhood.
const DAG_ROW_GAP = 240;
const DAG_COL_GAP = 130;
const DAG_OUT_COLOR = "#2f855a"; // green — people the focus votes for
const DAG_IN_COLOR = "#2b6cb0"; // blue — people who vote for the focus

function dagLayout(
  graph: GraphDataRendering,
  clickedNode: string,
  onNodeClick: (id: string, name: string, rep: number) => void,
): { nodes: AnthillNode[]; edges: GradientEdge[] } {
  const focusId = graph[clickedNode]
    ? clickedNode
    : (Object.values(graph).sort((a, b) => a.depth - b.depth)[0]?.id ?? "");
  const focus = graph[focusId];
  if (!focus) return { nodes: [], edges: [] };

  // outgoing = focus votes for these (its parentIds); incoming = these vote for focus.
  const outgoing = focus.parentIds.filter((id) => graph[id] && id !== focusId);
  const outSet = new Set(outgoing);
  const incoming = Object.values(graph)
    .filter(
      (n) =>
        n.id !== focusId && !outSet.has(n.id) && n.parentIds.includes(focusId),
    )
    .map((n) => n.id);

  const weight = new Map<string, number>();
  for (const e of focus.dagEdges ?? []) weight.set(e.to, e.weight);
  const maxW = Math.max(1, ...weight.values());
  const widthFor = (id: string) => 1.5 + 5 * ((weight.get(id) ?? maxW) / maxW);

  const pos = new Map<string, { x: number; y: number }>();
  pos.set(focusId, { x: 0, y: 0 });
  const place = (ids: string[], y: number) => {
    ids.forEach((id, i) => {
      pos.set(id, { x: (i - (ids.length - 1) / 2) * DAG_COL_GAP, y });
    });
  };
  place(outgoing, -DAG_ROW_GAP);
  place(incoming, DAG_ROW_GAP);

  const nodes: AnthillNode[] = [focusId, ...outgoing, ...incoming].map((id) => {
    const n = graph[id];
    const r = id === focusId ? BASE_RADIUS : BASE_RADIUS * SHRINK;
    const p = pos.get(id) ?? { x: 0, y: 0 };
    return {
      id,
      type: "anthill",
      position: { x: p.x - r, y: p.y - r },
      width: 2 * r,
      height: 2 * r,
      draggable: false,
      data: {
        node: n,
        label: nameShortener(n.name),
        color: colorOf(id),
        radius: r,
        ring: id === clickedNode,
        hasChildren: false,
        collapsed: false,
        hiddenCount: 0,
        onToggle: () => {},
        onSelect: () => onNodeClick(n.id, n.name, n.currentRep),
        onInfo: () => {},
      },
    };
  });

  const edges: GradientEdge[] = [];
  // recipients sit above → their bottom handle connects to the focus' top.
  for (const id of outgoing) {
    edges.push({
      id: `out-${focusId}-${id}`,
      source: id,
      target: focusId,
      type: "gradient",
      data: {
        sourceColor: DAG_OUT_COLOR,
        targetColor: DAG_OUT_COLOR,
        width: widthFor(id),
      },
    });
  }
  // voters sit below → focus' bottom handle connects to their top.
  for (const id of incoming) {
    edges.push({
      id: `in-${focusId}-${id}`,
      source: focusId,
      target: id,
      type: "gradient",
      data: {
        sourceColor: DAG_IN_COLOR,
        targetColor: DAG_IN_COLOR,
        width: widthFor(id),
      },
    });
  }
  return { nodes, edges };
}

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

// Sugiyama layout for a set of nodes; returns center positions by id.
function layoutPositions(
  visible: NodeDataRendering[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (visible.length === 0) return positions;
  const visibleIds = new Set(visible.map((n) => n.id));
  const layoutInput = visible.map((n) => ({
    id: n.id,
    parentIds: n.parentIds.filter((p) => visibleIds.has(p)),
  }));
  const dag = graphStratify()(layoutInput);
  sugiyama()
    .layering(layeringLongestPath())
    // Deterministic DFS ordering: stable left-to-right order that doesn't
    // re-shuffle when a branch opens.
    .decross(decrossDfs())
    .coord(coordCenter())
    .nodeSize(() => [2 * BASE_RADIUS, 1.4 * 2 * BASE_RADIUS])
    .gap([BASE_RADIUS, BASE_RADIUS * 1.2])(dag);
  for (const node of dag.nodes()) {
    positions.set(node.data.id, { x: node.x ?? 0, y: node.y ?? 0 });
  }
  return positions;
}

// Default collapse state: keep the top 3 levels open and fold everything below
// (relative to the shallowest node in the displayed graph), so the graph opens
// compact and you expand to drill in.
function defaultCollapsed(graph: GraphDataRendering): Set<string> {
  const nodes = Object.values(graph);
  if (nodes.length === 0) return new Set();
  const minDepth = Math.min(...nodes.map((n) => n.depth));
  const hasChildren = new Set(
    nodes.map((n) => n.sentTreeVote).filter((p) => graph[p]),
  );
  const result = new Set<string>();
  for (const n of nodes) {
    if (n.depth >= minDepth + 2 && hasChildren.has(n.id)) result.add(n.id);
  }
  return result;
}

export const GraphFlow = (props: {
  graph: GraphDataRendering;
  clickedNode: string;
  // Tree mode = hierarchy with collapse/drill. Reputation (dag) mode = flat
  // 3-row vote view (no collapse).
  treeMode: boolean;
  // Which dag-vote overlay the focused node shows on the tree: none / outgoing
  // (green) / incoming (blue).
  viewMode: "tree" | "votes" | "rep";
  onNodeClick: (id: string, name: string, rep: number) => void;
  onNodeMouseEnter: (
    event: React.MouseEvent<HTMLElement>,
    node: NodeDataRendering,
  ) => void;
  onNodeMouseLeave: () => void;
  // When true, start fully expanded (no default top-3 collapse).
  expandAll?: boolean;
  // Controlled collapse for history playback: render exactly these nodes
  // collapsed (no internal collapse/hover/select), so playback mirrors the
  // live view's opened/collapsed structure.
  forcedCollapsed?: Set<string>;
  // Graph used for layout + fit (positions). Defaults to `graph`. During
  // history playback this is the stable full view, so positions and the
  // viewport stay fixed while the rendered subset (`graph`) changes per step —
  // nodes appear/disappear in place instead of the whole graph jumping.
  layoutGraph?: GraphDataRendering;
  // Reports the live view (rendered nodes + collapsed-branch roots & their
  // hidden descendants) so the history scrubber can scope to it.
  onViewChange?: (view: {
    visibleIds: string[];
    collapseRoots: { id: string; descendants: string[] }[];
    focus: string;
    viewMode: "tree" | "votes" | "rep";
  }) => void;
}) => {
  // No tree-collapse in reputation (dag) mode — the dag view is a flat 3-row
  // neighbourhood.
  const noCollapse = props.expandAll || !props.treeMode;
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    noCollapse ? new Set() : defaultCollapsed(props.graph),
  );

  // Reset collapse state only when a genuinely different (sub)graph is loaded —
  // keyed on the node SET, not object identity. Re-centering on a tapped node
  // produces a new graph object with the same nodes; resetting then would wipe
  // a branch the user just drilled open.
  const graphNodeKey = useMemo(
    () => Object.keys(props.graph).sort().join(","),
    [props.graph],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(
    () => setCollapsed(noCollapse ? new Set() : defaultCollapsed(props.graph)),
    [graphNodeKey, noCollapse],
  );

  // Click pins/unpins a branch. Opening pins the WHOLE path to the node (the
  // node + every collapsed ancestor) so it stays visible after you stop
  // hovering, even if you drilled in via hover. Clicking an open node collapses
  // it again.
  const toggleCollapse = useCallback(
    (id: string) => {
      const graph = props.graph;
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!prev.has(id)) {
          // Currently open → collapse this node.
          next.add(id);
        } else {
          // Collapsed/peeked → pin the path to it open (node + ancestors).
          let cur: string | undefined = id;
          let guard = 0;
          while (cur && graph[cur] && guard++ < 1000) {
            next.delete(cur);
            cur = graph[cur].sentTreeVote;
          }
        }
        return next;
      });
    },
    [props.graph],
  );

  // Hover peeks a branch open: the hovered node (and the path to it) opens.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  // Entering a node sets the open path immediately.
  const onHoverEnter = useCallback(
    (id: string) => {
      cancelClose();
      setHoveredId(id);
    },
    [cancelClose],
  );
  // Leaving a node schedules a close after a generous idle delay — long enough
  // to cross the gap to a (far) child while drilling, but it closes if you stop
  // hovering nodes for a second or two. Entering another node cancels it.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setHoveredId(null), 1500);
  }, [cancelClose]);

  // The graph is laid out ONCE; every node keeps a fixed position. Collapse,
  // hover and pin only toggle which nodes are shown — nothing ever moves, so
  // the relative layout stays locked on click and hover alike. During playback
  // the layout comes from the stable full view, not the per-step subset.
  const layoutSource = props.layoutGraph ?? props.graph;
  const fullPositions = useMemo(
    () =>
      props.treeMode
        ? layoutPositions(Object.values(layoutSource))
        : new Map<string, { x: number; y: number }>(),
    [layoutSource, props.treeMode],
  );

  const { nodes, edges } = useMemo(() => {
    const graph = props.graph;
    // Reputation (dag) mode: flat 3-row vote view, no collapse.
    if (!props.treeMode) {
      return dagLayout(graph, props.clickedNode, props.onNodeClick);
    }
    // Size nodes by distance from the focus. During playback the focus may not
    // exist yet at this step — fall back to the shallowest present node so the
    // whole view doesn't collapse to minimum-size dots.
    const focusId = graph[props.clickedNode]
      ? props.clickedNode
      : (Object.values(graph).sort((a, b) => a.depth - b.depth)[0]?.id ??
        props.clickedNode);
    const distances = distancesFrom(graph, focusId);

    // Effective collapse = persistent set, with two paths always opened:
    //  - the hovered node's path (so hovering peeks a branch open), and
    //  - the focused/selected node's path, so the node you clicked stays
    //    visible after the hover that revealed it ends. Deriving this from
    //    clickedNode each render makes it survive any collapse reset.
    const forced = props.forcedCollapsed;
    const effectiveCollapsed = forced ? new Set(forced) : new Set(collapsed);
    // Open the path to a node (node + every collapsed ancestor).
    const openPath = (id: string | null | undefined) => {
      let cur: string | undefined = id ?? undefined;
      let guard = 0;
      while (cur && graph[cur] && guard++ < 1000) {
        effectiveCollapsed.delete(cur);
        cur = graph[cur].sentTreeVote;
      }
    };
    const fn = graph[props.clickedNode];
    if (!forced) {
      openPath(hoveredId);
      if (props.viewMode === "rep") {
        // Reputation: show the tree only DOWN TO the focus (open its ancestors)
        // and collapse the focus's subtree — the incoming voters are shown
        // explicitly below instead of the tree children, so it stays clean.
        openPath(fn?.sentTreeVote);
        effectiveCollapsed.add(props.clickedNode);
      } else {
        openPath(props.clickedNode);
        // "+ Votes": make the focus's outgoing-vote recipients visible WITHOUT
        // expanding them — open their parent path, not the recipient itself, so
        // we don't reveal each recipient's own tree children.
        if (props.viewMode === "votes" && fn?.dagEdges) {
          for (const e of fn.dagEdges) {
            if (e.outgoing) openPath(graph[e.to]?.sentTreeVote);
          }
        }
      }
    }

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
        if (effectiveCollapsed.has(cur)) return true;
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
    // Reputation: surface the focus's incoming voters even though their tree
    // ancestors are collapsed — they're shown in place of the tree children.
    if (props.viewMode === "rep") {
      for (const e of fn?.dagEdges ?? []) {
        if (!e.outgoing && graph[e.to] && !visibleIds.has(e.to)) {
          visible.push(graph[e.to]);
          visibleIds.add(e.to);
        }
      }
    }

    // Every node sits at its fixed full-layout position (locked layout).
    const positions = fullPositions;

    const nodes: AnthillNode[] = visible.map((n) => {
      const r = radiusForDistance(distances.get(n.id) ?? Infinity);
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      const hasChildren = (children.get(n.id) ?? []).length > 0;
      // Badge shows the persistent pin state (stays +N while hover-peeking);
      // during playback it reflects the forced (controlled) collapse.
      const isCollapsed = (forced ?? collapsed).has(n.id);
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
          // Read-only during playback (forced collapse controls the view).
          onToggle: forced ? () => {} : toggleCollapse,
          // Selecting makes this the focus; effectiveCollapsed keeps the focus
          // path open, so the clicked node stays visible after the hover ends.
          onSelect: forced
            ? () => {}
            : () => props.onNodeClick(n.id, n.name, n.currentRep),
          onInfo: (el: HTMLElement) =>
            props.onNodeMouseEnter(
              { currentTarget: el } as unknown as React.MouseEvent<HTMLElement>,
              n,
            ),
        },
      };
    });

    // When a node hover-zooms, its connecting curves should zoom too — scale the
    // width of edges touching the hovered node by the same factor the node uses.
    const hoveredR =
      hoveredId && graph[hoveredId]
        ? radiusForDistance(distances.get(hoveredId) ?? Infinity)
        : 0;
    const hoverEdgeScale = hoveredR
      ? Math.min(3, Math.max(1, (BASE_RADIUS * 1.1) / hoveredR))
      : 1;
    const hoverMult = (a: string, b: string) =>
      hoveredId && (a === hoveredId || b === hoveredId) ? hoverEdgeScale : 1;

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
            width:
              Math.max(0.75, (isTreeEdge ? 6 : 2) * rFactor) *
              hoverMult(parentId, n.id),
          },
        });
      }
    }

    // Overlay the FOCUSED node's dag votes on the tree (thickness = weight),
    // depending on the view:
    //  - "votes": OUTGOING votes (green). Recipients are above → drawn
    //    recipient→focus, like a tree edge but green = "reputation out".
    //  - "rep":   INCOMING votes (blue). Voters are below → drawn focus→voter,
    //    replacing the tree-children reading with "who votes for me".
    //  - "tree":  nothing.
    const focusNode = graph[props.clickedNode];
    const wantOut = props.viewMode === "votes";
    const wantIn = props.viewMode === "rep";
    const overlay = (focusNode?.dagEdges ?? []).filter(
      (e) => visibleIds.has(e.to) && (e.outgoing ? wantOut : wantIn),
    );
    if (overlay.length > 0) {
      const maxW = Math.max(1, ...overlay.map((e) => e.weight));
      for (const e of overlay) {
        const color = e.outgoing ? DAG_OUT_COLOR : DAG_IN_COLOR;
        const src = e.outgoing ? e.to : props.clickedNode;
        const tgt = e.outgoing ? props.clickedNode : e.to;
        edges.push({
          id: `vote-${e.outgoing ? "out" : "in"}-${props.clickedNode}-${e.to}`,
          // outgoing: recipient (above) → focus; incoming: focus → voter (below)
          source: src,
          target: tgt,
          type: "gradient",
          data: {
            sourceColor: color,
            targetColor: color,
            width: (1.5 + 4 * (e.weight / maxW)) * hoverMult(src, tgt),
          },
        });
      }
    }

    return { nodes, edges };
  }, [
    props.graph,
    props.clickedNode,
    collapsed,
    hoveredId,
    fullPositions,
    toggleCollapse,
    props.onNodeClick,
    props.forcedCollapsed,
    props.treeMode,
    props.viewMode,
  ]);

  // Report the live view (rendered nodes + collapsed-branch roots and their
  // hidden descendants) so the history scrubber can scope to it. Skipped during
  // playback (forcedCollapsed), and de-duped so it doesn't loop.
  const onViewChangeRef = useRef(props.onViewChange);
  onViewChangeRef.current = props.onViewChange;
  const lastViewSig = useRef("");
  useEffect(() => {
    if (props.forcedCollapsed || !onViewChangeRef.current) return;
    const graph = props.graph;
    const childMap = new Map<string, string[]>();
    for (const n of Object.values(graph)) {
      if (graph[n.sentTreeVote]) {
        const arr = childMap.get(n.sentTreeVote) ?? [];
        arr.push(n.id);
        childMap.set(n.sentTreeVote, arr);
      }
    }
    // Effective collapse for the SETTLED view (no hover), matching what's
    // rendered — so the reported view reflects the focus + the active mode.
    const eff = new Set(collapsed);
    const openPath = (id: string | null | undefined) => {
      let cur: string | undefined = id ?? undefined;
      let g = 0;
      while (cur && graph[cur] && g++ < 1000) {
        eff.delete(cur);
        cur = graph[cur].sentTreeVote;
      }
    };
    const fn = graph[props.clickedNode];
    if (props.viewMode === "rep") {
      openPath(fn?.sentTreeVote);
      eff.add(props.clickedNode);
    } else {
      openPath(props.clickedNode);
      if (props.viewMode === "votes" && fn?.dagEdges) {
        for (const e of fn.dagEdges) if (e.outgoing) openPath(graph[e.to]?.sentTreeVote);
      }
    }
    const hidden = (id: string) => {
      let cur = graph[id]?.sentTreeVote;
      let g = 0;
      while (cur && graph[cur] && g++ < 1000) {
        if (eff.has(cur)) return true;
        cur = graph[cur].sentTreeVote;
      }
      return false;
    };
    const visibleIds = Object.keys(graph).filter((id) => !hidden(id));
    if (props.viewMode === "rep" && fn?.dagEdges) {
      for (const e of fn.dagEdges) {
        if (!e.outgoing && graph[e.to] && !visibleIds.includes(e.to)) {
          visibleIds.push(e.to);
        }
      }
    }
    const descendantsOf = (root: string) => {
      const out: string[] = [];
      const stack = [...(childMap.get(root) ?? [])];
      let g = 0;
      while (stack.length && g++ < 100000) {
        const c = stack.pop() as string;
        out.push(c);
        stack.push(...(childMap.get(c) ?? []));
      }
      return out;
    };
    const collapseRoots = visibleIds
      .filter(
        (id) =>
          eff.has(id) &&
          (childMap.get(id)?.length ?? 0) > 0 &&
          // in rep the focus is collapsed but its children are shown as voters,
          // not aggregated, so don't treat it as an aggregate branch.
          !(props.viewMode === "rep" && id === props.clickedNode),
      )
      .map((id) => ({ id, descendants: descendantsOf(id) }));
    const sig = `${[...visibleIds].sort().join(",")}|${collapseRoots
      .map((r) => `${r.id}:${r.descendants.length}`)
      .join(",")}|${props.clickedNode}|${props.viewMode}`;
    if (sig === lastViewSig.current) return;
    lastViewSig.current = sig;
    onViewChangeRef.current({
      visibleIds,
      collapseRoots,
      focus: props.clickedNode,
      viewMode: props.viewMode,
    });
  }, [
    props.graph,
    collapsed,
    props.forcedCollapsed,
    props.clickedNode,
    props.viewMode,
  ]);

  return (
    <div
      className="Graph"
      style={{ width: "100%", height: "80vh" }}
      // Keep peeked branches open while the cursor is on the graph; close only
      // when it leaves the graph entirely.
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
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
        onNodeMouseEnter={(event, node) => {
          onHoverEnter(node.data.node.id);
          props.onNodeMouseEnter(
            event as unknown as React.MouseEvent<HTMLElement>,
            node.data.node,
          );
        }}
        onNodeMouseLeave={() => {
          // Schedule a close on idle; re-entering any node cancels it.
          scheduleClose();
          props.onNodeMouseLeave();
        }}
        // Tapping/clicking empty space dismisses the popover (the main way to
        // close it on touch, where there's no mouse-leave).
        onPaneClick={() => props.onNodeMouseLeave()}
      >
        <AutoFitView graph={layoutSource} focus={props.clickedNode} />
        <Controls showInteractive={false} position="top-left" />
      </ReactFlow>
    </div>
  );
};
