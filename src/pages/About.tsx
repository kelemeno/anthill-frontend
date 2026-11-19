// About (/c/<id>/about): the community's own words, in Markdown, written by
// whoever may change its settings. A tab only when it has some; visitors who
// aren't members also see it on the community's front page (AboutCard).
import { Palette } from "lucide-react";
import { useEffect, useState } from "react";

import { type Community, fetchSite } from "../api";
import { memory, viewerKey } from "../cache";
import { Skeleton } from "../components/Skeletons";
import { Markdown } from "../markdown";
import { siteOf } from "../site";
import { useApp } from "../state";
import { AppLink, Button, Card } from "../ui";

// the About each community last showed each viewer, for coming back without a
// wait (and the text just saved, at once)
const shown = memory<string>();

export function rememberAbout(who: string, cid: string, about: string) {
  shown.set(`${who}|${cid}`, about);
}

// The URL's community's About: its text ("" when it has none), undefined while
// it loads, and why it couldn't be loaded. Asked again whenever the community
// changes (the server announces a saved site like any change).
export function useAbout(): { community: Community | undefined; about: string | undefined; error?: string } {
  const { cid = "", graph, communities, session } = useApp();
  const community = graph?.community ?? communities?.find((c) => c.id === cid);
  const hasAbout = siteOf(community).hasAbout;
  const key = `${viewerKey(session)}|${cid}`;
  const [loaded, setLoaded] = useState<{ key: string; about: string }>();
  const [failed, setFailed] = useState<{ key: string; message: string }>();

  useEffect(() => {
    if (!cid || !hasAbout) return;
    let live = true;
    fetchSite(cid, session).then(
      (site) => {
        if (!live) return;
        const about = typeof site.about === "string" ? site.about : "";
        shown.set(key, about);
        setLoaded({ key, about });
        setFailed(undefined);
      },
      (e: Error) => live && setFailed({ key, message: e.message }),
    );
    return () => {
      live = false;
    };
  }, [cid, key, hasAbout, session, graph]);

  if (community && !hasAbout) return { community, about: "" };
  // the newest of what was fetched and what was just saved (both are written
  // to `shown`; `loaded` is what renders it again after a fetch)
  const about = shown.get(key) ?? (loaded?.key === key ? loaded.about : undefined);
  return { community, about, error: about === undefined && failed?.key === key ? failed.message : undefined };
}

export function AboutPage() {
  const { session, customise } = useApp();
  const { community, about, error } = useAbout();
  const canChange = session !== undefined && (community?.canChangeSettings ?? community?.isFounder);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {community ? (
        <h1 className="text-2xl font-semibold tracking-tight">About {community.name}</h1>
      ) : (
        <Skeleton className="h-8 w-48" />
      )}
      <Card>
        {error ? (
          <p className="text-sm text-red-600">Couldn't load it: {error}</p>
        ) : about === undefined ? (
          <AboutSkeleton />
        ) : about === "" ? (
          <div className="text-sm text-slate-600">
            <p>{community?.name ?? "This community"} hasn't written anything about itself yet.</p>
            <AppLink to="/">
              <Button className="mt-4">Back to {community?.name ?? "the community"}</Button>
            </AppLink>
          </div>
        ) : (
          <Markdown source={about} />
        )}
      </Card>
      {canChange && (
        <Button size="sm" variant="ghost" onClick={customise}>
          <Palette size={15} /> Edit in Customise
        </Button>
      )}
    </div>
  );
}

// On a community's front page, for visitors who aren't members.
export function AboutCard() {
  const { community, about } = useAbout();
  if (!community || !about) return null;
  return (
    <Card className="fade-in">
      <h2 className="mb-3 text-[15px] font-semibold text-slate-900">About {community.name}</h2>
      <Markdown source={about} />
    </Card>
  );
}

function AboutSkeleton() {
  return (
    <div aria-hidden>
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="mt-3 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-2/5" />
    </div>
  );
}
