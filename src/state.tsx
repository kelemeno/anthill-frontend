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
  useMemo,
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
  isStarting,
  loadSession,
  retryDelay,
  type Person,
  type Session,
  saveSession,
  sessionOf,
  whenSessionRejected,
  wsUrl,
} from "./api";
import { dropCache, dropCacheUnder, forgetMemories, memory, readCache, viewerKey, writeCache } from "./cache";
import { AuthModal, type AuthMode } from "./components/AuthModal";
import { CommunitySettingsModal, CreateCommunityModal } from "./components/CommunityModals";
import { person } from "./model";
import { RecoveryCodeModal } from "./ui";

const LAST_COMMUNITY = "anthill.community";
// set while that one is private: it's forgotten with the account
const LAST_PRIVATE = "anthill.community.private";

const storedPrivate = () => {
  try {
    return localStorage.getItem(LAST_PRIVATE) !== null;
  } catch {
    return false;
  }
};

const graphKey = (who: string, cid: string) => `graph.${who}.${cid}`;
const communitiesKey = (who: string) => `communities.${who}`;

type AppState = {
  // the community in the URL, if any
  cid: string | undefined;
  // the one the tabs lead to: the one in the URL, or the last one visited
  homeCid: string;
  communities: Community[] | undefined;
  // the communities are the server's latest answer for this viewer (not the
  // device's copy, which leaves out private ones)
  communitiesFresh: boolean;
  // why the communities couldn't be loaded, if they couldn't
  communitiesError: string | undefined;
  // the URL's community's graph
  graph: Graph | undefined;
  // the URL's community doesn't exist, or is private and you're not in it
  notFound: boolean;
  // why the URL's community's graph couldn't be loaded, if it couldn't
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
  // whose data it is, and what the page shows: a community as seen by them.
  // Data is kept with the slot it was loaded for and never shown for another.
  const who = viewerKey(session);
  const slot = cid ? `${who}|${cid}` : undefined;
  // every graph seen this visit, for switching back without a wait
  const [seen] = useState(() => memory<Graph>());
  // the slot's last answer: its graph, or none when it isn't there
  const [loaded, setLoaded] = useState<{ slot: string; graph?: Graph }>();
  const [failed, setFailed] = useState<{ slot: string; message: string }>();
  const [listed, setListed] = useState<{ who: string; list: Community[] }>();
  const [listFailed, setListFailed] = useState<{ who: string; message: string }>();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string>();
  const [auth, setAuth] = useState<AuthMode>();
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [tourRequested, setTourRequested] = useState(0);
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "settings"; community: Community }>();
  // what to open once signed in (Start a community, while signed out)
  const [afterAuth, setAfterAuth] = useState<"create">();

  // the last public graph shown, whoever it was for: a public tree is the same
  // for everyone, so it stays on screen across signing in or out (without the
  // last viewer's standing) until the new viewer's arrives. Never a private one.
  const lastPublic = useRef<{ cid: string; graph: Graph }>(undefined);
  // what was last shown paints first; fresh data replaces it when it arrives
  // biome-ignore lint/correctness/useExhaustiveDependencies: slot stands for cid and who
  const cachedGraph = useMemo(() => {
    if (!slot || !cid) return undefined;
    const kept = seen.get(slot) ?? readCache<Graph>(graphKey(who, cid));
    if (kept) return kept;
    const last = lastPublic.current;
    if (last?.cid !== cid) return undefined;
    return { ...last.graph, community: { ...last.graph.community, isFounder: false, you: null } };
  }, [slot]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: who triggers it
  const cachedList = useMemo(() => readCache<Community[]>(communitiesKey(who)), [who]);
  const fresh = loaded?.slot === slot ? loaded : undefined;
  const graph = fresh ? fresh.graph : cachedGraph;
  if (cid && graph) lastPublic.current = graph.community.visibility === "public" ? { cid, graph } : undefined;
  const notFound = fresh !== undefined && fresh.graph === undefined;
  const error = failed && failed.slot === slot ? failed.message : undefined;
  const communitiesFresh = listed?.who === who;
  const communities = communitiesFresh ? listed.list : cachedList;
  const communitiesError = listFailed?.who === who ? listFailed.message : undefined;

  // the last community that loaded, for the tabs and the tour (a private one
  // only while the account that saw it is signed in)
  const [lastCid, setLastCid] = useState(() => {
    try {
      if (storedPrivate() && !session) return DEFAULT_COMMUNITY;
      return localStorage.getItem(LAST_COMMUNITY) ?? DEFAULT_COMMUNITY;
    } catch {
      return DEFAULT_COMMUNITY;
    }
  });
  const lastPrivate = useRef(storedPrivate());
  const remember = useCallback((cid: string, isPrivate: boolean) => {
    setLastCid(cid);
    lastPrivate.current = isPrivate;
    try {
      localStorage.setItem(LAST_COMMUNITY, cid);
      if (isPrivate) localStorage.setItem(LAST_PRIVATE, "1");
      else localStorage.removeItem(LAST_PRIVATE);
    } catch {}
  }, []);
  const forgetLast = useCallback(() => {
    setLastCid(DEFAULT_COMMUNITY);
    lastPrivate.current = false;
    try {
      localStorage.removeItem(LAST_COMMUNITY);
      localStorage.removeItem(LAST_PRIVATE);
    } catch {}
  }, []);
  const forget = useCallback(
    (cid: string) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(LAST_COMMUNITY);
      } catch {}
      if (stored === cid) forgetLast();
      else setLastCid((last) => (last === cid ? DEFAULT_COMMUNITY : last));
    },
    [forgetLast],
  );

  // read by the reloads, so an answer for another page or viewer is dropped
  const failing = error !== undefined || communitiesError !== undefined;
  const current = useRef({ cid, session, slot, who, updateKey: graph?.updateKey, failing });
  current.current = { cid, session, slot, who, updateKey: graph?.updateKey, failing };
  // An answer counts unless it's for another page or viewer, or older than the
  // one shown (applied). A newer request still on its way doesn't drop it:
  // with updates coming faster than answers, nothing would ever show. Errors
  // count only from the latest request (and it retries while the server starts).
  const newRequest = () => ({ seq: 0, applied: 0, attempt: 0, retry: undefined as ReturnType<typeof setTimeout> | undefined });
  const graphRequest = useRef(newRequest());
  const listRequest = useRef(newRequest());

  const reloadGraph = useCallback(() => {
    const request = graphRequest.current;
    const seq = ++request.seq;
    clearTimeout(request.retry);
    const { cid, session, slot, who } = current.current;
    if (!cid || !slot) return;
    const superseded = () => current.current.slot !== slot || seq < request.applied;
    fetchGraph(cid, session).then(
      (g) => {
        if (superseded()) return;
        request.applied = seq;
        if (seq === request.seq) request.attempt = 0;
        seen.set(slot, g);
        if (g.community.visibility === "public") writeCache(graphKey(who, cid), g);
        else dropCache(graphKey(who, cid));
        setLoaded({ slot, graph: g });
        setFailed(undefined);
        remember(cid, g.community.visibility === "private");
      },
      (e: Error) => {
        const missing = e instanceof ApiError && e.status === 404;
        // gone for this viewer, whatever page they're on now (they left it)
        if (missing && current.current.who === who && seq > request.applied) forget(cid);
        if (superseded() || seq !== request.seq) return;
        if (isStarting(e)) {
          request.retry = setTimeout(reloadGraph, retryDelay(request.attempt++));
          return;
        }
        request.attempt = 0;
        if (missing) {
          request.applied = seq;
          seen.delete(slot);
          dropCache(graphKey(who, cid));
          if (lastPublic.current?.cid === cid) lastPublic.current = undefined;
          setLoaded({ slot });
          setFailed(undefined);
          // a lapsed session makes a private community 404: see if it has
          // (a rejected token signs out, through whenSessionRejected)
          if (session) fetchMe(session.token).catch(() => {});
        } else setFailed({ slot, message: e.message });
      },
    );
  }, [seen, remember, forget]);

  const reloadCommunities = useCallback(() => {
    const request = listRequest.current;
    const seq = ++request.seq;
    clearTimeout(request.retry);
    const { session, who } = current.current;
    const superseded = () => current.current.who !== who || seq < request.applied;
    fetchCommunities(session).then(
      (list) => {
        if (superseded()) return;
        request.applied = seq;
        if (seq === request.seq) request.attempt = 0;
        // private communities' names stay off the device
        writeCache(communitiesKey(who), list.filter((c) => c.visibility === "public"));
        setListed({ who, list });
        setListFailed(undefined);
      },
      (e: Error) => {
        if (superseded() || seq !== request.seq) return;
        if (isStarting(e)) {
          request.retry = setTimeout(reloadCommunities, retryDelay(request.attempt++));
          return;
        }
        request.attempt = 0;
        setListFailed({ who, message: e.message });
      },
    );
  }, []);

  const reload = useCallback(() => {
    reloadGraph();
    reloadCommunities();
  }, [reloadGraph, reloadCommunities]);

  // a new community, or a new session (private communities need it)
  const token = session?.token;
  // biome-ignore lint/correctness/useExhaustiveDependencies: slot and token trigger it
  useEffect(() => {
    setFailed(undefined);
    reloadGraph();
  }, [slot, token, reloadGraph]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: token triggers it
  useEffect(() => {
    reloadCommunities();
  }, [token, reloadCommunities]);
  useEffect(
    () => () => {
      clearTimeout(graphRequest.current.retry);
      clearTimeout(listRequest.current.retry);
    },
    [],
  );

  // a settings dialog is for the community it was opened in
  // biome-ignore lint/correctness/useExhaustiveDependencies: cid triggers it
  useEffect(() => {
    setDialog((d) => (d?.kind === "settings" ? undefined : d));
  }, [cid]);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const setSession = useCallback((s: Session | undefined) => {
    const next = s && sessionOf(s);
    const before = current.current.session;
    if (before?.user.id !== next?.user.id) {
      // nothing loaded for one account is shown to the next, nor is its
      // private community the next one's home
      forgetMemories();
      if (lastPrivate.current || storedPrivate()) forgetLast();
      if (before) {
        dropCacheUnder(graphKey(before.user.id, ""));
        dropCache(communitiesKey(before.user.id));
      }
    }
    saveSession(next);
    setSessionState(next);
  }, [forgetLast]);

  // a token the server stops accepting (it expired, or the server's data was
  // reset), whichever request finds out
  useEffect(() => {
    whenSessionRejected((rejected) => {
      if (current.current.session?.token !== rejected) return;
      setSession(undefined);
      notify("Your session has expired. Sign in again to carry on.");
    });
    return () => whenSessionRejected(undefined);
  }, [setSession, notify]);

  // checks the stored session, and picks up a rename made on another device
  const checkSession = useCallback(() => {
    const s = current.current.session;
    if (!s) return;
    fetchMe(s.token).then(
      (user) => {
        const now = current.current.session;
        if (now?.token === s.token && now.user.name !== user.name) setSession({ ...now, user });
      },
      () => {},
    );
  }, [setSession]);
  useEffect(() => {
    if (token) checkSession();
  }, [token, checkSession]);

  useEffect(() => {
    // the backend sends "update:<community>" (or the graph's updateKey) after
    // every change there, and "update" after changes that may touch any
    // community
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let opened = false;
    // a burst of updates (a rename touches every community) is one reload
    let flush: ReturnType<typeof setTimeout> | undefined;
    let wantGraph = false;
    const later = (graph: boolean) => {
      wantGraph ||= graph;
      flush ??= setTimeout(() => {
        flush = undefined;
        if (wantGraph) reloadGraph();
        reloadCommunities();
        wantGraph = false;
      }, 150);
    };
    const connect = () => {
      retry = undefined;
      socket = new WebSocket(wsUrl);
      socket.onopen = () => {
        attempt = 0;
        // catch up on what changed while disconnected (the first time, the
        // page has just loaded it, unless that failed)
        if (opened || current.current.failing) later(true);
        opened = true;
      };
      socket.onmessage = (event) => {
        const message = String(event.data);
        if (!message.startsWith("update")) return;
        const { cid, updateKey } = current.current;
        later(
          message === "update" ||
            message === `update:${cid}` ||
            (updateKey !== undefined && message === `update:${updateKey}`),
        );
      };
      socket.onclose = () => {
        // 1 s, 2 s, 4 s, ... up to 30 s, spread so clients don't all return at once
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt++) * (0.75 + Math.random() / 2));
      };
    };
    // back on the tab (a phone wakes up): reconnect now, or catch up
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      checkSession();
      if (retry) {
        clearTimeout(retry);
        attempt = 0;
        connect();
      } else later(true);
    };
    connect();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(retry);
      clearTimeout(flush);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [reloadGraph, reloadCommunities, checkSession]);

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

  // the last community, unless the viewer can't see it now (they left it, or
  // it went private)
  const lastSeeable = communitiesFresh && !listed.list.some((c) => c.id === lastCid) ? DEFAULT_COMMUNITY : lastCid;

  const viewerId = session?.user.id ?? previewId;
  // (person() skips the sentinel above the root, e.g. ?as=0x…01)
  const viewer = graph ? person(graph, viewerId) : undefined;

  // the tab title names the community
  const communityName = cid ? graph?.community.name : undefined;
  useEffect(() => {
    document.title = communityName ? `${communityName} · Anthill` : "Anthill";
  }, [communityName]);

  // what Start a community asked for, once signed in (after the recovery code)
  const resume = () => {
    if (afterAuth) setDialog({ kind: afterAuth });
    setAfterAuth(undefined);
  };

  return (
    <Ctx.Provider
      value={{
        cid,
        homeCid: cid && !notFound ? cid : lastSeeable,
        communities,
        communitiesFresh,
        communitiesError,
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
        openAuth: (mode = "signin") => {
          setAfterAuth(undefined);
          setAuth(mode);
        },
        showRecoveryCode: setRecoveryCode,
        tourRequested,
        startTour: () => setTourRequested((n) => n + 1),
        createCommunity: () => {
          if (session) return setDialog({ kind: "create" });
          setAfterAuth("create");
          setAuth("create");
        },
        editCommunity: () => graph && setDialog({ kind: "settings", community: graph.community }),
      }}
    >
      {props.children}
      {dialog?.kind === "create" && session && <CreateCommunityModal onClose={() => setDialog(undefined)} />}
      {dialog?.kind === "settings" && session && (
        <CommunitySettingsModal
          key={dialog.community.id}
          community={dialog.community}
          onClose={() => setDialog(undefined)}
        />
      )}
      {auth && (
        <AuthModal
          mode={auth}
          intro={afterAuth === "create" ? "First your account, then your community." : undefined}
          onClose={() => {
            setAuth(undefined);
            setAfterAuth(undefined);
          }}
          onSession={(s, code) => {
            setSession(s);
            setPreviewAs(undefined);
            setAuth(undefined);
            if (code) setRecoveryCode(code);
            else resume();
          }}
        />
      )}
      {recoveryCode && (
        <RecoveryCodeModal
          code={recoveryCode}
          onDone={() => {
            setRecoveryCode(undefined);
            resume();
          }}
        />
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
