import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";
import * as client from "react-dom/client";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router-dom";
import useWebSocketDefault from "react-use-websocket";

// react-use-websocket ships CommonJS; under Vite's ESM interop the default import
// can resolve to the module namespace, so unwrap a nested `.default` if present.
const useWebSocket = ((useWebSocketDefault as any).default ??
  useWebSocketDefault) as typeof useWebSocketDefault;

import { defineChain, sepolia } from "@reown/appkit/networks";
import { createAppKit, useAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { Abi } from "viem";
import {
  useAccount,
  useDisconnect,
  useSwitchChain,
  WagmiProvider,
} from "wagmi";

import { GraphDemo } from "./Graph/GraphDemo";
import { Graph } from "./Graph/GraphMain";
import "./main.css";
import TutorialPopup, {
  TreeOrRepModeSwitch,
  TutorialButton,
} from "./Buttons/MainAppButtons";
import AnthillJson from "./ExternalConnections/Anthill.json";
import {
  getIsNodeInGraph,
  getRandomLeaf,
} from "./ExternalConnections/BackendGetters";

const doc = document.getElementById("root");
const root = client.createRoot(doc!);

const testing = true;
console.log("Version 2");

const queryClient = new QueryClient();
const projectId = "a768398be97a29d62abe51d94ac7735a";

// The local-dev backend/RPC live on the same machine that serves this page, so
// key their host off how the page was opened. Open http://<mac-LAN-IP>:5173 on
// another device on the network and the backend (:5001) and anvil RPC (:8545)
// resolve to that same machine — no hardcoded IP needed.
const localHost =
  typeof window !== "undefined" ? window.location.hostname : "localhost";

const anvilLocal = defineChain({
  id: 1337,
  caipNetworkId: "eip155:1337",
  chainNamespace: "eip155",
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [`http://${localHost}:8545`] },
  },
});

const metadata = {
  name: "Anthill DAO",
  description: "Anthill is a liquid reputation system",
  url: "https://anthilldao.dev", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

const networks = [anvilLocal, sepolia] as const;

const wagmiAdapter = new WagmiAdapter({
  networks: [...networks],
  projectId,
});

const wagmiConfig = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  networks: [...networks],
  projectId,
  metadata,
});

const Web3Button = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();

  if (isConnected) {
    return (
      <div>
        <p>Connected to {address}</p>
        <button onClick={() => disconnect()}>Disconnect</button>
      </div>
    );
  }

  return <button onClick={() => open()}>Connect Wallet</button>;
};

let anthillContractAddress: string;
let chainId: number;
let backendUrl = "";
let wsUrl: string;

if (!testing) {
  anthillContractAddress = "0x0000000000000000000000000000000000000000"; // TODO: set deployed contract address on Ethereum Sepolia
  chainId = 11155111; // Ethereum Sepolia testnet

  //   backendUrl = "http://localhost:5001/";
  //   wsUrl = "ws://127.0.0.1:5001";

  backendUrl = "https://anthill-db.herokuapp.com/";
  wsUrl = "wss://anthill-db.herokuapp.com/";
} else {
  anthillContractAddress = "0x5fbdb2315678afecb367f032d93f642f64180aa3"; // anvil (forge without lib, nonce 0)
  chainId = 1337; //anvil
  backendUrl = `http://${localHost}:5001/`;
  wsUrl = `ws://${localHost}:5001`;
}

const App = () => {
  const navigate = useNavigate();

  useWebSocket(wsUrl, {
    onOpen: () => {
      console.log("WebSocket connection established.");
    },
  });

  let AnthillContract: any;
  AnthillContract = {
    address: anthillContractAddress,
    abi: AnthillJson.abi as Abi,
  }; //signerOrProvider: signer}; //provider({chainId: chainId})});

  const queryParameters = new URLSearchParams(window.location.search);
  let id = queryParameters.get("id");

  if (id === undefined || id === null || id === "") {
    id = "Enter";
  }
  // console.log("main app2",id)

  const [clickedNode, setClickedNode] = useState("Enter");
  const [isClickedNodeInGraph, setIsClickedNodeInGraph] = useState(false);

  const [treeMode, setTreeMode] = useState(true);

  // console.log("rendering main app, clickedNode: ", clickedNode)
  // var [account, setAccount] =  useState(address);
  const { address: account } = useAccount();

  const { switchChain } = useSwitchChain();

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

  return (
    <Routes>
      <Route
        path="/"
        element={
          <>
            <Header
              showTutorial={showTutorial}
              setShowTutorial={setShowTutorial}
              setChain={switchChain}
              treeMode={treeMode}
              setTreeMode={setTreeMode}
            />

            <TutorialPopup
              showTutorial={showTutorial}
              setShowTutorial={setShowTutorial}
            />
            <Graph
              account={account as string}
              chainId={chainId}
              clickedNode={clickedNode}
              treeMode={treeMode}
              AnthillContract={AnthillContract}
              setClickedNode={setClickedNode}
              backendUrl={backendUrl}
              wsUrl={wsUrl}
            />
          </>
        }
      />
      <Route
        path="/:id"
        element={
          <>
            <Header
              showTutorial={showTutorial}
              setShowTutorial={setShowTutorial}
              setChain={switchChain}
              treeMode={treeMode}
              setTreeMode={setTreeMode}
            />

            <TutorialPopup
              showTutorial={showTutorial}
              setShowTutorial={setShowTutorial}
            />
            <Graph
              account={account as string}
              chainId={chainId}
              clickedNode={clickedNode}
              treeMode={treeMode}
              AnthillContract={AnthillContract}
              setClickedNode={setClickedNode}
              backendUrl={backendUrl}
              wsUrl={wsUrl}
            />
          </>
        }
      />
    </Routes>
  );
};

function Header(props: {
  showTutorial: boolean;
  setShowTutorial: any;
  setChain: any;
  treeMode: boolean;
  setTreeMode: any;
}) {
  return (
    <header>
      <div className="header__left">
        <span className="brand">🐜 Anthill</span>
        <TreeOrRepModeSwitch
          treeMode={props.treeMode}
          setTreeMode={props.setTreeMode}
        />
      </div>
      <div className="header__right">
        <Web3Button />
        <TutorialButton
          showTutorial={props.showTutorial}
          setShowTutorial={props.setShowTutorial}
        />
      </div>
    </header>
  );
}

// /demo renders a synthetic large graph for stress-testing the renderer,
// bypassing the wallet/backend app flow. (History is integrated into the main
// graph view as a bottom scrubber.)
const isDemo = window.location.pathname.startsWith("/demo");

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {isDemo ? <GraphDemo /> : <App />}
        </WagmiProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
