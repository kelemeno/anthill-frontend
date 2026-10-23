// App-wide state: the live graph (refetched whenever the backend announces an
// update), the passkey session, and the viewer: the signed-in person, or, for
// the prototype, a member you preview the app as (?as=<id>, read-only).
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  fetchGraph,
  type Graph,
  loadSession,
  type Person,
  type Session,
  saveSession,
  wsUrl,
} from "./api";

type AppState = {
  graph: Graph | undefined;
  error: string | undefined;
  reload: () => void;
  session: Session | undefined;
  setSession: (s: Session | undefined) => void;
  // who the screens are about: you, or the member being previewed
  viewer: Person | undefined;
  previewing: boolean;
  setPreviewAs: (id: string | undefined) => void;
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
      }}
    >
      {props.children}
    </Ctx.Provider>
  );
}
