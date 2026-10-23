// A small diagram of someone's immediate family in the tree: their parent's
// parent, parent, themselves and the person next to them, and the people under
// them. Click anyone to open their page.
import { useNavigate, useSearchParams } from "react-router-dom";

import type { Graph, Person } from "../api";
import { childrenOf, colorOf, initials, parentOf, siblingsOf } from "../model";

const W = 300;
const ROW = 74;
const R = 18;

type Placed = { p: Person; x: number; y: number };

export function Neighbourhood(props: { graph: Graph; person: Person; viewerId?: string }) {
  const { graph, person } = props;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const as = params.get("as");
  const open = (id: string) => navigate(`/p/${id}${as ? `?as=${as}` : ""}`);

  const parent = parentOf(graph, person);
  const grand = parent ? parentOf(graph, parent) : undefined;
  const sibling = siblingsOf(graph, person)[0];
  const kids = childrenOf(graph, person);

  const rows: Placed[][] = [];
  const edges: [Placed, Placed][] = [];
  const centre = W / 2;
  let y = R + 22;
  let above: Placed | undefined;
  if (grand) {
    above = { p: grand, x: centre, y };
    rows.push([above]);
    y += ROW;
  }
  if (parent) {
    const placed = { p: parent, x: centre, y };
    if (above) edges.push([above, placed]);
    rows.push([placed]);
    above = placed;
    y += ROW;
  }
  const self: Placed = { p: person, x: sibling ? centre - 60 : centre, y };
  const row: Placed[] = [self];
  if (sibling) row.push({ p: sibling, x: centre + 60, y });
  for (const placed of row) if (above) edges.push([above, placed]);
  rows.push(row);
  y += ROW;
  const kidRow = kids.map((k, i) => ({
    p: k,
    x: kids.length === 1 ? self.x : self.x + (i === 0 ? -42 : 42),
    y,
  }));
  for (const k of kidRow) edges.push([self, k]);
  if (kidRow.length) rows.push(kidRow);

  const height = (kidRow.length ? y : y - ROW) + R + 30;
  const placed = rows.flat();

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label="Neighbourhood in the tree">
      {edges.map(([a, b]) => (
        <path
          key={`${a.p.id}-${b.p.id}`}
          d={`M ${a.x} ${a.y + R} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y - R}`}
          className="fill-none stroke-slate-300"
          strokeWidth={2}
        />
      ))}
      {placed.map(({ p, x, y: cy }) => {
        const isFocus = p.id === person.id;
        const isViewer = p.id === props.viewerId;
        return (
          <g
            key={p.id}
            className="cursor-pointer"
            onClick={() => open(p.id)}
            role="link"
            aria-label={p.name}
          >
            {(isFocus || isViewer) && (
              <circle
                cx={x}
                cy={cy}
                r={R + 4}
                className={isViewer ? "fill-none stroke-indigo-500" : "fill-none stroke-slate-400"}
                strokeWidth={2}
              />
            )}
            <circle cx={x} cy={cy} r={R} fill={colorOf(p.id)} />
            <text
              x={x}
              y={cy + 4}
              textAnchor="middle"
              className="fill-white text-[11px] font-semibold"
            >
              {initials(p.name)}
            </text>
            <text
              x={x}
              y={cy + R + 15}
              textAnchor="middle"
              className={isFocus ? "fill-slate-900 text-[12px] font-semibold" : "fill-slate-500 text-[12px]"}
            >
              {p.name.length > 14 ? `${p.name.slice(0, 13)}…` : p.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
