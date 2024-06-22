import React, { useState } from "react";
import * as client from "react-dom/client";
import { Routes, Route, BrowserRouter, useNavigate } from "react-router-dom";
import useWebSocket from "react-use-websocket";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { zkSyncSepoliaTestnet, zkSyncLocalNode } from "wagmi/chains";
import { WagmiProvider } from "wagmi";
import { useAccount, useSwitchChain, useDisconnect } from "wagmi";

// import { walletConnect } from "wagmi/connectors";

import { useWeb3Modal, createWeb3Modal } from "@web3modal/wagmi/react";
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";

// import { defaultWagmiConfig } from '@web3modal/wagmi/react/config'
// import { customElement } from '@web3modal/ui/dist/esm/index.js';

// import { Web3Button } from '@web3modal/wagmi'

// import { EthereumClient } from '@web3modal/ethereum'
// import { useConnect } from 'wagmi'
// import { injected } from 'wagmi/connectors'
// import { walletConnect } from 'wagmi/connectors'
// import { http } from "viem";

import { AbiItem } from "web3-utils";

import { Graph } from "./Graph/GraphMain";
import "./main.css";
import AnthillJson from "./ExternalConnections/Anthill.json";
import TutorialPopup, {
  TutorialButton,
  TreeOrRepModeSwitch,
} from "./Buttons/MainAppButtons";
import {
  getIsNodeInGraph,
  getRandomLeaf,
} from "./ExternalConnections/BackendGetters";

// const connector = walletConnect({
//     projectId: projectId,
//   })

const doc = document.getElementById("root");
const root = client.createRoot(doc!);

const testing = false;
console.log("Version 2");

const queryClient = new QueryClient();
const projectId = "a768398be97a29d62abe51d94ac7735a";

// const chainsA = testing ? [zkSyncLocalNode] : [zkSyncSepoliaTestnet];
// let provider: any;

const metadata = {
  name: "Anthill DAO",
  description: "Anthill is a liquid reputation system",
  url: "https://anthilldao.dev", // origin must match your domain & subdomain
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

const chains = [zkSyncLocalNode, zkSyncSepoliaTestnet] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

createWeb3Modal({ wagmiConfig: wagmiConfig, projectId });

const Web3Button = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useWeb3Modal();

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
  anthillContractAddress = "0xe42923350EF3a534f84bb101453D9B442d42Bf0c"; // zksyncTesnet sepolia
  //   anthillContractAddress = "0x69649a6E7E9c090a742f0671C64f4c7c31a1e4ce"; //mumbai v4
  // anthillContractAddress = "0xb2218969ECF92a3085B8345665d65FCdFED9F981"; // mumbai v3
  // const anthillContractAddress = "0x7b7D7Ea1c6aBA7aa7de1DC8595A9e839B0ee58FB"; // mumbai v2
  // const anthillContractAddress =  "0xE2C8d9C92eAb868C6078C778f12f794858147947"; //mumbai v1
  chainId = 300; //mumbai testnet

//   backendUrl = "http://localhost:5001/";
//   wsUrl = "ws://127.0.0.1:5001";

    backendUrl = "https://anthill-db.herokuapp.com/";
    wsUrl = "wss://anthill-db.herokuapp.com/";
} else {
  anthillContractAddress = "0x111C3E89Ce80e62EE88318C2804920D4c96f92bb"; // forge with lib
  // chainId =1337; //anvil
  chainId = 270; // zksync dockerized node
  backendUrl = "http://localhost:5001/";
  wsUrl = "ws://127.0.0.1:5001";
}

const App = () => {
  const navigate = useNavigate();

  useWebSocket(wsUrl, {
    onOpen: () => {
      console.log("WebSocket connection established.");
    },
  });

  //   const { connect } = useConnect()

  //  connect({ connector: injected() })

  let AnthillContract: any;
  AnthillContract = {
    address: anthillContractAddress,
    abi: AnthillJson.abi as AbiItem[],
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
      {/* <p>
                <div style = {{fontSize:"20px", textAlign:"center"}}>🐜</div>
            </p> */}

      <div className="header__left">
        <TreeOrRepModeSwitch
          treeMode={props.treeMode}
          setTreeMode={props.setTreeMode}
        />
      </div>
      <div className="header__right">
        <Web3Button />
        &nbsp; &nbsp;
        <TutorialButton
          showTutorial={props.showTutorial}
          setShowTutorial={props.setShowTutorial}
        />
        &nbsp; &nbsp;
      </div>
    </header>
  );
}

// function Footer() {
//   return (
//     <footer>
//       &nbsp; &nbsp;&nbsp;&nbsp;
//       <a href="https://faucet.chainstack.com/zksync-testnet-faucet">
//         Get test tokens{" "}
//       </a>
//       &nbsp; &nbsp;&nbsp;&nbsp;
//       <a href="https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580">
//         Medium post{" "}
//       </a>
//       &nbsp; &nbsp;&nbsp;&nbsp;
//       <a
//         href={
//           "https://sepolia.explorer.zksync.io/address/" + anthillContractAddress
//         }
//       >
//         Blockexplorer
//       </a>
//       &nbsp; &nbsp;&nbsp;&nbsp;
//       <a href="https://github.com/kelemeno/anthill">Github</a>
//       &nbsp; &nbsp;&nbsp;&nbsp;
//       <a href="https://demo.snapshot.org/#/anthilldao.eth">Voting page</a>
//     </footer>
//   );
// }

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider
          config={wagmiConfig}
          // reconnectOnMount={true}
        >
          <App />
          {/* <Footer /> */}
        </WagmiProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
