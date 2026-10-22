import React, { useState } from "react";
import * as client from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import useWebSocketDefault from "react-use-websocket";

// react-use-websocket ships CommonJS; under Vite's ESM interop the default import
// can resolve to the module namespace, so unwrap a nested `.default` if present.
const useWebSocket = ((useWebSocketDefault as any).default ??
  useWebSocketDefault) as typeof useWebSocketDefault;

import { GraphDemo } from "./Graph/GraphDemo";
import { Graph } from "./Graph/GraphMain";
import { IS_MOBILE } from "./isMobile";
import "./main.css";
import TutorialPopup, {
  TreeOrRepModeSwitch,
  TutorialButton,
} from "./Buttons/MainAppButtons";
import {
  getIsNodeInGraph,
  getRandomLeaf,
} from "./ExternalConnections/BackendGetters";
import {
  type Api,
  createPasskey,
  fetchMe,
  loadSession,
  type Session,
  saveSession,
  signInWithPasskey,
} from "./ExternalConnections/Passkey";
import { READ_ONLY } from "./readOnly";

const doc = document.getElementById("root");
const root = client.createRoot(doc!);

console.log("Version 2");

// The local-dev backend lives on the same machine that serves this page, so key
// its host off how the page was opened. Note passkeys only work on a secure
// origin: localhost, or https.
const localHost =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

// Sign in / create a passkey. Replaces the wallet connect button.
const PasskeyButton = (props: {
  backendUrl: string;
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
}) => {
  const [busy, setBusy] = useState(false);

  // Read-only showcase: no sign-in, just a label.
  if (READ_ONLY) {
    return (
      <span
        style={{
          fontSize: 13,
          color: "#64748b",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          padding: "6px 10px",
          whiteSpace: "nowrap",
        }}
      >
        🔍 Read-only demo
      </span>
    );
  }

  const run = (signIn: () => Promise<Session>) => async () => {
    setBusy(true);
    try {
      props.setSession(await signIn());
    } catch (error) {
      // Cancelling the browser's passkey sheet is not worth an alert.
      if ((error as Error).name !== "NotAllowedError") {
        alert((error as Error).message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (props.session !== undefined) {
    return (
      <div>
        <span style={{ marginRight: 8 }}>{props.session.user.name}</span>
        <button onClick={() => props.setSession(undefined)}>Sign out</button>
      </div>
    );
  }

  const create = run(async () => {
    const name = prompt("Your name in the tree")?.trim();
    if (!name) {
      throw Object.assign(new Error("cancelled"), { name: "NotAllowedError" });
    }
    return createPasskey(props.backendUrl, name);
  });

  return (
    <div>
      <button
        disabled={busy}
        onClick={run(() => signInWithPasskey(props.backendUrl))}
      >
        Sign in with passkey
      </button>{" "}
      <button disabled={busy} onClick={create}>
        Create passkey
      </button>
    </div>
  );
};

// Production builds name their backend (VITE_BACKEND_URL / VITE_WS_URL, see
// .env.production); in local dev it runs on this machine.
const backendUrl: string =
  import.meta.env.VITE_BACKEND_URL || `http://${localHost}:5001/`;
const wsUrl: string = import.meta.env.VITE_WS_URL || `ws://${localHost}:5001`;

const App = () => {
  const navigate = useNavigate();

  useWebSocket(wsUrl, {
    onOpen: () => {
      console.log("WebSocket connection established.");
    },
  });

  const [session, setSessionState] = useState(loadSession);
  const setSession = (next: Session | undefined) => {
    saveSession(next);
    setSessionState(next);
  };
  const api: Api = { backendUrl, session };

  // Drop a stored session the backend no longer accepts (expired, or the
  // backend's data was reset).
  const storedToken = session?.token;
  React.useEffect(() => {
    if (storedToken === undefined) return;
    fetchMe(backendUrl, storedToken).catch(() => {
      saveSession(undefined);
      setSessionState(undefined);
    });
  }, [storedToken]);

  const queryParameters = new URLSearchParams(window.location.search);
  let id = queryParameters.get("id");

  if (id === undefined || id === null || id === "") {
    id = "Enter";
  }
  // console.log("main app2",id)

  const [clickedNode, setClickedNode] = useState("Enter");
  const [isClickedNodeInGraph, setIsClickedNodeInGraph] = useState(false);

  // Three views, all on the same (unchanging) tree layout — viewMode only
  // toggles which dag-vote overlay the focused node shows:
  //   "tree"  → no votes
  //   "votes" → outgoing votes (green, up)
  //   "rep"   → incoming votes (blue, down), no outgoing
  const [viewMode, setViewMode] = useState<"tree" | "votes" | "rep">("tree");

  // console.log("rendering main app, clickedNode: ", clickedNode)
  // The signed-in user's id stands in for the old wallet address.
  const account = session?.user.id;

  // var [provider, setProvider] = useState<any>(null);

  const [showTutorial, setShowTutorial] = useState(false);

  React.useEffect(() => {
    if (!isClickedNodeInGraph) {
      setIsClickedNodeInGraph(true);
      // we check that the clicked node is valid.
      // console.log("useEffect", id, clickedNode)
      if (id === "Enter" || id == null) {
        // if we are on an empty node, we get a random leaf
        getRandomLeaf(backendUrl).then((rand) => {
          navigate("/?id=" + rand);
          //   console.log("random leaf: ", rand)
          setClickedNode(rand);
        });
      } else {
        getIsNodeInGraph(backendUrl, id).then((res) => {
          // console.log("clickedNode in graph?/", clickedNode, res);
          if (!res) {
            getRandomLeaf(backendUrl).then((rand) => {
              navigate("/?id=" + rand);
              // console.log("random leaf: ", res)
              setClickedNode(rand);
            });
          } else {
            if (id) {
              setClickedNode(id);
            }
          }
        });
      }
    }
  }, [clickedNode, isClickedNodeInGraph, navigate, account, id]);

  // var [clickedNodeId, setClickedNodeId]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

  // Flex-column page: header (auto) + the graph area (fills). Same view for
  // both routes.
  const view = (
    <div className="page">
      <Header
        showTutorial={showTutorial}
        setShowTutorial={setShowTutorial}
        session={session}
        setSession={setSession}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />
      <TutorialPopup
        showTutorial={showTutorial}
        setShowTutorial={setShowTutorial}
      />
      <Graph
        account={account as string}
        clickedNode={clickedNode}
        viewMode={viewMode}
        setViewMode={setViewMode}
        api={api}
        setClickedNode={setClickedNode}
        backendUrl={backendUrl}
        wsUrl={wsUrl}
      />
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={view} />
      <Route path="/:id" element={view} />
    </Routes>
  );
};

function Header(props: {
  showTutorial: boolean;
  setShowTutorial: any;
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
  viewMode: "tree" | "votes" | "rep";
  setViewMode: any;
}) {
  return (
    <header>
      <div className="header__left">
        <span className="brand">🐜 Anthill</span>
        {/* On mobile the view toggle lives in the bottom bar (thumb zone). */}
        {!IS_MOBILE && (
          <TreeOrRepModeSwitch
            viewMode={props.viewMode}
            setViewMode={props.setViewMode}
          />
        )}
      </div>
      <div className="header__right">
        <PasskeyButton
          backendUrl={backendUrl}
          session={props.session}
          setSession={props.setSession}
        />
        <TutorialButton
          showTutorial={props.showTutorial}
          setShowTutorial={props.setShowTutorial}
        />
      </div>
    </header>
  );
}

// /demo renders a synthetic large graph for stress-testing the renderer,
// bypassing the sign-in/backend app flow. (History is integrated into the main
// graph view as a bottom scrubber.)
const isDemo = window.location.pathname.startsWith("/demo");

root.render(
  <React.StrictMode>
    <BrowserRouter>
      {isDemo ? <GraphDemo /> : <App />}
    </BrowserRouter>
  </React.StrictMode>,
);
