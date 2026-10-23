// App-wide state: the communities, the community in the URL (/c/<id>/...) and
// its live graph (refetched whenever the backend announces an update), the
// passkey session, and the viewer: the signed-in person, or a member you
// preview the app as (?as=<id>, read-only). Also the things any screen can
// open: the sign-in dialog, the recovery code, toasts, the tour, and the
// dialogs for starting a community or changing its settings.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMatch, useSearchParams } from "react-router-dom";

import {
  ApiError,
  type Community,
  DEFAULT_COMMUNITY,
  fetchCommunities,
  fetchGraph,
  fetchMe,
  type Graph,
  loadSession,
  type Person,
  type Session,
  saveSession,
  wsUrl,
} from "./api";
import { dropCache, readCache, writeCache } from "./cache";
import { AuthModal, type AuthMode } from "./components/AuthModal";
import { CommunitySettingsModal, CreateCommunityModal } from "./components/CommunityModals";
import { RecoveryCodeModal } from "./ui";

const LAST_COMMUNITY = "anthill.community";

const graphKey = (cid: string) => `graph.${cid}`;
const communitiesKey = (session: Session | undefined) => `communities.${session?.user.id ?? "anyone"}`;

type AppState = {
  // the community in the URL, if any
  cid: string | undefined;
  // the one the tabs lead to: the one in the URL, or the last one visited
  homeCid: string;
  communities: Community[] | undefined;
  // the URL's community's graph
  graph: Graph | undefined;
  // the URL's community doesn't exist, or is private and you're not in it
  notFound: boolean;
  error: string | undefined;
  reload: () => void;
  session: Session | undefined;
  setSession: (s: Session | undefined) => void;
  // who the screens are about: you (if you're in the tree), or the member
  // being previewed
  viewer: Person | undefined;
  previewing: boolean;
  setPreviewAs: (id: string | undefined) => void;
  notify: (message: string) => void;
  openAuth: (mode?: AuthMode) => void;
  showRecoveryCode: (code: string) => void;
  tourRequested: number;
  startTour: () => void;
  createCommunity: () => void;
  editCommunity: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function AppProvider(props: { children: ReactNode }) {
  const cid = useMatch("/c/:cid/*")?.params.cid;
  const [session, setSessionState] = useState(loadSession);
  // what was last shown paints first; fresh data replaces it when it arrives
  const [graph, setGraph] = useState<Graph | undefined>(() => (cid ? readCache(graphKey(cid)) : undefined));
  const [notFound, setNotFound] = useState(false);
  const [communities, setCommunities] = useState<Community[] | undefined>(() => readCache(communitiesKey(session)));
  const [error, setError] = useState<string>();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string>();
  const [auth, setAuth] = useState<AuthMode>();
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [tourRequested, setTourRequested] = useState(0);
  const [dialog, setDialog] = useState<"create" | "settings">();

  const [lastCid, setLastCid] = useState(() => {
    try {
      return localStorage.getItem(LAST_COMMUNITY) ?? DEFAULT_COMMUNITY;
    } catch {
      return DEFAULT_COMMUNITY;
    }
  });
  useEffect(() => {
    if (!cid || notFound) return;
    setLastCid(cid);
    try {
      localStorage.setItem(LAST_COMMUNITY, cid);
    } catch {}
  }, [cid, notFound]);

  // read by the reloads, so a late answer for another community is dropped
  const current = useRef({ cid, session });
  current.current = { cid, session };
  // every graph seen this visit, for switching back without a wait
  const seen = useRef(new Map<string, Graph>());

  const reloadGraph = useCallback(() => {
    const { cid, session } = current.current;
    if (!cid) return;
    fetchGraph(cid, session).then(
      (g) => {
        seen.current.set(cid, g);
        if (g.community.visibility === "public") writeCache(graphKey(cid), g);
        else dropCache(graphKey(cid));
        if (current.current.cid !== cid) return;
        setGraph(g);
        setNotFound(false);
        setError(undefined);
      },
      (e: Error) => {
        const gone = e instanceof ApiError && e.status === 404;
        if (gone) {
          seen.current.delete(cid);
          dropCache(graphKey(cid));
        }
        if (current.current.cid !== cid) return;
        if (gone) {
          setGraph(undefined);
          setNotFound(true);
        } else setError(e.message);
      },
    );
  }, []);

  const reloadCommunities = useCallback(() => {
    const { session } = current.current;
    fetchCommunities(session).then((list) => {
      writeCache(communitiesKey(session), list);
      if (current.current.session === session) setCommunities(list);
    }, () => {});
  }, []);

  const reload = useCallback(() => {
    reloadGraph();
    reloadCommunities();
  }, [reloadGraph, reloadCommunities]);

  // a new community, or a new session (private communities need it)
  const token = session?.token;
  // biome-ignore lint/correctness/useExhaustiveDependencies: cid and token trigger it
  useEffect(() => {
    setGraph(cid ? (seen.current.get(cid) ?? readCache(graphKey(cid))) : undefined);
    setNotFound(false);
    reloadGraph();
  }, [cid, token, reloadGraph]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: token triggers it
  useEffect(() => {
    setCommunities(readCache(communitiesKey(current.current.session)));
    reloadCommunities();
  }, [token, reloadCommunities]);

  useEffect(() => {
    // the backend sends "update:<community>" after every change there, and
    // "update" after changes that may touch any community
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        const message = String(event.data);
        if (message === "update" || message === `update:${current.current.cid}`) reloadGraph();
        if (message.startsWith("update")) reloadCommunities();
      };
      socket.onclose = () => {
        retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      clearTimeout(retry);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [reloadGraph, reloadCommunities]);

  const setSession = useCallback((s: Session | undefined) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  // drop a stored session the server no longer accepts
  useEffect(() => {
    if (!token) return;
    fetchMe(token).catch((e: Error) => {
      if (/sign|session|unknown user/i.test(e.message)) setSession(undefined);
    });
  }, [token, setSession]);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const previewId = params.get("as") ?? undefined;
  const setPreviewAs = useCallback(
    (id: string | undefined) => {
      const next = new URLSearchParams(params);
      if (id) next.set("as", id);
      else next.delete("as");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const viewerId = session?.user.id ?? previewId;
  const viewer = viewerId ? graph?.nodes[viewerId] : undefined;

  // the tab title names the community
  const communityName = cid ? graph?.community.name : undefined;
  useEffect(() => {
    document.title = communityName ? `${communityName} · Anthill` : "Anthill";
  }, [communityName]);

  return (
    <Ctx.Provider
      value={{
        cid,
        homeCid: cid && !notFound ? cid : lastCid,
        communities,
        graph,
        notFound,
        error,
        reload,
        session,
        setSession,
        viewer,
        previewing: !session && viewer !== undefined,
        setPreviewAs,
        notify,
        openAuth: (mode = "signin") => setAuth(mode),
        showRecoveryCode: setRecoveryCode,
        tourRequested,
        startTour: () => setTourRequested((n) => n + 1),
        createCommunity: () => (session ? setDialog("create") : setAuth("create")),
        editCommunity: () => setDialog("settings"),
      }}
    >
      {props.children}
      {dialog === "create" && session && <CreateCommunityModal onClose={() => setDialog(undefined)} />}
      {dialog === "settings" && session && graph && (
        <CommunitySettingsModal community={graph.community} onClose={() => setDialog(undefined)} />
      )}
      {auth && (
        <AuthModal
          mode={auth}
          onClose={() => setAuth(undefined)}
          onSession={(s, code) => {
            setSession(s);
            setPreviewAs(undefined);
            setAuth(undefined);
            if (code) setRecoveryCode(code);
          }}
        />
      )}
      {recoveryCode && (
        <RecoveryCodeModal code={recoveryCode} onDone={() => setRecoveryCode(undefined)} />
      )}
      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 sm:bottom-6">
          <div role="status" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
