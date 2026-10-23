// Layout and routes: a slim header with the community you're in and its four
// places (a tab bar at the bottom on phones), the account, and the guided
// tour. Each community lives under /c/<id>; / lists them all.
import { BarChart3, CircleHelp, Home, Network, Users } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { DEMO_COMMUNITY } from "./api";
import { AccountMenu } from "./components/AccountMenu";
import { CommunitySwitcher } from "./components/CommunitySwitcher";
import { Tour, tourSteps } from "./components/Tour";
import { ExplorePage } from "./pages/Explore";
import { HomePage } from "./pages/Home";
import { InvitePage } from "./pages/Invite";
import { PeoplePage } from "./pages/People";
import { PersonPage } from "./pages/Person";
import { PollsPage } from "./pages/Polls";
import { YouPage } from "./pages/You";
import { useApp } from "./state";
import { AppLink, Button, Card, communityPath, cx } from "./ui";

const tabs = [
  { to: "/", label: "You", icon: Home },
  { to: "/explore", label: "Explore", icon: Network },
  { to: "/polls", label: "Polls", icon: BarChart3 },
  { to: "/people", label: "People", icon: Users },
];

const TOUR_SEEN = "anthill.tourSeen";

function TabLink(props: { cid: string; to: string; label: string; icon: typeof Home; mobile?: boolean }) {
  const [params] = useSearchParams();
  const as = params.get("as");
  const Icon = props.icon;
  return (
    <NavLink
      to={`${communityPath(props.cid, props.to)}${as ? `?as=${as}` : ""}`}
      end={props.to === "/"}
      className={({ isActive }) =>
        props.mobile
          ? cx(
              "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              isActive ? "text-indigo-600" : "text-slate-500",
            )
          : cx(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900",
            )
      }
    >
      <Icon size={props.mobile ? 20 : 16} />
      {props.label}
    </NavLink>
  );
}

export function App() {
  const {
    cid: urlCid,
    notFound,
    homeCid,
    communities,
    error,
    session,
    viewer,
    previewing,
    openAuth,
    tourRequested,
    startTour,
  } = useApp();
  // the community whose tabs to show
  const cid = notFound ? undefined : urlCid;
  const navigate = useNavigate();
  const location = useLocation();
  const [touring, setTouring] = useState(false);

  // start the tour when asked (help button, account menu)
  useEffect(() => {
    if (tourRequested > 0) setTouring(true);
  }, [tourRequested]);

  // and once by itself on a first visit to a community
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on first load
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_SEEN) !== null;
    } catch {}
    if (seen || !location.pathname.startsWith("/c/")) return;
    const t = setTimeout(() => setTouring(true), 1200);
    return () => clearTimeout(t);
  }, []);

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
  const steps = useMemo(
    () =>
      tourSteps({ member, signedIn }).map((step) =>
        step.path ? { ...step, path: communityPath(tourCid, step.path) } : step,
      ),
    [member, signedIn, tourCid],
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 h-[57px] border-b border-slate-200 bg-white/90 backdrop-blur">
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
              {tabs.map((t) => (
                <TabLink key={t.to} cid={cid} {...t} />
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
            <Route path="/c/:cid/explore" element={<InCommunity page={<ExplorePage />} />} />
            <Route path="/c/:cid/polls" element={<InCommunity page={<PollsPage />} />} />
            <Route path="/c/:cid/people" element={<InCommunity page={<PeoplePage />} />} />
            <Route path="/c/:cid/p/:id" element={<InCommunity page={<PersonPage />} />} />
            <Route path="/invite/:code" element={<InvitePage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </div>
      </main>

      {cid && (
        <nav
          data-tour="nav"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
        >
          {tabs.map((t) => (
            <TabLink key={t.to} cid={cid} {...t} mobile />
          ))}
        </nav>
      )}

      {touring && <Tour steps={steps} navigate={navigate} onClose={endTour} />}
    </div>
  );
}

// A page inside a community, once we know the community exists and you may
// see it.
function InCommunity(props: { page: ReactNode }) {
  const { notFound, session, openAuth } = useApp();
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
