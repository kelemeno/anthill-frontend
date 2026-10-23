// Explore: the whole tree. Pan and zoom, search by name, click someone to see
// them in a side panel (a sheet on phones). Your own circle is ringed in
// indigo; "Who I can endorse" highlights your reach; the selected person's
// endorsements are drawn as arcs (green: endorses them, indigo: they endorse).
import { Crosshair, Minus, Plus, Search, X } from "lucide-react";
import { select } from "d3-selection";
import "d3-transition";
import { type ZoomBehavior, type ZoomTransform, zoom, zoomIdentity } from "d3-zoom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { fetchReach, type Graph, type Person } from "../api";
import { PersonActions } from "../components/PersonActions";
import { colorOf, formatRep, initials, level, members, rankOf, relation, rep } from "../model";
import { useApp } from "../state";
import { AppLink, Avatar, Badge, Button, cx } from "../ui";

const SLOT = 64; // horizontal space per leaf
const LEVEL = 96; // vertical space per level

// Tidy layout for the binary tree: leaves side by side, each parent centred
// above its children.
function layout(graph: Graph): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  let next = 0;
  const visit = (id: string, depth: number): number => {
    const p = graph.nodes[id];
    const kids = (p?.recTreeVotes ?? []).filter((k) => graph.nodes[k]);
    let x: number;
    if (kids.length === 0) {
      x = next++;
    } else {
      const xs = kids.map((k) => visit(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    pos.set(id, { x: x * SLOT, y: depth * LEVEL });
    return x;
  };
  if (graph.nodes[graph.rootId]) visit(graph.rootId, 0);
  return pos;
}

// Bigger circles for more reputation (square-root scale, capped).
function radius(p: Person) {
  return Math.min(26, 11 + 6 * Math.sqrt(Math.max(0, rep(p) - 1)));
}

export function ExplorePage() {
  const { graph, viewer } = useApp();
  const [params, setParams] = useSearchParams();
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>(null);
  const [t, setT] = useState<ZoomTransform>(zoomIdentity);
  const [selected, setSelected] = useState<string | undefined>(params.get("focus") ?? viewer?.id);
  const [showReach, setShowReach] = useState(params.get("reach") === "1");
  const [reach, setReach] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const pos = useMemo(() => (graph ? layout(graph) : new Map()), [graph]);

  // pan & zoom (the svg only exists once the graph has loaded)
  const loaded = graph !== undefined;
  useEffect(() => {
    if (!loaded || !svgRef.current) return;
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .on("zoom", (e) => setT(e.transform));
    select(svgRef.current).call(z).on("dblclick.zoom", null);
    zoomRef.current = z;
  }, [loaded]);

  const centreOn = useCallback(
    (id: string, animate = true) => {
      const svg = svgRef.current;
      const p = pos.get(id);
      if (!svg || !p || !zoomRef.current) return;
      const { width, height } = svg.getBoundingClientRect();
      const k = Math.max(t.k, 0.9);
      // leave room for the side panel on wide screens
      const panel = width > 900 ? 360 : 0;
      const target = zoomIdentity
        // on phones the sheet covers the bottom, so keep the person near the top
        .translate((width - panel) / 2 - p.x * k, (width < 640 ? 0.22 : 0.38) * height - p.y * k)
        .scale(k);
      const sel = select(svg);
      if (animate) sel.transition().duration(450).call(zoomRef.current.transform, target);
      else sel.call(zoomRef.current.transform, target);
    },
    [pos, t.k],
  );

  // first view: centre on the focus (or you, or the root)
  const centred = useRef(false);
  useEffect(() => {
    if (!graph || centred.current || pos.size === 0 || !zoomRef.current) return;
    centred.current = true;
    centreOn(selected ?? graph.rootId, false);
  }, [graph, pos, selected, centreOn]);

  // who the viewer can endorse
  useEffect(() => {
    if (!showReach || !viewer) {
      setReach(new Set());
      return;
    }
    let cancelled = false;
    fetchReach(viewer.id).then(
      (ids) => !cancelled && setReach(new Set(ids)),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [showReach, viewer, graph?.version]);

  const choose = (id: string | undefined) => {
    setSelected(id);
    const next = new URLSearchParams(params);
    if (id) next.set("focus", id);
    else next.delete("focus");
    setParams(next, { replace: true });
  };

  if (!graph) return <p className="text-slate-500">Loading the tree…</p>;

  const people = members(graph);
  const sel = selected ? graph.nodes[selected] : undefined;
  const matches = query.trim()
    ? people.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const showLabels = t.k > 0.55;

  // endorsement arcs for the selected person
  const arcs: { from: string; to: string; kind: "in" | "out" }[] = [];
  if (sel) {
    for (const v of sel.recDagVotes) arcs.push({ from: v.id, to: sel.id, kind: "in" });
    for (const v of sel.sentDagVotes) arcs.push({ from: sel.id, to: v.id, kind: "out" });
  }

  return (
    // full-bleed under the header: cancel the page padding
    <div className="relative -mx-4 -my-5 h-[calc(100dvh-57px)] overflow-hidden bg-slate-50 sm:-mx-6 lg:-mx-8 max-sm:h-[calc(100dvh-57px-60px)]">
      <svg ref={svgRef} className="h-full w-full touch-none select-none" onClick={() => choose(undefined)}>
        <g transform={t.toString()}>
          {/* tree links */}
          {people.map((p) => {
            const a = pos.get(p.sentTreeVote);
            const b = pos.get(p.id);
            if (!a || !b) return null;
            const my = (a.y + b.y) / 2;
            return (
              <path
                key={`t-${p.id}`}
                d={`M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`}
                className="fill-none stroke-slate-300"
                strokeWidth={1.5}
              />
            );
          })}
          {/* endorsement arcs */}
          {arcs.map(({ from, to, kind }) => {
            const a = pos.get(from);
            const b = pos.get(to);
            if (!a || !b) return null;
            const bend = (b.x - a.x) * 0.25 + 40;
            return (
              <path
                key={`e-${kind}-${from}-${to}`}
                d={`M ${a.x} ${a.y} Q ${(a.x + b.x) / 2 + bend} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`}
                className={cx("fill-none", kind === "in" ? "stroke-emerald-500" : "stroke-indigo-500")}
                strokeWidth={2}
                strokeDasharray="5 4"
                markerEnd={`url(#arrow-${kind})`}
              />
            );
          })}
          <defs>
            {(["in", "out"] as const).map((kind) => (
              <marker key={kind} id={`arrow-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className={kind === "in" ? "fill-emerald-500" : "fill-indigo-500"} />
              </marker>
            ))}
          </defs>
          {/* people */}
          {people.map((p) => {
            const at = pos.get(p.id);
            if (!at) return null;
            const r = radius(p);
            const isMe = p.id === viewer?.id;
            const isSel = p.id === selected;
            const inReach = reach.has(p.id);
            const dim = showReach && reach.size > 0 && !inReach && !isMe && !isSel;
            return (
              <g
                key={p.id}
                transform={`translate(${at.x} ${at.y})`}
                className="cursor-pointer"
                opacity={dim ? 0.35 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  choose(p.id);
                }}
              >
                {inReach && <circle r={r + 7} className="fill-amber-200/70" />}
                {(isMe || isSel) && (
                  <circle
                    r={r + 4}
                    className={cx("fill-none", isMe ? "stroke-indigo-500" : "stroke-slate-900")}
                    strokeWidth={2.5}
                  />
                )}
                <circle r={r} fill={colorOf(p.id)} />
                <text y={4} textAnchor="middle" className="pointer-events-none fill-white text-[10px] font-semibold">
                  {initials(p.name)}
                </text>
                {showLabels && (
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    className={cx(
                      "pointer-events-none text-[11px]",
                      isMe || isSel ? "fill-slate-900 font-semibold" : "fill-slate-500",
                    )}
                  >
                    {p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* search + toggles */}
      <div className="absolute top-3 left-3 w-[min(320px,calc(100%-24px))]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone…"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        {matches.length > 0 && (
          <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setQuery("");
                  choose(p.id);
                  centreOn(p.id);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <Avatar person={p} size={26} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="num text-[12px] text-slate-400">{formatRep(rep(p))}</span>
              </button>
            ))}
          </div>
        )}
        {viewer && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 shadow-sm">
            <input type="checkbox" checked={showReach} onChange={(e) => setShowReach(e.target.checked)} className="accent-indigo-600" />
            Highlight who I can endorse
          </label>
        )}
      </div>

      {/* zoom */}
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm max-sm:bottom-auto max-sm:top-3">
        {[
          { label: "Zoom in", icon: <Plus size={16} />, run: () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1.3) },
          { label: "Zoom out", icon: <Minus size={16} />, run: () => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(200).call(zoomRef.current.scaleBy, 1 / 1.3) },
          ...(viewer ? [{ label: "Go to me", icon: <Crosshair size={16} />, run: () => { choose(viewer.id); centreOn(viewer.id); } }] : []),
        ].map((b) => (
          <button key={b.label} type="button" title={b.label} aria-label={b.label} onClick={b.run} className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-slate-100">
            {b.icon}
          </button>
        ))}
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 hidden gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[12px] text-slate-500 shadow-sm sm:flex">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full ring-2 ring-indigo-500" /> You</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-500" /> Endorses them</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-indigo-500" /> They endorse</span>
        <span className="text-slate-400">Bigger = more reputation</span>
      </div>

      {sel && <PersonPanel graph={graph} person={sel} viewer={viewer} onClose={() => choose(undefined)} />}
    </div>
  );
}

function PersonPanel(props: { graph: Graph; person: Person; viewer: Person | undefined; onClose: () => void }) {
  const { graph, person: p, viewer } = props;
  const { rank, of } = rankOf(graph, p.id);
  const rel = relation(graph, viewer, p);
  return (
    <aside
      className={cx(
        "absolute z-10 overflow-y-auto border-slate-200 bg-white shadow-xl",
        // side panel on wide screens, bottom sheet on phones
        "top-3 right-3 max-h-[calc(100%-24px)] w-[340px] rounded-2xl border p-5",
        "max-sm:inset-x-0 max-sm:top-auto max-sm:right-0 max-sm:bottom-0 max-sm:max-h-[62%] max-sm:w-auto max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <Avatar person={p} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{p.name}</h2>
          <p className="num text-sm text-slate-500">
            {formatRep(rep(p))} reputation · #{rank} of {of}
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={props.onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <X size={18} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {viewer?.id === p.id && <Badge tone="indigo">You</Badge>}
        {rel && <Badge tone="indigo">{rel}</Badge>}
        <Badge>Level {level(p)}</Badge>
        <Badge tone="emerald">{p.recDagVotes.length} endorse them</Badge>
        <Badge>They endorse {p.sentDagVotes.length}</Badge>
      </div>
      {p.bio && <p className="mt-3 text-sm text-slate-600">{p.bio}</p>}
      <div className="mt-4">
        <PersonActions them={p} />
      </div>
      <AppLink to={`/p/${p.id}`} className="mt-4 block">
        <Button className="w-full">Open full page</Button>
      </AppLink>
    </aside>
  );
}
