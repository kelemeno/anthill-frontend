// Layout and routes: a slim header with the four places (a tab bar at the
// bottom on phones), the account, and the guided tour.
import { BarChart3, CircleHelp, Home, Network, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AccountMenu } from "./components/AccountMenu";
import { Tour, tourSteps } from "./components/Tour";
import { ExplorePage } from "./pages/Explore";
import { InvitePage } from "./pages/Invite";
import { PeoplePage } from "./pages/People";
import { PersonPage } from "./pages/Person";
import { PollsPage } from "./pages/Polls";
import { YouPage } from "./pages/You";
import { useApp } from "./state";
import { AppLink, Button, cx } from "./ui";

const tabs = [
  { to: "/", label: "You", icon: Home },
  { to: "/explore", label: "Explore", icon: Network },
  { to: "/polls", label: "Polls", icon: BarChart3 },
  { to: "/people", label: "People", icon: Users },
];

const TOUR_SEEN = "anthill.tourSeen";

function TabLink(props: { to: string; label: string; icon: typeof Home; mobile?: boolean }) {
  const [params] = useSearchParams();
  const as = params.get("as");
  const Icon = props.icon;
  return (
    <NavLink
      to={`${props.to}${as ? `?as=${as}` : ""}`}
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
  const { error, session, viewer, previewing, openAuth, tourRequested, startTour } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [touring, setTouring] = useState(false);

  // start the tour when asked (help button, account menu)
  useEffect(() => {
    if (tourRequested > 0) setTouring(true);
  }, [tourRequested]);

  // and once by itself on a first visit (not when opening an invite)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on first load
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_SEEN) !== null;
    } catch {}
    if (seen || location.pathname.startsWith("/invite")) return;
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
  const steps = useMemo(() => tourSteps({ member, signedIn }), [member, signedIn]);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 h-[57px] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <AppLink to="/" className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-7 w-7 mix-blend-multiply" />
            <span className="text-[17px] font-semibold tracking-tight">Anthill</span>
          </AppLink>
          <nav className="ml-4 hidden gap-1 sm:flex" data-tour="nav">
            {tabs.map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
          </nav>
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
        <Routes>
          <Route path="/" element={<YouPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/polls" element={<PollsPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/p/:id" element={<PersonPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />
          <Route path="*" element={<YouPage />} />
        </Routes>
      </main>

      <nav
        data-tour="nav"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {tabs.map((t) => (
          <TabLink key={t.to} {...t} mobile />
        ))}
      </nav>

      {touring && <Tour steps={steps} navigate={navigate} onClose={endTour} />}
    </div>
  );
}
