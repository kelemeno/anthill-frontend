// A person's page (/p/:id): who they are, how they relate to you, what you can
// do with them, who endorses them (and how much each adds), who they endorse,
// and their neighbourhood in the tree.
import { ExternalLink, Network } from "lucide-react";
import { useParams } from "react-router-dom";

import { Neighbourhood } from "../components/Neighbourhood";
import { PersonActions } from "../components/PersonActions";
import {
  endorsementsIn,
  endorsementsOut,
  formatRep,
  level,
  parentOf,
  rankOf,
  relation,
  rep,
} from "../model";
import { useApp } from "../state";
import { RowsSkeleton, Skeleton } from "../components/Skeletons";
import { AppLink, Avatar, Badge, Button, Card, CardTitle, Empty, PersonRow } from "../ui";

export function PersonPage() {
  const { id = "" } = useParams();
  const { graph, viewer, session } = useApp();
  if (!graph) {
    return (
      <div className="space-y-5">
        <Card>
          <div className="flex items-center gap-4">
            <Skeleton round className="h-[60px] w-[60px] shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-56" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-4 h-4 w-40" />
          <RowsSkeleton rows={3} />
        </Card>
      </div>
    );
  }
  const them = graph.nodes[id.toLowerCase()];
  if (!them) {
    return (
      <Card>
        <p className="text-sm text-slate-600">This person isn't in the tree (any more).</p>
      </Card>
    );
  }
  const { rank, of } = rankOf(graph, them.id);
  const parent = parentOf(graph, them);
  const rel = relation(graph, viewer, them);
  const isMe = viewer?.id === them.id;
  const incoming = endorsementsIn(graph, them);
  const outgoing = endorsementsOut(graph, them);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar person={them} size={60} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{them.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isMe && <Badge tone="indigo">You</Badge>}
              {rel && <Badge tone="indigo">{rel}</Badge>}
              <Badge>
                #{rank} of {of}
              </Badge>
              <Badge>Level {level(them)}</Badge>
              {parent && (
                <Badge>
                  Under{" "}
                  <AppLink to={`/p/${parent.id}`} className="font-semibold hover:underline">
                    {parent.name}
                  </AppLink>
                </Badge>
              )}
            </div>
            {them.bio && <p className="mt-2 text-sm text-slate-600">{them.bio}</p>}
            {them.link && (
              <a
                href={them.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-1 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
              >
                {them.link.replace(/^https?:\/\//, "")} <ExternalLink size={13} />
              </a>
            )}
          </div>
          <div className="text-right">
            <div className="num text-3xl font-semibold tracking-tight">{formatRep(rep(them))}</div>
            <div className="text-[13px] text-slate-500">reputation</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <AppLink to={`/explore?focus=${them.id}`}>
            <Button size="sm">
              <Network size={15} /> Show in the tree
            </Button>
          </AppLink>
          {isMe && (
            <AppLink to="/">
              <Button size="sm">Go to your overview</Button>
            </AppLink>
          )}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {!isMe && (
            <Card>
              <CardTitle
                hint={
                  session
                    ? "Greyed out means not possible right now; the reason is underneath."
                    : undefined
                }
              >
                What you can do
              </CardTitle>
              <PersonActions them={them} />
            </Card>
          )}
          <Card>
            <CardTitle hint="What each endorsement adds to their reputation.">
              Endorsed by {incoming.length} {incoming.length === 1 ? "person" : "people"}
            </CardTitle>
            <div className="divide-y divide-slate-50">
              {incoming.map((e) => (
                <PersonRow
                  key={e.from.id}
                  person={e.from}
                  right={<span className="num text-sm font-medium text-emerald-600">+{formatRep(e.adds)}</span>}
                />
              ))}
            </div>
            {incoming.length === 0 && <Empty>No endorsements yet.</Empty>}
          </Card>
          <Card>
            <CardTitle hint="Their reputation is split between these people.">
              Endorses {outgoing.length} {outgoing.length === 1 ? "person" : "people"}
            </CardTitle>
            <div className="divide-y divide-slate-50">
              {outgoing.map((e) => (
                <PersonRow
                  key={e.to.id}
                  person={e.to}
                  right={<span className="num text-[13px] text-slate-500">{Math.round(e.share * 100)}%</span>}
                />
              ))}
            </div>
            {outgoing.length === 0 && <Empty>They don't endorse anyone yet.</Empty>}
          </Card>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardTitle>Neighbourhood</CardTitle>
            <Neighbourhood graph={graph} person={them} viewerId={viewer?.id} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
