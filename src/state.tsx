// App-wide state: the live graph (refetched whenever the backend announces an
// update), the passkey session, and the viewer: the signed-in person, or a
// member you preview the app as (?as=<id>, read-only). Also the things any
// screen can open: the sign-in dialog, the recovery code, toasts, the tour.
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";

import { fetchGraph, fetchMe, type Graph, loadSession, type Person, type Session, saveSession, wsUrl } from "./api";
import { AuthModal, type AuthMode } from "./components/AuthModal";
import { RecoveryCodeModal } from "./ui";

type AppState = {
  graph: Graph | undefined;
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
};

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}

export function AppProvider(props: { children: ReactNode }) {
  const [graph, setGraph] = useState<Graph>();
  const [error, setError] = useState<string>();
  const [session, setSessionState] = useState(loadSession);
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string>();
  const [auth, setAuth] = useState<AuthMode>();
  const [recoveryCode, setRecoveryCode] = useState<string>();
  const [tourRequested, setTourRequested] = useState(0);

  const reload = useCallback(() => {
    fetchGraph().then(
      (g) => {
        setGraph(g);
        setError(undefined);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  useEffect(() => {
    reload();
    // the backend sends "update" after every change
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = () => reload();
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
  }, [reload]);

  const setSession = useCallback((s: Session | undefined) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  // drop a stored session the server no longer accepts
  const token = session?.token;
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

  return (
    <Ctx.Provider
      value={{
        graph,
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
      }}
    >
      {props.children}
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
