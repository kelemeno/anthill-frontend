// A community's front page for visitors who aren't signed in: what it is, the
// top of its live tree, and a way to look around as a member (read-only
// preview). Also how Anthill works, shared with the home page.
import { ArrowUpRight, Heart, Lock, Play, TrendingUp, UserPlus } from "lucide-react";
import { type ReactNode, useState } from "react";

import { DEMO_COMMUNITY, type Graph } from "../api";
import { colorOf, formatRep, initials, members, rep } from "../model";
import { useApp } from "../state";
import { GhostTree, Skeleton } from "../components/Skeletons";
import { AppLink, Button, Card, CardTitle, communityPath, PersonRow, useAppNavigate } from "../ui";

// Renders at once: the community's name and description come from the
// communities list while its tree loads.
export function Landing() {
  const { graph, cid, session, communities, openAuth } = useApp();
  const community = graph?.community ?? communities?.find((c) => c.id === cid);
  const people = graph ? members(graph) : [];
  const endorsements = people.reduce((n, p) => n + p.sentDagVotes.length, 0);
  const levels = people.length === 0 ? 0 : Math.max(0, ...people.map((p) => p.depth)) + 1;
  const empty = graph !== undefined && people.length === 0;

  return (
    <div className="space-y-6">
      <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
        <div>
          {community ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-indigo-600">
                {community.visibility === "private" && <Lock size={13} />}
                An Anthill community · {community.joinPolicy === "open" ? "open to join" : "invite only"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
                {community.name}
              </h1>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="mt-3 h-9 w-72 max-w-full" />
            </>
          )}
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600">
            {community?.description ||
              "A tree of people. You join next to someone you know, endorse people above you, and climb when your reputation passes your parent's."}{" "}
            No wallet, no password: you sign in with a passkey.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {session ? (
              <p className="mr-2 text-sm text-slate-600">Joining is by invite: ask a member for a link.</p>
            ) : (
              <>
                <Button variant="primary" onClick={() => openAuth("signin")}>
                  Sign in
                </Button>
                <Button onClick={() => openAuth("create")}>Create account</Button>
              </>
            )}
            {!empty && (
              <>
                <AppLink to="/explore">
                  <Button variant="ghost">
                    Explore the tree <ArrowUpRight size={15} />
                  </Button>
                </AppLink>
                <AppLink to="/explore?replay=1">
                  <Button variant="ghost">
                    <Play size={14} /> Watch it grow
                  </Button>
                </AppLink>
              </>
            )}
          </div>
          {!empty && (
            <dl className="mt-8 flex gap-8">
              <Stat label="people" value={graph && people.length} />
              <Stat label="endorsements" value={graph && endorsements} />
              <Stat label="levels" value={graph && levels} />
            </dl>
          )}
        </div>
        {!graph ? (
          <Card className="p-3">
            <GhostTree />
          </Card>
        ) : empty ? (
          <Card className="fade-in py-10 text-center">
            <h2 className="text-[15px] font-semibold">Nobody's here yet</h2>
            <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
              {community?.founder
                ? `${community.founder.name || "Its founder"} starts the tree; then anyone can join.`
                : "Whoever joins first starts at the top of the tree."}
            </p>
            <AppLink to={communityPath(DEMO_COMMUNITY, "/")} global className="mt-4 inline-block">
              <Button size="sm">See how it works in the demo</Button>
            </AppLink>
          </Card>
        ) : (
          <Card className="fade-in p-3">
            <TopOfTree graph={graph} />
          </Card>
        )}
      </section>

      <HowItWorks />
      {people.length > 0 && <MemberPreview />}
    </div>
  );
}

export function HowItWorks() {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <Point icon={<UserPlus size={18} />} title="Join next to people you know">
        Someone in the tree sends you an invite link, and you start right under them.
      </Point>
      <Point icon={<Heart size={18} />} title="Endorse people above you">
        Up to 6 levels up in your part of the tree. Your reputation is split between everyone
        you endorse.
      </Point>
      <Point icon={<TrendingUp size={18} />} title="Climb">
        Endorsements from below raise your reputation. Once it's higher than your parent's,
        you can swap places with them.
      </Point>
    </section>
  );
}

function Stat(props: { label: string; value: number | undefined }) {
  return (
    <div>
      <dt className="text-[13px] text-slate-500">{props.label}</dt>
      <dd className="num text-2xl font-semibold tracking-tight">
        {props.value === undefined ? <Skeleton className="mt-1 h-7 w-10" /> : props.value}
      </dd>
    </div>
  );
}

function Point(props: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        {props.icon}
      </span>
      <h2 className="mt-3 text-[15px] font-semibold">{props.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{props.children}</p>
    </Card>
  );
}

// The first four levels of the live tree; click anyone to open their page
// (in `cid`, when shown outside the community).
export function TopOfTree(props: { graph: Graph; cid?: string }) {
  const { graph } = props;
  const navigate = useAppNavigate();
  const open = (id: string) =>
    props.cid ? navigate(`/c/${props.cid}/p/${id}`, { global: true }) : navigate(`/p/${id}`);
  const LEVELS = 4;
  const W = 480;
  const pos = new Map<string, { x: number; y: number }>();
  const place = (id: string, depth: number, left: number, right: number) => {
    const p = graph.nodes[id];
    if (!p || depth >= LEVELS) return;
    const x = (left + right) / 2;
    pos.set(id, { x, y: 30 + depth * 72 });
    const kids = p.recTreeVotes.filter((k) => graph.nodes[k]);
    const step = (right - left) / Math.max(kids.length, 1);
    kids.forEach((k, i) => place(k, depth + 1, left + i * step, left + (i + 1) * step));
  };
  place(graph.rootId, 0, 0, W);
  const shown = [...pos.keys()].map((id) => graph.nodes[id]);
  const r = (id: string) => (id === graph.rootId ? 18 : 14);
  return (
    <svg viewBox={`0 0 ${W} ${30 + (LEVELS - 1) * 72 + 40}`} className="w-full" role="img" aria-label="The top of the tree">
      {shown.map((p) => {
        const a = pos.get(p.sentTreeVote);
        const b = pos.get(p.id);
        if (!a || !b) return null;
        const my = (a.y + b.y) / 2;
        return (
          <path
            key={`l-${p.id}`}
            d={`M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`}
            className="fill-none stroke-slate-300"
            strokeWidth={1.5}
          />
        );
      })}
      {shown.map((p) => {
        const at = pos.get(p.id);
        if (!at) return null;
        return (
          <g
            key={p.id}
            transform={`translate(${at.x} ${at.y})`}
            className="cursor-pointer"
            onClick={() => open(p.id)}
          >
            <title>{`${p.name}: ${formatRep(rep(p))} reputation`}</title>
            <circle r={r(p.id)} fill={colorOf(p.id)} />
            <text y={4} textAnchor="middle" className="pointer-events-none fill-white text-[9px] font-semibold">
              {initials(p.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function MemberPreview() {
  const { graph, setPreviewAs } = useApp();
  const [query, setQuery] = useState("");
  if (!graph) return null;
  const everyone = members(graph).sort((a, b) => a.name.localeCompare(b.name));
  const suggested = [...everyone]
    .sort((a, b) => b.recDagVotes.length - a.recDagVotes.length || a.depth - b.depth)
    .filter((p) => p.depth >= 2)
    .slice(0, 3);
  const matches = query.trim()
    ? everyone.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
    : suggested;
  return (
    <Card data-tour="preview">
      <CardTitle hint="See the app from any member's point of view. Read-only.">
        Look around as a member
      </CardTitle>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name…"
        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      <div className="mt-1 divide-y divide-slate-50">
        {matches.map((p) => (
          <PersonRow
            key={p.id}
            person={p}
            detail={`${formatRep(rep(p))} reputation · ${p.recDagVotes.length} endorsements`}
            right={
              <Button size="sm" onClick={() => setPreviewAs(p.id)}>
                Preview
              </Button>
            }
          />
        ))}
      </div>
    </Card>
  );
}
