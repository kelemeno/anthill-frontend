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

import { IS_MOBILE } from "../../isMobile";
import {
  type GraphDataRendering,
  nameShortener,
  type NodeDataRendering,
} from "../GraphBase";

const BASE_RADIUS = 30;
// On mobile there's no hover-zoom to enlarge distant nodes, so keep a bigger
// floor — small nodes are hard to tap with a finger.
const MIN_RADIUS = IS_MOBILE ? 14 : 8;
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
  onSelect: () => void;
  // Touch only: open the node's popover (info + actions) anchored to the tapped
  // element — the popover is otherwise hover-driven and unreachable on a phone.
  onInfo: (el: HTMLElement) => void;
  // Drag-wiggle ended (mouse): flag it so onNodeClick doesn't select. The drag
  // motion itself is done imperatively in the node via setNodes.
  onDragEnd: () => void;
};
type AnthillNode = Node<AnthillNodeData, "anthill">;

type GradientEdgeData = {
  sourceColor: string;
  targetColor: string;
  width: number;
  // Resting (layout) endpoints in flow space, for a spatially-fixed gradient
  // that doesn't remap as the edge bbox changes while a node drags.
  gx1: number;
  gy1: number;
  gx2: number;
  gy2: number;
};
type GradientEdge = Edge<GradientEdgeData, "gradient">;

function AnthillNodeView({ data }: NodeProps<AnthillNode>) {
  const d = data.radius * 2;
  const fontSize = Math.max(7, data.radius * 0.5);
  // Drag-wiggle: grabbing a node tugs it a little (damped + capped) by moving
  // its REAL position directly in React Flow's store — so the curves follow and
  // ONLY the dragged node + its edges re-render (no parent re-render → no
  // flicker) — then it springs back on release. A real tap/click (no movement)
  // still selects / opens the popover.
  const { getZoom, getNode, setNodes } = useReactFlow();
  const id = data.node.id;
  const ptrStart = useRef<{ x: number; y: number } | null>(null);
  const nodeStart = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const springTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Appear animation: a freshly-mounted node GROWS IN PLACE — scales up from
  // nothing at its own spot (popping in to meet the curve coming down to it),
  // like a new member joining. `entered` flips on the next frame so the initial
  // (zero-size) state paints first and then transitions.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  // Plain node: no on-node controls. Hover (desktop) / tap (touch) opens the
  // popover, which carries the info, actions and Show/Hide-children control.
  return (
    <div
      style={{
        position: "relative",
        width: d,
        height: d,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ opacity: 0 }}
      />
      <div
        // `nopan` stops React Flow panning the canvas when you grab a node.
        className="nopan"
        onPointerDown={(e) => {
          ptrStart.current = { x: e.clientX, y: e.clientY };
          nodeStart.current = getNode(id)?.position ?? null;
          movedRef.current = false;
          // capture so the drag follows the pointer
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!ptrStart.current || !nodeStart.current) return;
          const dx = e.clientX - ptrStart.current.x;
          const dy = e.clientY - ptrStart.current.y;
          // Touch needs a bigger threshold — a finger tap jitters several px, and
          // mis-reading it as a drag means the tap never opens the popover (the
          // only way to expand children on a phone).
          const threshold = e.pointerType === "touch" ? 14 : 4;
          if (Math.hypot(dx, dy) > threshold) movedRef.current = true;
          if (!movedRef.current) return;
          // Progressive RADIAL resistance: the node can move within a soft CIRCLE
          // (equal give in any direction). tanh follows the pointer ~1:1 at first,
          // then gradually resists toward a soft MAX radius — decelerating
          // smoothly instead of slamming into a square wall. (Screen px; ÷ zoom to
          // world so it feels the same at any zoom.)
          const MAX = 48;
          const dist = Math.hypot(dx, dy);
          const factor = dist > 0 ? (MAX * Math.tanh(dist / MAX)) / dist : 0;
          const z = getZoom() || 1;
          const s = nodeStart.current;
          setNodes((ns) =>
            ns.map((n) =>
              n.id === id
                ? {
                    ...n,
                    // `anthill-dragging` removes the layout transition so the
                    // node follows the pointer 1:1 (not eased).
                    className: "nopan anthill-dragging",
                    position: {
                      x: s.x + (dx * factor) / z,
                      y: s.y + (dy * factor) / z,
                    },
                  }
                : n,
            ),
          );
        }}
        // pointerup fires on a real touch tap (unlike hover/onNodeClick, which
        // the pan/zoom layer or touch hardware swallow). Branch off the EVENT's
        // pointer type — not a global matchMedia("(hover: none)") guess, which
        // some phones mis-report, leaving the popover unreachable on touch.
        // Touch/pen → open the popover (info + actions); mouse → select/focus.
        onPointerUp={(e) => {
          const dragged = movedRef.current;
          const s = nodeStart.current;
          ptrStart.current = null;
          nodeStart.current = null;
          if (dragged && s) {
            // spring back to the start position (eased transition class, then
            // drop it) — all via the store, no parent re-render.
            setNodes((ns) =>
              ns.map((n) =>
                n.id === id
                  ? { ...n, position: s, className: "nopan anthill-spring" }
                  : n,
              ),
            );
            if (springTimer.current) clearTimeout(springTimer.current);
            springTimer.current = setTimeout(() => {
              setNodes((ns) =>
                ns.map((n) => (n.id === id ? { ...n, className: "nopan" } : n)),
              );
            }, 460);
            data.onDragEnd(); // flag "just dragged" so onNodeClick won't select
            return; // a drag, not a tap — don't select/open
          }
          // Touch/pen: open the popover (React Flow's onNodeClick is swallowed on
          // touch). Mouse: selection is handled by onNodeClick (guarded so a drag
          // doesn't select).
          if (e.pointerType === "touch" || e.pointerType === "pen") {
            data.onInfo(e.currentTarget as HTMLElement);
          }
        }}
        style={{
          width: d,
          height: d,
          borderRadius: "50%",
          background: data.color,
          // Selection ring: a soft black→transparent glow. A hard spread ring
          // (0 0 0 Npx) leaves a 1px background hairline against the rounded
          // edge that magnifies into a white ring when zoomed.
          boxShadow: data.ring ? "0 0 9px 4px rgba(0, 0, 0, 0.55)" : "none",
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
          cursor: "grab",
          touchAction: "none",
          // grow in place on first appearance (scale up from nothing, slight
          // overshoot so it "pops" in to meet its curve)
          transformOrigin: "center",
          opacity: entered ? 1 : 0,
          transform: entered ? "scale(1)" : "scale(0)",
          transition:
            "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease-out",
        }}
      >
        {data.label}
      </div>
      {/* Expand/collapse moved into the node's popover (no on-node button). */}
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
  focusTarget,
}: {
  graph: GraphDataRendering;
  focus: string;
  // The focused node's FINAL (target) world centre — read instead of the live
  // store position, which animates during a re-org and would mis-centre us.
  focusTarget: { x: number; y: number } | null;
}) {
  const { fitView, setCenter, getViewport } = useReactFlow();
  const prevFocus = useRef<string | null>(null);
  const prevWorld = useRef<{ x: number; y: number } | null>(null);
  // First fit (initial load) is instant — no animated shift on open. Later
  // re-fits (navigation) animate.
  const firstFit = useRef(true);
  // Latest target, read without re-firing the effect (so peeking — which changes
  // the layout but not graph/focus — never re-fits the viewport).
  const targetRef = useRef(focusTarget);
  targetRef.current = focusTarget;
  // Re-fit only when the loaded graph or focus changes — NOT on hover/collapse,
  // so peeking a branch open never moves the viewport out from under the cursor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const world = targetRef.current;
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
        const instant = firstFit.current;
        if (instant) {
          // Establish a sensible zoom that fits the view.
          fitView({ padding: 0.15, duration: 0 });
          firstFit.current = false;
        }
        // Centre on the focus's target. Chained rAF so this runs AFTER any
        // fitView commit (otherwise fitView's bbox-centring wins).
        requestAnimationFrame(() => {
          const w2 = targetRef.current;
          if (w2) {
            setCenter(w2.x, w2.y, {
              zoom: getViewport().zoom,
              duration: instant ? 0 : 300,
            });
          }
        });
      }
      prevFocus.current = focus;
      prevWorld.current = world;
    });
    return () => cancelAnimationFrame(id);
  }, [graph, focus]);
  return null;
}

// DESKTOP interaction: hovering a node smoothly zooms the whole view in toward
// it (node + curves + neighbours magnify together), easing back on leave. Only
// fires for mouse hover (touch never sets hoveredId), so it's desktop-only.
function HoverZoom({
  hoveredId,
  graph,
}: {
  hoveredId: string | null;
  graph: GraphDataRendering;
}) {
  const { getNode, getViewport, setViewport } = useReactFlow();
  const base = useRef<{ x: number; y: number; zoom: number } | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hoveredId && graph[hoveredId]) {
      if (!base.current) base.current = getViewport();
      const node = getNode(hoveredId);
      if (node) {
        const w = node.width ?? 2 * BASE_RADIUS;
        const cx = node.position.x + w / 2;
        const cy = node.position.y + (node.height ?? w) / 2;
        const zoom = Math.min(2.8, Math.max(base.current.zoom * 1.4, 70 / w));
        // Zoom ABOUT the node's current screen position (don't recenter it),
        // so the node stays under the cursor — recentering would slide it away,
        // flipping the hover to a neighbour and causing a zoom-jitter loop.
        const vp = getViewport();
        setViewport(
          {
            x: vp.x + cx * (vp.zoom - zoom),
            y: vp.y + cy * (vp.zoom - zoom),
            zoom,
          },
          { duration: 260 },
        );
      }
    } else if (base.current) {
      setViewport(base.current, { duration: 260 });
      base.current = null;
    }
  }, [hoveredId]);
  return null;
}

// Pushes the computed layout into React Flow's OWN node/edge store (the graph is
// otherwise uncontrolled). This lets the node drag mutate positions imperatively
// via setNodes without a parent re-render — and those changes stick, because we
// only re-push when the computed layout itself changes (not during a drag).
function NodeSync({
  nodes,
  edges,
}: {
  nodes: AnthillNode[];
  edges: GradientEdge[];
}) {
  const { setNodes, setEdges, getNodes } = useReactFlow();
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    // Animate node POSITIONS through the store (not via a CSS transform
    // transition) so the edges — which React Flow draws from store positions —
    // follow the nodes every frame and stay connected during a re-org. New nodes
    // jump to their target (they grow in via their own per-node scale animation).
    const start = new Map(getNodes().map((n) => [n.id, n.position]));
    const t0 = performance.now();
    const DUR = 350;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DUR);
      const e = 1 - (1 - t) ** 3; // easeOutCubic
      setNodes((prev) => {
        const live = new Map(prev.map((n) => [n.id, n]));
        return nodes.map((n) => {
          // Never fight the pointer handlers: a node mid-drag or mid-spring is
          // positioned imperatively — leave it exactly as they set it.
          const pn = live.get(n.id);
          const cls = pn?.className ?? "";
          if (cls.includes("anthill-dragging") || cls.includes("anthill-spring"))
            return pn ?? n;
          const s = start.get(n.id);
          if (!s || (s.x === n.position.x && s.y === n.position.y)) return n;
          return {
            ...n,
            position: {
              x: s.x + (n.position.x - s.x) * e,
              y: s.y + (n.position.y - s.y) * e,
            },
          };
        });
      });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [nodes, setNodes, getNodes]);
  useEffect(() => {
    setEdges(edges);
  }, [edges, setEdges]);
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
  // The top/bottom handles sit a few px outside the circle, so a bezier to them
  // leaves a visible gap. Push each end a little INTO its node (along the handle
  // normal); the node is drawn on top, so the overlap is hidden and the curve
  // meets the circle flush.
  const OVERLAP = 7;
  const into = (
    x: number,
    y: number,
    pos: Position,
  ): [number, number] => {
    if (pos === Position.Top) return [x, y + OVERLAP];
    if (pos === Position.Bottom) return [x, y - OVERLAP];
    if (pos === Position.Left) return [x + OVERLAP, y];
    if (pos === Position.Right) return [x - OVERLAP, y];
    return [x, y];
  };
  const [sx, sy] = into(sourceX, sourceY, sourcePosition);
  const [tx, ty] = into(targetX, targetY, targetPosition);
  const [path] = getBezierPath({
    sourceX: sx,
    sourceY: sy,
    targetX: tx,
    targetY: ty,
    sourcePosition,
    targetPosition,
  });
  // The gradient itself lives in a stable <defs> (EdgeGradients) so it isn't
  // re-created every frame while a node drags — that re-creation made the
  // url(#…) reference blink and the curve flicker.
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke: `url(#${gradientId(id)})`,
        strokeWidth: data?.width ?? 2,
      }}
    />
  );
}

// Stable, document-wide gradient id (no "->" etc., which can trip url() refs).
function gradientId(edgeId: string): string {
  return `grad-${edgeId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// All edge gradients, rendered ONCE in a hidden <defs>. objectBoundingBox units
// (top→bottom) mean they need no per-edge coordinates, so this only re-renders
// when the edge set/colours change — never during a drag — so no flicker.
function EdgeGradients({ edges }: { edges: GradientEdge[] }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <title>edge gradients</title>
      <defs>
        {edges.map((e) => (
          <linearGradient
            key={e.id}
            id={gradientId(e.id)}
            gradientUnits="userSpaceOnUse"
            x1={e.data?.gx1}
            y1={e.data?.gy1}
            x2={e.data?.gx2}
            y2={e.data?.gy2}
          >
            <stop offset="0%" stopColor={e.data?.sourceColor} />
            <stop offset="100%" stopColor={e.data?.targetColor} />
          </linearGradient>
        ))}
      </defs>
    </svg>
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
        onDragEnd: () => {},
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
        gx1: 0,
        gy1: 0,
        gx2: 0,
        gy2: 1,
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
        gx1: 0,
        gy1: 0,
        gx2: 0,
        gy2: 1,
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
  // Optional stable ordering key (e.g. the full-graph x). When given, EACH
  // layer is ordered by it (replacing sugiyama's crossing-reduction reordering),
  // so the left-to-right order per layer is FIXED and never re-shuffles as the
  // rendered set changes — only the spacing compacts. Sugiyama still assigns the
  // (regular/compact) coordinates within that fixed order.
  orderX?: (id: string) => number,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (visible.length === 0) return positions;
  const visibleIds = new Set(visible.map((n) => n.id));
  const layoutInput = visible.map((n) => ({
    id: n.id,
    parentIds: n.parentIds.filter((p) => visibleIds.has(p)),
  }));
  const dag = graphStratify()(layoutInput);
  // Force a fixed per-layer order: sort each layer by the stable ordering key.
  // (SugiNode shape for d3-dag v1: real nodes have data.role === "node" and the
  // original id at data.node.data.id; link/dummy nodes keep their place.)
  type SugiLayerNode = {
    data?: { role?: string; node?: { data?: { id?: string } } };
  };
  const key = (n: SugiLayerNode) => {
    const id = n.data?.role === "node" ? n.data.node?.data?.id : undefined;
    return id && orderX ? orderX(id) : Number.POSITIVE_INFINITY;
  };
  const orderedDecross = (layers: SugiLayerNode[][]) => {
    for (const layer of layers) layer.sort((a, b) => key(a) - key(b));
  };
  sugiyama()
    .layering(layeringLongestPath())
    .decross(
      orderX
        ? (orderedDecross as unknown as ReturnType<typeof decrossDfs>)
        : decrossDfs(),
    )
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
  // a branch the user just drilled open. Keyed on the LAYOUT graph (stable
  // during history scrubbing) so scrubbing — which swaps in per-step subgraphs —
  // doesn't reset collapse and briefly flash the whole tree at the live step.
  const collapseSource = props.layoutGraph ?? props.graph;
  const graphNodeKey = useMemo(
    () => Object.keys(collapseSource).sort().join(","),
    [collapseSource],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(
    () =>
      setCollapsed(noCollapse ? new Set() : defaultCollapsed(collapseSource)),
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
  // True briefly right after a drag, so React Flow's onNodeClick (which still
  // fires on pointerup after a drag) doesn't select the node we just wiggled.
  // The drag itself is done imperatively in the node (setNodes), so it doesn't
  // touch GraphFlow state — no re-render, no flicker.
  const justDragged = useRef(false);
  const onNodeDragEnd = useCallback(() => {
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 120);
  }, []);
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
    // Open the path to a node (node + every collapsed ancestor). Stops on a
    // self-referential parent (the root points at itself).
    const openPath = (id: string | null | undefined) => {
      let cur: string | undefined = id ?? undefined;
      let guard = 0;
      while (cur && graph[cur] && guard++ < 1000) {
        effectiveCollapsed.delete(cur);
        const next: string = graph[cur].sentTreeVote;
        if (next === cur) break;
        cur = next;
      }
    };
    const fn = graph[props.clickedNode];
    if (!forced) {
      // Peek the hovered/tapped node's branch open: hover on desktop, tap on
      // mobile (onInfo sets hoveredId) — there's no hover on a phone.
      openPath(hoveredId);
      if (props.viewMode === "rep") {
        // Reputation: show the tree only DOWN TO the focus (open its ancestors)
        // and collapse the focus's subtree — the incoming voters are shown
        // explicitly below instead of the tree children, so it stays clean.
        openPath(fn?.sentTreeVote);
        effectiveCollapsed.add(props.clickedNode);
      } else {
        // Open the focus's ANCESTORS (so the focus stays visible after a hover
        // ends) but not the focus itself — that way its own subtree can still be
        // collapsed/expanded from the popover. (Skip when the parent IS the
        // focus, i.e. the self-referential root.)
        if (fn?.sentTreeVote && fn.sentTreeVote !== props.clickedNode) {
          openPath(fn.sentTreeVote);
        }
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

    // A node is hidden if any tree-ancestor is collapsed. The focus is always
    // shown (so collapsing the focus hides its children but keeps it visible,
    // and a self-referential root can't hide itself).
    const isHidden = (id: string): boolean => {
      if (id === props.clickedNode) return false;
      let cur = graph[id]?.sentTreeVote;
      let guard = 0;
      while (cur && graph[cur] && cur !== id && guard++ < 1000) {
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

    // Sugiyama layout of the VISIBLE set (the compact, regular look) with a FIXED
    // per-layer order taken from the stable full-graph x — so spacing compacts
    // around what's rendered while the left-to-right order never changes.
    const positions = props.treeMode
      ? layoutPositions(visible, (id) => fullPositions.get(id)?.x ?? 0)
      : fullPositions;
    const spos = positions;

    const nodes: AnthillNode[] = visible.map((n) => {
      const r = radiusForDistance(distances.get(n.id) ?? Infinity);
      const p = spos.get(n.id) ?? { x: 0, y: 0 };
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
        // `nopan` so grabbing a node drags only the node, not the canvas. The
        // drag (and its spring-back) mutate className via setNodes from here.
        className: "nopan",
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
          onInfo: (el: HTMLElement) => {
            // Touch tap = the mobile equivalent of hover: peek this node's
            // children open AND open its popover (info + actions).
            onHoverEnter(n.id);
            props.onNodeMouseEnter(
              { currentTarget: el } as unknown as React.MouseEvent<HTMLElement>,
              n,
            );
          },
          onDragEnd: () => onNodeDragEnd(),
        },
      };
    });

    // Curves scale with the unified hover zoom (the whole view magnifies), so no
    // per-edge hover thickening is needed here.
    const edges: GradientEdge[] = [];
    for (const n of visible) {
      for (const parentId of n.parentIds) {
        if (!visibleIds.has(parentId)) continue;
        const isTreeEdge = n.sentTreeVote === parentId;
        const rFactor = Math.min(
          1,
          radiusForDistance(distances.get(n.id) ?? Infinity) / BASE_RADIUS,
        );
        const sp = spos.get(parentId) ?? { x: 0, y: 0 };
        const tp = spos.get(n.id) ?? { x: 0, y: 0 };
        edges.push({
          id: `${parentId}->${n.id}`,
          source: parentId,
          target: n.id,
          type: "gradient",
          data: {
            sourceColor: colorOf(parentId),
            targetColor: colorOf(n.id),
            width: Math.max(0.75, (isTreeEdge ? 6 : 2) * rFactor),
            gx1: sp.x,
            gy1: sp.y,
            gx2: tp.x,
            gy2: tp.y,
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
        const sp = spos.get(src) ?? { x: 0, y: 0 };
        const tp = spos.get(tgt) ?? { x: 0, y: 0 };
        edges.push({
          id: `vote-${e.outgoing ? "out" : "in"}-${props.clickedNode}-${e.to}`,
          // outgoing: recipient (above) → focus; incoming: focus → voter (below)
          source: src,
          target: tgt,
          type: "gradient",
          data: {
            sourceColor: color,
            targetColor: color,
            width: 1.5 + 4 * (e.weight / maxW),
            gx1: sp.x,
            gy1: sp.y,
            gx2: tp.x,
            gy2: tp.y,
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

  // The focused node's target world centre (node position is top-left; centre =
  // position + radius). Fed to AutoFitView so it centres on the final spot, not
  // the live store position which animates during a re-org.
  const focusTarget = useMemo(() => {
    const fn = nodes.find((n) => n.id === props.clickedNode);
    return fn
      ? { x: fn.position.x + fn.data.radius, y: fn.position.y + fn.data.radius }
      : null;
  }, [nodes, props.clickedNode]);

  return (
    <div
      className="Graph"
      style={{ width: "100%", height: "100%" }}
      // Keep peeked branches open while the cursor is on the graph; close only
      // when it leaves the graph entirely.
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <EdgeGradients edges={edges} />
      <ReactFlow
        defaultNodes={nodes}
        defaultEdges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // No `fitView` prop — it auto-recenters the bounding box (lopsided when
        // the tree is asymmetric). AutoFitView does the initial fit + centres on
        // the focus/spine instead.
        minZoom={0.05}
        onlyRenderVisibleElements={nodes.length > 300}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: "#ffffff" }}
        // Mouse select. Skipped right after a drag (onNodeClick still fires on
        // pointerup post-drag, which would wrongly select the wiggled node).
        onNodeClick={(_event, node) => {
          if (justDragged.current) return;
          props.onNodeClick(
            node.data.node.id,
            node.data.node.name,
            node.data.node.currentRep,
          );
        }}
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
        // Tapping/clicking empty space collapses the peeked branch AND dismisses
        // the popover (the main way to close both on touch — no mouse-leave).
        onPaneClick={() => {
          setHoveredId(null);
          cancelClose();
          props.onNodeMouseLeave();
        }}
      >
        <NodeSync nodes={nodes} edges={edges} />
        <AutoFitView
          graph={layoutSource}
          focus={props.clickedNode}
          focusTarget={focusTarget}
        />
        {!IS_MOBILE && <HoverZoom hoveredId={hoveredId} graph={props.graph} />}
        <Controls showInteractive={false} position="top-left" />
      </ReactFlow>
    </div>
  );
};
