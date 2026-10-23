// "You": your place in a community's tree at a glance. Your reputation and
// rank, what you could do next (swap with your parent, endorse people in
// reach, invite), where your reputation comes from, who you endorse, and your
// neighbourhood. Visitors see the community's landing page, and people signed
// in but not in it yet how to join.
import { ArrowLeftRight, Heart, Link2, Sparkles, UserPlus, Users } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { type Action, act, createInviteLink, fetchReach, type Person } from "../api";
import { Neighbourhood } from "../components/Neighbourhood";
import { DashboardSkeleton } from "../components/Skeletons";
import { Landing } from "./Landing";
import {
  BASE_REPUTATION,
  endorsementsIn,
  endorsementsOut,
  formatRep,
  level,
  members,
  parentOf,
  rankOf,
  rep,
} from "../model";
import { useApp } from "../state";
import { AppLink, Avatar, Badge, Button, Card, CardTitle, cx, Empty, PersonRow } from "../ui";

export function YouPage() {
  const { graph, viewer, session } = useApp();
  if (!graph) return session ? <DashboardSkeleton /> : <Landing />;
  if (viewer) return <Dashboard me={viewer} />;
  if (session) return <JoinOptions />;
  return <Landing />;
}

// Runs an action as the signed-in user; disabled in preview mode.
function useAct() {
  const { session, cid, reload } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: Action) => {
    if (!session || !cid) return;
    setBusy(true);
    setError("");
    try {
      await act(session, cid, action);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, canAct: session !== undefined };
}

function Dashboard(props: { me: Person }) {
  const { graph, session, previewing } = useApp();
  const me = props.me;
  if (!graph) return null;
  const { rank, of } = rankOf(graph, me.id);
  const parent = parentOf(graph, me);

  return (
    <div className="fade-in space-y-5">
      {previewing && <PreviewBanner name={me.name} />}
      <Card data-tour="you-header">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar person={me} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{me.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="indigo">
                #{rank} of {of}
              </Badge>
              <Badge>Level {level(me)}</Badge>
              {parent && (
                <Badge>
                  Under{" "}
                  <AppLink to={`/p/${parent.id}`} className="font-semibold hover:underline">
                    {parent.name}
                  </AppLink>
                </Badge>
              )}
            </div>
            {me.bio && <p className="mt-2 text-sm text-slate-600">{me.bio}</p>}
          </div>
          <div className="text-right">
            <div className="num text-3xl font-semibold tracking-tight">{formatRep(rep(me))}</div>
            <div className="text-[13px] text-slate-500">reputation</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AppLink to={`/explore?focus=${me.id}`}>
            <Button size="sm">
              <Users size={15} /> See my spot in the tree
            </Button>
          </AppLink>
          {session && !previewing && <InviteButton />}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <NextSteps me={me} />
          <ReputationSources me={me} />
          <YourEndorsements me={me} />
        </div>
        <aside className="space-y-5">
          <Card data-tour="neighbourhood">
            <CardTitle hint="Click anyone to see their page.">Your neighbourhood</CardTitle>
            <Neighbourhood graph={graph} person={me} viewerId={me.id} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function PreviewBanner(props: { name: string }) {
  const { setPreviewAs, openAuth } = useApp();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>
        Previewing the app as <strong>{props.name}</strong>. Read-only: sign in to act as
        yourself.
      </span>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setPreviewAs(undefined)}>
          Stop preview
        </Button>
        <Button size="sm" variant="primary" onClick={() => openAuth("signin")}>
          Sign in
        </Button>
      </span>
    </div>
  );
}

function InviteButton() {
  const { session, cid } = useApp();
  const [status, setStatus] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        onClick={async () => {
          if (!session || !cid) return;
          try {
            const link = await createInviteLink(session, cid);
            await navigator.clipboard.writeText(link);
            setStatus("Invite link copied: it works once, for 14 days.");
          } catch (e) {
            setStatus((e as Error).message);
          }
        }}
      >
        <Link2 size={15} /> Copy invite link
      </Button>
      {status && <span className="text-[13px] text-slate-500">{status}</span>}
    </span>
  );
}

function Step(props: { icon: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        {props.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-900">{props.title}</p>
          {props.action}
        </div>
        {props.children && <div className="mt-1 text-[13px] text-slate-500">{props.children}</div>}
      </div>
    </li>
  );
}

function NextSteps(props: { me: Person }) {
  const { graph, cid, session, previewing } = useApp();
  const me = props.me;
  const { run, busy, error, canAct } = useAct();
  const [reach, setReach] = useState<string[] | undefined>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch on every graph change
  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    fetchReach(cid, me.id, session).then(
      (ids) => !cancelled && setReach(ids),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [me.id, graph?.version]);

  if (!graph) return null;
  const parent = parentOf(graph, me);
  const myRep = rep(me);
  const parentRep = rep(parent);
  const freeSpots = 2 - me.recTreeVotes.length;
  const reachPeople = (reach ?? [])
    .map((id) => graph.nodes[id])
    .filter(Boolean)
    .sort((a, b) => rep(b) - rep(a));
  const disabled = !canAct || previewing || busy;

  return (
    <Card data-tour="next-steps">
      <CardTitle hint="What would move you forward right now.">Next steps</CardTitle>
      <ul className="divide-y divide-slate-100">
        {parent &&
          (myRep > parentRep ? (
            <Step
              icon={<ArrowLeftRight size={16} />}
              title={`You can swap places with ${parent.name}`}
              action={
                <Button
                  size="sm"
                  variant="primary"
                  disabled={disabled}
                  onClick={() => run({ fn: "switchPositionWithParent", args: {} })}
                >
                  Swap places
                </Button>
              }
            >
              Your reputation ({formatRep(myRep)}) is higher than theirs ({formatRep(parentRep)}).
            </Step>
          ) : (
            <Step
              icon={<ArrowLeftRight size={16} />}
              title={`${formatRep(parentRep - myRep)} more reputation to swap with ${parent.name}`}
            >
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.min(100, (myRep / Math.max(parentRep, 0.01)) * 100)}%` }}
                />
              </div>
              <p className="mt-1.5">
                You {formatRep(myRep)}, {parent.name} {formatRep(parentRep)}. Once yours is higher, you
                can swap places and move up a level.
              </p>
            </Step>
          ))}
        <Step
          icon={<Heart size={16} />}
          title={
            reach === undefined
              ? "Finding people you can endorse…"
              : reachPeople.length === 0
                ? "There's no one new you can endorse right now"
                : `You can endorse ${reachPeople.length} more ${reachPeople.length === 1 ? "person" : "people"}`
          }
          action={
            reachPeople.length > 3 ? (
              <AppLink to={`/explore?focus=${me.id}&reach=1`} className="text-[13px] font-medium text-indigo-600 hover:underline">
                See them all
              </AppLink>
            ) : undefined
          }
        >
          <p>People above you, up to 6 levels up in your part of the tree. Here are the ones with the most reputation:</p>
          <div className="mt-1 divide-y divide-slate-50">
            {reachPeople.slice(0, 3).map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                right={
                  <Button
                    size="sm"
                    disabled={disabled}
                    onClick={() => run({ fn: "addDagVote", args: { recipient: p.id, weight: "1" } })}
                  >
                    <Heart size={14} /> Endorse
                  </Button>
                }
              />
            ))}
          </div>
        </Step>
        {freeSpots > 0 && (
          <Step icon={<UserPlus size={16} />} title={`You have ${freeSpots} free ${freeSpots === 1 ? "spot" : "spots"} under you`}>
            Invite someone you know: they start right under you, and people under you can endorse you.
          </Step>
        )}
        {me.recDagVotes.length === 0 && (
          <Step icon={<Sparkles size={16} />} title="Nobody endorses you yet">
            Endorsements come from people below you in your part of the tree. Inviting people is
            the quickest way to get them.
          </Step>
        )}
      </ul>
      {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
    </Card>
  );
}

function ReputationSources(props: { me: Person }) {
  const { graph } = useApp();
  const sources = useMemo(() => (graph ? endorsementsIn(graph, props.me) : []), [graph, props.me]);
  if (!graph) return null;
  const total = rep(props.me);
  const parts = [{ label: "Everyone starts with", value: BASE_REPUTATION }, ...sources.map((s) => ({ label: s.from.name, value: s.adds }))];
  return (
    <Card data-tour="sources">
      <CardTitle hint="Each endorsement adds a share of the endorser's reputation, split between everyone they endorse.">
        Where your reputation comes from
      </CardTitle>
      <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {parts.map((part, i) => (
          <div
            key={part.label}
            className={cx(i === 0 ? "bg-slate-300" : i % 2 ? "bg-indigo-500" : "bg-indigo-400", "border-r border-white last:border-0")}
            style={{ width: `${(part.value / Math.max(total, 0.01)) * 100}%` }}
            title={`${part.label}: +${formatRep(part.value)}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between py-2 text-sm">
        <span className="text-slate-600">Everyone starts with</span>
        <span className="num font-medium">{formatRep(BASE_REPUTATION)}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {sources.map((s) => (
          <PersonRow
            key={s.from.id}
            person={s.from}
            detail={`${formatRep(rep(s.from))} reputation, endorses ${s.from.sentDagVotes.length}`}
            right={<span className="num text-sm font-medium text-emerald-600">+{formatRep(s.adds)}</span>}
          />
        ))}
      </div>
      {sources.length === 0 && <Empty>No endorsements yet.</Empty>}
    </Card>
  );
}

function YourEndorsements(props: { me: Person }) {
  const { graph, previewing } = useApp();
  const { run, busy, canAct } = useAct();
  if (!graph) return null;
  const out = endorsementsOut(graph, props.me);
  return (
    <Card data-tour="endorsing">
      <CardTitle hint="Your reputation is split between the people you endorse.">
        You endorse {out.length} {out.length === 1 ? "person" : "people"}
      </CardTitle>
      <div className="divide-y divide-slate-50">
        {out.map((e) => (
          <PersonRow
            key={e.to.id}
            person={e.to}
            detail={`gets ${Math.round(e.share * 100)}% of your support (+${formatRep(e.gives)})`}
            right={
              <Button
                size="sm"
                variant="ghost"
                disabled={!canAct || previewing || busy}
                onClick={() => run({ fn: "removeDagVote", args: { recipient: e.to.id } })}
              >
                Remove
              </Button>
            }
          />
        ))}
      </div>
      {out.length === 0 && <Empty>You don't endorse anyone yet.</Empty>}
    </Card>
  );
}

// Signed in but not in the community: join with an invite, or (unless joining
// is invite-only) at a free spot. An empty tree can be restarted.
function JoinOptions() {
  const { graph, cid, session, reload, notify } = useApp();
  const [busy, setBusy] = useState(false);
  if (!graph || !session || !cid) return null;
  const { community } = graph;
  const inviteOnly = community.joinPolicy === "invite";
  const empty = members(graph).length === 0;
  // free spots, highest in the tree first
  const open = members(graph)
    .filter((p) => p.recTreeVotes.length < 2)
    .sort((a, b) => a.depth - b.depth || rep(b) - rep(a))
    .slice(0, 5);
  const join = async (action: Action) => {
    setBusy(true);
    try {
      await act(session, cid, action);
      reload();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Card>
        <h1 className="text-xl font-semibold tracking-tight">Join {community.name}, {session.user.name}</h1>
        {community.description && <p className="mt-2 text-sm text-slate-600">{community.description}</p>}
        <p className="mt-2 text-sm text-slate-600">
          {inviteOnly
            ? "Joining is by invite: ask someone in the community for an invite link. You'll start right under them."
            : "The best way in is an invite link from someone you know: you start right under them, next to people who can vouch for you."}
        </p>
      </Card>
      {empty && (inviteOnly ? community.isFounder : true) && (
        <Card>
          <CardTitle hint="Everyone has left. Whoever joins first starts at the top.">Nobody's here yet</CardTitle>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => join({ fn: "joinTreeAsRoot", args: { name: session.user.name } })}
          >
            Start the tree
          </Button>
        </Card>
      )}
      {!inviteOnly && !empty && (
        <Card>
          <CardTitle hint="Or take a free spot now. You can move later.">Free spots</CardTitle>
          <div className="divide-y divide-slate-50">
            {open.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
                detail={`Level ${level(p)} · ${2 - p.recTreeVotes.length} free`}
                right={
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => join({ fn: "joinTree", args: { name: session.user.name, recipient: p.id } })}
                  >
                    Join under {p.name}
                  </Button>
                }
              />
            ))}
          </div>
          <AppLink to="/explore" className="mt-2 inline-block text-[13px] font-medium text-indigo-600 hover:underline">
            Find a spot in the tree
          </AppLink>
        </Card>
      )}
    </div>
  );
}
