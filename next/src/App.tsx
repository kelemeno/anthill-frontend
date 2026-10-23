// Layout and routes of the prototype: a slim header with You / Explore (a tab
// bar at the bottom on phones), and the pages.
import { Home, LogOut, Network } from "lucide-react";
import { NavLink, Route, Routes, useSearchParams } from "react-router-dom";

import { signIn } from "./api";
import { ExplorePage } from "./pages/Explore";
import { PersonPage } from "./pages/Person";
import { YouPage } from "./pages/You";
import { useApp } from "./state";
import { AppLink, Avatar, Button, cx } from "./ui";

const tabs = [
  { to: "/", label: "You", icon: Home },
  { to: "/explore", label: "Explore", icon: Network },
];

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

function Account() {
  const { session, setSession, viewer, previewing } = useApp();
  if (session) {
    return (
      <div className="flex items-center gap-2">
        {viewer && (
          <AppLink to="/" className="hidden items-center gap-2 sm:flex">
            <Avatar person={viewer} size={28} />
            <span className="max-w-[140px] truncate text-sm font-medium">{viewer.name}</span>
          </AppLink>
        )}
        <Button size="sm" variant="ghost" title="Sign out" onClick={() => setSession(undefined)}>
          <LogOut size={15} />
        </Button>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant={previewing ? "secondary" : "primary"}
      onClick={() => signIn().then(setSession, () => {})}
    >
      Sign in
    </Button>
  );
}

export function App() {
  const { error } = useApp();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 h-[57px] border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <AppLink to="/" className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-7 w-7 mix-blend-multiply" />
            <span className="text-[17px] font-semibold tracking-tight">Anthill</span>
          </AppLink>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
            New design preview
          </span>
          <nav className="ml-4 hidden gap-1 sm:flex">
            {tabs.map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <a href="/" className="hidden text-[13px] text-slate-500 hover:text-slate-900 md:inline">
              Current site
            </a>
            <Account />
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
          <Route path="/p/:id" element={<PersonPage />} />
          <Route path="*" element={<YouPage />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-[60px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        {tabs.map((t) => (
          <TabLink key={t.to} {...t} mobile />
        ))}
      </nav>
    </div>
  );
}
