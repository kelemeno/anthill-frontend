// Layout and routes: a slim header with the community you're in and the pages
// its site shows (a tab bar at the bottom on phones: You, then Explore, Polls,
// People and Agents unless it turned them off, Agents only with an agent
// commons, and About when it has one), the account, and the guided tour. The
// community's accent colour is data-accent on <html> (so dialogs, which open
// outside the layout, have it too). Each community lives under /c/<id>; /
// lists them all. The account page, Google's way back, and the privacy and
// terms pages are outside any community.
import { BarChart3, Bot, CircleHelp, Home, Info, Network, Palette, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { type Community, DEMO_COMMUNITY, type SitePage } from "./api";
import { AccountMenu } from "./components/AccountMenu";
import { CommunitySwitcher } from "./components/CommunitySwitcher";
import { Tour, tourSteps } from "./components/Tour";
import { AboutPage } from "./pages/About";
import { AccountPage } from "./pages/Account";
import { AgentsPage } from "./pages/Agents";
import { ExplorePage } from "./pages/Explore";
import { GoogleCallbackPage } from "./pages/GoogleCallback";
import { HomePage } from "./pages/Home";
import { InvitePage } from "./pages/Invite";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import { PeoplePage } from "./pages/People";
import { PersonPage } from "./pages/Person";
import { PollsPage } from "./pages/Polls";
import { YouPage } from "./pages/You";
import { DEFAULT_ACCENT, type NavPage, navPages, PAGE_LABELS, siteOf } from "./site";
import { useApp } from "./state";
import { AppLink, Button, Card, communityPath, cx } from "./ui";

const tabs: Record<NavPage, { to: string; label: string; icon: typeof Home }> = {
  home: { to: "/", label: "You", icon: Home },
  explore: { to: "/explore", label: "Explore", icon: Network },
  polls: { to: "/polls", label: "Polls", icon: BarChart3 },
  people: { to: "/people", label: "People", icon: Users },
  agents: { to: "/agents", label: "Agents", icon: Bot },
  about: { to: "/about", label: "About", icon: Info },
};

const TOUR_SEEN = "anthill.tourSeen";
// a community's home page, /c/<id> (where the tour starts by itself)
const COMMUNITY_HOME = /^\/c\/[^/]+\/?$/;

// More tabs than this don't fit beside the community's name on a small screen
// (a commons with an About has six), so below lg they show only their icons.
const LABELLED_TABS = 4;

function TabLink(props: {
  cid: string;
  to: string;
  label: string;
  icon: typeof Home;
  mobile?: boolean;
  // icon only, below lg
  compact?: boolean;
}) {
  const [params] = useSearchParams();
  const as = params.get("as");
  const Icon = props.icon;
  return (
    <NavLink
      to={`${communityPath(props.cid, props.to)}${as ? `?as=${as}` : ""}`}
      end={props.to === "/"}
      aria-label={props.compact ? props.label : undefined}
      title={props.compact ? props.label : undefined}
      className={({ isActive }) =>
        props.mobile
          ? cx(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              isActive ? "text-accent-600" : "text-slate-500",
            )
          : cx(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900",
            )
      }
    >
      <Icon size={props.mobile ? 20 : 16} />
      {props.compact ? <span className="hidden lg:inline">{props.label}</span> : props.label}
    </NavLink>
  );
}

export function App() {
  const {
    cid: urlCid,
    notFound,
    homeCid,
    communities,
    graph,
    error,
    session,
    viewer,
    previewing,
    openAuth,
    tourRequested,
    startTour,
  } = useApp();
  // the community whose tabs to show (before its graph loads, its summary)
  const cid = notFound ? undefined : urlCid;
  const community = cid ? (graph?.community ?? communities?.find((c) => c.id === cid)) : undefined;
  const shownTabs = navPages(community).map((page) => tabs[page]);
  const accent = siteOf(community).accent;
  // before the page paints, so it never shows in the wrong colour
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (accent !== DEFAULT_ACCENT) root.setAttribute("data-accent", accent);
    return () => root.removeAttribute("data-accent");
  }, [accent]);
  const navigate = useNavigate();
  const location = useLocation();
  const [touring, setTouring] = useState(false);

  // start the tour when asked (help button, account menu)
  useEffect(() => {
    if (tourRequested > 0) setTouring(true);
  }, [tourRequested]);

  // and once by itself on a first visit, on a community's home page: a link
  // to any other page (an agents page, a person, a shared replay) is what they
  // came to see, so the tour waits until they're on a community's home. Not
  // at all in a visit that opened with a replay link.
  const autoTour = useRef(!location.search.includes("replay=1"));
  useEffect(() => {
    if (!autoTour.current || !COMMUNITY_HOME.test(location.pathname)) return;
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_SEEN) !== null;
    } catch {}
    if (seen) return;
    const t = setTimeout(() => {
      autoTour.current = false;
      setTouring(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const endTour = useCallback(() => {
    setTouring(false);
    try {
      localStorage.setItem(TOUR_SEEN, "1");
    } catch {}
  }, []);

  const member = viewer !== undefined;
  const signedIn = session !== undefined;
  // the tour's pages are in the current (or last visited) community, or the
  // demo when that one is still empty
  const tourCid = communities?.find((c) => c.id === homeCid)?.members === 0 ? DEMO_COMMUNITY : homeCid;
  // (only the tabs that community shows)
  const tourCommunity = tourCid === cid ? community : communities?.find((c) => c.id === tourCid);
  const tourTabs = navPages(tourCommunity);
  const tabsKey = tourTabs.join();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tabsKey stands for tourTabs
  const steps = useMemo(
    () =>
      tourSteps({ member, signedIn, tabs: tourTabs }).map((step) =>
        step.path ? { ...step, path: communityPath(tourCid, step.path) } : step,
      ),
    [member, signedIn, tourCid, tabsKey],
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 h-[57px] border-b border-slate-200 bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <AppLink to="/" global className="flex shrink-0 items-center gap-2" aria-label="All communities">
            <img src="/logo.svg" alt="" className="h-7 w-7" />
            <span className={cx("text-[17px] font-semibold tracking-tight", cid && "hidden md:inline")}>Anthill</span>
          </AppLink>
          <span className="text-slate-300">/</span>
          <div className="-ml-1.5 min-w-0">
            <CommunitySwitcher />
          </div>
          {cid && (
            <nav className="ml-2 hidden gap-1 sm:flex" data-tour="nav">
              {shownTabs.map((t) => (
                <TabLink key={t.to} cid={cid} {...t} compact={shownTabs.length > LABELLED_TABS} />
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button variant="ghost" size="sm" aria-label="Guided tour" title="Guided tour" onClick={startTour}>
              <CircleHelp size={17} />
            </Button>
            {session ? (
              <AccountMenu session={session} />
            ) : (
              <Button
                size="sm"
                data-tour="signin"
                variant={previewing ? "secondary" : "primary"}
                onClick={() => openAuth("signin")}
              >
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 sm:pb-8 lg:px-8">
        {error && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Couldn't reach the server: {error}
          </p>
        )}
        {/* each page fades in; its data, if not cached, replaces placeholders */}
        <div key={location.pathname} className="fade-in">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/c/:cid" element={<InCommunity page={<YouPage />} />} />
            <Route path="/c/:cid/explore" element={<InCommunity page={<ExplorePage />} needs="explore" />} />
            <Route path="/c/:cid/polls" element={<InCommunity page={<PollsPage />} needs="polls" />} />
            <Route path="/c/:cid/people" element={<InCommunity page={<PeoplePage />} needs="people" />} />
            <Route path="/c/:cid/agents" element={<InCommunity page={<AgentsPage />} needs="agents" />} />
            <Route path="/c/:cid/about" element={<InCommunity page={<AboutPage />} />} />
            <Route path="/c/:cid/p/:id" element={<InCommunity page={<PersonPage />} />} />
            <Route path="/invite/:code" element={<InvitePage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/auth/google" element={<GoogleCallbackPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
      </main>

      {cid && (
        <nav
          data-tour="nav"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] border-t border-slate-200 bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {shownTabs.map((t) => (
            <TabLink key={t.to} cid={cid} {...t} mobile />
          ))}
        </nav>
      )}

      {touring && <Tour steps={steps} navigate={navigate} onClose={endTour} />}
    </div>
  );
}

// A page inside a community, once we know the community exists and you may
// see it, and (for a page it can turn off) that it shows it. Until the
// community is known, the page shows (with its placeholders).
function InCommunity(props: { page: ReactNode; needs?: SitePage }) {
  const { notFound, session, openAuth, cid, graph, communities } = useApp();
  const community = graph?.community ?? communities?.find((c) => c.id === cid);
  // (a community without a commons has no Agents to turn off: its page says so)
  const off =
    props.needs !== undefined &&
    community !== undefined &&
    !siteOf(community).pages[props.needs] &&
    (props.needs !== "agents" || Boolean(community.commons));
  if (!notFound && off) return <PageOff community={community} page={props.needs!} />;
  if (!notFound) return props.page;
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-lg font-semibold">This community isn't here</h1>
      <p className="mt-2 text-sm text-slate-600">
        It doesn't exist, or it's private and only its members can see it. If someone invited
        you, open the invite link they sent.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!session && (
          <Button variant="primary" onClick={() => openAuth("signin")}>
            Sign in
          </Button>
        )}
        <AppLink to="/" global>
          <Button>All communities</Button>
        </AppLink>
      </div>
    </Card>
  );
}

// A page the community turned off: what it is, and the way home (and, for
// whoever may, back on).
function PageOff(props: { community: Community; page: SitePage }) {
  const { session, customise } = useApp();
  const { community } = props;
  const label = PAGE_LABELS[props.page];
  const canChange = session !== undefined && (community.canChangeSettings ?? community.isFounder);
  return (
    <Card className="mx-auto max-w-md">
      <h1 className="text-lg font-semibold">This community doesn't use {label}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {community.name} doesn't show a {label} page.
        {canChange && " You can turn it back on in Customise: nothing in it was deleted."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <AppLink to="/">
          <Button>Back to {community.name}</Button>
        </AppLink>
        {canChange && (
          <Button variant="ghost" onClick={customise}>
            <Palette size={15} /> Customise
          </Button>
        )}
      </div>
    </Card>
  );
}
