// Everyone in the community, ranked by reputation, with search and a few
// filters.
import { useEffect, useState } from "react";

import { fetchReach } from "../api";
import { formatRep, level, ranked, relation, rep } from "../model";
import { useApp } from "../state";
import { RowsSkeleton } from "../components/Skeletons";
import { AppLink, Avatar, Badge, Card, cx, Empty } from "../ui";

type Filter = "all" | "reach" | "free";

export function PeoplePage() {
  const { graph, cid = "", session, viewer } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [reach, setReach] = useState<Set<string>>();

  useEffect(() => {
    if (filter !== "reach" || !viewer) return;
    fetchReach(cid, viewer.id, session).then((ids) => setReach(new Set(ids)), () => {});
  }, [filter, viewer, graph?.version, cid, session]);

  const all = graph ? ranked(graph) : [];
  const q = query.trim().toLowerCase();
  const shown = all
    .map((p, i) => ({ p, rank: i + 1 }))
    .filter(({ p }) => !q || p.name.toLowerCase().includes(q))
    .filter(({ p }) =>
      filter === "free" ? p.recTreeVotes.length < 2 : filter === "reach" ? (reach?.has(p.id) ?? false) : true,
    );

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "Everyone" },
    ...(viewer ? [{ key: "reach" as const, label: "I can endorse" }] : []),
    { key: "free", label: "Has a free spot" },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-slate-500">Everyone in {graph?.community.name ?? "this community"}, by reputation.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <div className="flex rounded-xl bg-slate-100 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap",
                filter === f.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <Card className="p-2 sm:p-2" data-tour="people">
        {shown.map(({ p, rank }) => {
          const rel = graph && relation(graph, viewer, p);
          return (
            <AppLink
              key={p.id}
              to={`/p/${p.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50"
            >
              <span className="num w-7 shrink-0 text-right text-[13px] text-slate-400">{rank}</span>
              <Avatar person={p} size={36} ring={p.id === viewer?.id} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-900">{p.name}</span>
                  {p.id === viewer?.id && <Badge tone="indigo">You</Badge>}
                </span>
                <span className="block truncate text-[13px] text-slate-500">
                  Level {level(p)} · {p.recDagVotes.length} endorse them
                  {rel ? ` · ${rel.toLowerCase()}` : ""}
                </span>
              </span>
              <span className="num shrink-0 text-sm font-semibold text-slate-900">{formatRep(rep(p))}</span>
            </AppLink>
          );
        })}
        {!graph && <RowsSkeleton rows={8} />}
        {graph && shown.length === 0 && (
          <div className="px-3">
            <Empty>
              {all.length === 0 ? "Nobody's here yet." : filter === "reach" && !reach ? "Loading…" : "No one matches."}
            </Empty>
          </div>
        )}
      </Card>
    </div>
  );
}
