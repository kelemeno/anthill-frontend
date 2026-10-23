import React, { useMemo, useState } from "react";
import * as client from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import useWebSocketDefault from "react-use-websocket";

// react-use-websocket ships CommonJS; under Vite's ESM interop the default import
// can resolve to the module namespace, so unwrap a nested `.default` if present.
const useWebSocket = ((useWebSocketDefault as any).default ??
  useWebSocketDefault) as typeof useWebSocketDefault;

import { AccountControls } from "./Account/AccountControls";
import { InviteLanding, inviteCodeFromUrl } from "./Account/InviteLanding";
import { GraphDemo } from "./Graph/GraphDemo";
import { Graph } from "./Graph/GraphMain";
import { IS_MOBILE } from "./isMobile";
import "./main.css";
import { TreeOrRepModeSwitch, TutorialButton } from "./Buttons/MainAppButtons";
import {
  getIsNodeInGraph,
  getRandomLeaf,
} from "./ExternalConnections/BackendGetters";
import {
  type Api,
  fetchMe,
  loadSession,
  type Session,
  saveSession,
} from "./ExternalConnections/Passkey";
import { PollsDrawer } from "./Polls/PollsDrawer";
import { Tour, type TourStep } from "./Tour/Tour";
import { tourSteps } from "./Tour/steps";
import { READ_ONLY } from "./readOnly";

const doc = document.getElementById("root");
const root = client.createRoot(doc!);

console.log("Version 2");

// The local-dev backend lives on the same machine that serves this page, so key
// its host off how the page was opened. Note passkeys only work on a secure
// origin: localhost, or https.
const localHost =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

// Production builds name their backend (VITE_BACKEND_URL / VITE_WS_URL, see
// .env.production); in local dev it runs on this machine.
const backendUrl: string =
  import.meta.env.VITE_BACKEND_URL || `http://${localHost}:5001/`;
const wsUrl: string = import.meta.env.VITE_WS_URL || `ws://${localHost}:5001`;

const TOUR_SEEN_KEY = "anthill.tourSeen";

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
  const api: Api = useMemo(() => ({ backendUrl, session }), [session]);
  const [pollsOpen, setPollsOpen] = useState(false);
  // read once: the app soon navigates to /?id=..., which drops ?invite=
  const [inviteCode] = useState(() => (READ_ONLY ? null : inviteCodeFromUrl()));

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

  // Guided tour: started from the Tutorial button, and once by itself on a
  // first visit (not when arriving from an invite link).
  const [tour, setTour] = useState<TourStep[] | null>(null);
  const startTour = React.useCallback(async () => {
    const inTree = session
      ? await getIsNodeInGraph(backendUrl, session.user.id).catch(() => false)
      : false;
    setTour(
      tourSteps({ signedIn: session !== undefined, inTree, accountId: session?.user.id }),
    );
  }, [session]);
  const endTour = React.useCallback(() => {
    setTour(null);
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {}
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on first load
  React.useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_SEEN_KEY) !== null;
    } catch {}
    if (seen || inviteCode) return;
    // wait until the tree is on screen
    const timer = setInterval(() => {
      if (document.querySelector(".react-flow__node")) {
        clearInterval(timer);
        setTimeout(startTour, 800);
      }
    }, 300);
    const giveUp = setTimeout(() => clearInterval(timer), 20_000);
    return () => {
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, []);

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
        startTour={startTour}
        session={session}
        setSession={setSession}
        viewMode={viewMode}
        setViewMode={setViewMode}
        openPolls={() => setPollsOpen(true)}
      />
      {!READ_ONLY && (
        <PollsDrawer api={api} open={pollsOpen} onClose={() => setPollsOpen(false)} />
      )}
      {inviteCode && (
        <InviteLanding
          code={inviteCode}
          backendUrl={backendUrl}
          session={session}
          setSession={setSession}
        />
      )}
      {tour && <Tour steps={tour} onClose={endTour} />}
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
  startTour: () => void;
  session: Session | undefined;
  setSession: (session: Session | undefined) => void;
  viewMode: "tree" | "votes" | "rep";
  setViewMode: any;
  openPolls: () => void;
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
        {READ_ONLY ? (
          <span className="ReadOnlyLabel">🔍 Read-only demo</span>
        ) : (
          <>
            <button type="button" className="PollsButton" onClick={props.openPolls}>
              Polls
            </button>
            <AccountControls
              backendUrl={backendUrl}
              session={props.session}
              setSession={props.setSession}
            />
          </>
        )}
        <TutorialButton
          startTour={props.startTour}
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
