// The front page (/): your communities and public ones to discover, with a way
// to start your own. Visitors who aren't signed in get what Anthill is first.
import { ArrowRight, Lock, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { type Community, DEMO_COMMUNITY, fetchGraph, type Graph } from "../api";
import { readCache, writeCache } from "../cache";
import { CommunityMark } from "../components/CommunitySwitcher";
import { CardGridSkeleton, GhostTree } from "../components/Skeletons";
import { formatRep, toNumber } from "../model";
import { useApp } from "../state";
import { AppLink, Badge, Button, Card, communityPath, Empty } from "../ui";
import { HowItWorks, TopOfTree } from "./Landing";

// The demo's tree for the front page, loaded in the background.
function useDemoTree() {
  const key = `graph.${DEMO_COMMUNITY}`;
  const [graph, setGraph] = useState<Graph | undefined>(() => readCache(key));
  useEffect(() => {
    fetchGraph(DEMO_COMMUNITY).then((g) => {
      writeCache(key, g);
      setGraph(g);
    }, () => {});
  }, [key]);
  return graph;
}

export function HomePage() {
  const { session, communities, createCommunity, openAuth } = useApp();
  const demo = useDemoTree();
  const yours = communities?.filter((c) => c.you !== null) ?? [];
  const others = communities?.filter((c) => c.you === null) ?? [];

  if (!session) {
    return (
      <div className="space-y-8">
        <section className="grid items-center gap-8 pt-4 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Reputation that comes from the people around you
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              Each Anthill community is a tree of people. You join next to someone you know,
              endorse people above you, and climb when your reputation passes your parent's.
              Start one for your group, or look around a public one. No wallet, no password: you
              sign in with a passkey.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="primary" onClick={createCommunity}>
                <Plus size={15} /> Start a community
              </Button>
              <Button onClick={() => openAuth("signin")}>Sign in</Button>
              <AppLink to={communityPath(DEMO_COMMUNITY, "/")} global>
                <Button variant="ghost">
                  See the demo <ArrowRight size={15} />
                </Button>
              </AppLink>
            </div>
          </div>
          <Card className="p-3">
            {demo ? (
              <div className="fade-in">
                <TopOfTree graph={demo} cid={DEMO_COMMUNITY} />
                <p className="pb-1 text-center text-[12px] text-slate-400">
                  The top of the demo community ·{" "}
                  <AppLink
                    to={`${communityPath(DEMO_COMMUNITY, "/explore")}?replay=1`}
                    global
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    watch it grow
                  </AppLink>
                </p>
              </div>
            ) : (
              <GhostTree />
            )}
          </Card>
        </section>
        <HowItWorks />
        <CommunityGrid title="Public communities" list={communities} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your communities</h1>
          <p className="mt-1 text-sm text-slate-500">
            One account everywhere; your reputation in each comes from the people there.
          </p>
        </div>
        <Button variant="primary" onClick={createCommunity}>
          <Plus size={15} /> Start a community
        </Button>
      </div>
      {communities && yours.length === 0 ? (
        <Card>
          <Empty>
            You're not in any community yet. Join a public one below, open an invite link
            someone sent you, or start your own.
          </Empty>
        </Card>
      ) : (
        <CommunityGrid list={communities && yours} />
      )}
      {others.length > 0 && <CommunityGrid title="Discover" list={others} />}
    </div>
  );
}

function CommunityGrid(props: { title?: string; list: Community[] | undefined }) {
  return (
    <section>
      {props.title && <h2 className="mb-3 text-[15px] font-semibold text-slate-900">{props.title}</h2>}
      {props.list === undefined ? (
        <CardGridSkeleton />
      ) : (
        <div className="fade-in grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {props.list.map((c) => (
            <CommunityCard key={c.id} community={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function CommunityCard(props: { community: Community }) {
  const c = props.community;
  return (
    <AppLink to={communityPath(c.id, "/")} global className="group block">
      <Card className="flex h-full flex-col transition-shadow group-hover:shadow-md">
        <div className="flex items-start gap-3">
          <CommunityMark community={c} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-slate-900">
              {c.visibility === "private" && <Lock size={13} className="shrink-0 text-slate-400" />}
              <span className="truncate">{c.name}</span>
            </h3>
            <p className="text-[13px] text-slate-500">
              {c.members} {c.members === 1 ? "member" : "members"}
              {c.rootName && ` · led by ${c.rootName}`}
            </p>
          </div>
        </div>
        {c.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{c.description}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          {c.you ? (
            <>
              <Badge tone="indigo">#{c.you.rank} of {c.members}</Badge>
              <span className="num text-[13px] text-slate-500">{formatRep(toNumber(c.you.reputation))} reputation</span>
            </>
          ) : (
            <Badge>{c.joinPolicy === "open" ? "Open to join" : "Invite only"}</Badge>
          )}
          {c.isFounder && <Badge tone="amber">Founder</Badge>}
        </div>
      </Card>
    </AppLink>
  );
}
