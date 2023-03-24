import React, {useState}  from 'react';
import * as client from 'react-dom/client';
import { Routes, Route,  BrowserRouter, useNavigate } from 'react-router-dom';
import useWebSocket from 'react-use-websocket';




// import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
// import WalletConnectProvider from '@walletconnect/web3-provider';
// import { provider as Provider } from 'web3-core/types';
import { Web3Button } from '@web3modal/react'

import { EthereumClient, w3mConnectors, w3mProvider } from '@web3modal/ethereum'
import { Web3Modal } from '@web3modal/react'
import { configureChains, createClient, WagmiConfig } from 'wagmi'
import { useAccount,  useSwitchNetwork , useContract, useSigner} from 'wagmi'
import { infuraProvider } from 'wagmi/providers/infura'
import { publicProvider } from 'wagmi/providers/public'


import {  polygonMumbai, localhost} from 'wagmi/chains'

// import Provider from "@walletconnect/web3-provider"
import { AbiItem } from 'web3-utils'
// there was some problem with the web3 alternative, so we use ethers


import {Graph} from './Graph/GraphMain';
import './index.css';
import AnthillJson from "./ExternalConnections/Anthill.json"
import TutorialPopup, {  TutorialButton} from "./Buttons/MainAppButtons"
import {getIsNodeInGraph, getRandomLeaf} from "./ExternalConnections/BackendGetters"



const doc = document.getElementById('root')
const root = client.createRoot(doc!);

const chains = [ polygonMumbai, localhost]
const projectId = 'a768398be97a29d62abe51d94ac7735a'

const { provider } = configureChains(chains, [infuraProvider({apiKey: '4458cf4d1689497b9a38b1d6bbf05e78'}), publicProvider( ) ])//[w3mProvider({ projectId })])
const wagmiClient = createClient({
  autoConnect: true,
  connectors: w3mConnectors({ projectId, version: 1, chains }),
  provider
})
const ethereumClient = new EthereumClient(wagmiClient, chains)

const  App = () => {
    const testing = false;

    var anthillContractAddress;
    var chainId;
    var backendUrl ="";
    var wsUrl;

    var navigate = useNavigate();

    if (!testing) {
        // anthillContractAddress = "0x69649a6E7E9c090a742f0671C64f4c7c31a1e4ce"; //mumbai v4
        anthillContractAddress = "0xb2218969ECF92a3085B8345665d65FCdFED9F981"; // mumbai v3
        // const anthillContractAddress = "0x7b7D7Ea1c6aBA7aa7de1DC8595A9e839B0ee58FB"; // mumbai v2
        // const anthillContractAddress =  "0xE2C8d9C92eAb868C6078C778f12f794858147947"; //mumbai v1
        chainId = 80001; //mumbai testnet
        
        // backendUrl = "http://localhost:5000/"
        // wsUrl = 'ws://127.0.0.1:5000';

        backendUrl = "https://anthill-db.herokuapp.com/"
        wsUrl = 'wss://anthill-db.herokuapp.com/'; 
    
    } else {
        anthillContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512" // forge with lib
        chainId =1337; //anvil
        backendUrl = "http://localhost:5000/"
        wsUrl = 'ws://127.0.0.1:5000';
    }

    useWebSocket(wsUrl, {
        onOpen: () => {
          console.log('WebSocket connection established.');
        },
      });

    var AnthillContract: any; 
    // AnthillContract = new web3.eth.Contract(AnthillJson.abi  as AbiItem[], anthillContractAddress);
    const {data: signer } = useSigner({chainId: chainId});
    AnthillContract = useContract({address: anthillContractAddress, abi: AnthillJson.abi  as AbiItem[], signerOrProvider: signer}); //provider({chainId: chainId})});
    // console.log("keys", Object.keys(AnthillContract))

    const queryParameters = new URLSearchParams(window.location.search)
    var id = queryParameters.get("id")

    // var {id} = useParams<{id: string}>();
    // console.log()
    // console.log("main app1",id)

    if ((id === undefined) || (id === null) || (id === "")) {
        id = "Enter"
    }
    // console.log("main app2",id)

    var [clickedNode, setClickedNode] = useState("Enter");
    var [isClickedNodeInGraph, setIsClickedNodeInGraph] = useState(false);

    // console.log("rendering main app, clickedNode: ", clickedNode)
    // var [account, setAccount] =  useState("0x0000000000000000000000000000000000000000");
    const {address } = useAccount();
    var account = (address) as string;

    const { pendingChainId,switchNetwork}= useSwitchNetwork();
    if (switchNetwork && pendingChainId !== chainId){
        switchNetwork(chainId);
    }

    // var [provider, setProvider] = useState<any>(null);
    var [isAccountInGraph, setIsAccountInGraph] = useState(false);

    var [showTutorial, setShowTutorial] = useState(false);
    
    React.useEffect(()=>{

        if (!isClickedNodeInGraph){
            setIsClickedNodeInGraph(true);
            // we check that the clicked node is valid.
            if ((clickedNode === "Enter")|| (clickedNode === undefined) || (clickedNode === null)|| (clickedNode === "")){
                // if we are on an empty node, we get a random leaf
                getRandomLeaf(backendUrl, ).then((res)=>{
                navigate("/?id="+res);
                //   console.log("random leaf: ", res)
                setClickedNode(res);
                });
            } else {
                // if we are on an incorrect node, we get a random leaf
                getIsNodeInGraph(backendUrl, clickedNode).then(
                (res)=> {
                    // console.log("clickedNode in graph?", clickedNode, res);
                    if (!res){ getRandomLeaf(backendUrl ).then(
                    (res2) => {
                        navigate("/?id="+res2);
                        // console.log("random leaf: ", res)
                        setClickedNode(res2);
                    } 
                    )}
                }
                )
            } 
        }
       
        if (account === undefined) {
            // isAccountInGraph = false;
          } else {
            getIsNodeInGraph(backendUrl, account).then((res)=> {if (res) {setIsAccountInGraph(res)}});
            console.log("isAccountInGraph", isAccountInGraph, account)
          }
         
        
      }, [backendUrl, clickedNode, isClickedNodeInGraph, navigate, account, isAccountInGraph]);        
      
    // var [clickedNodeId, setClickedNodeId]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);
    

    return (
        
                <Routes>
                <Route path="/" element={
                        <>
                        
                        
                        <div style={{textAlign:"right", margin : 15}}>
                            <Web3Button />
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <TutorialButton showTutorial= {showTutorial} setShowTutorial={setShowTutorial}/>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <><a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <><a  href= "https://faucet.polygon.technology/"> Get test tokens </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= {"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= "https://github.com/kelemeno/anthill"> Link to github </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://demo.snapshot.org/#/anthilldao.eth"> Link to voting page </a>
                        </div>

                        <div style={{textAlign:"left", margin : 15}}>
                            {/* <ConnectMetamaskButton provider={provider} setProvider={setProvider} account = {account} setAccounts={setAccount} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl} /> */}
                            {/* <GoHomeButton account={account} isAccountInGraph={isAccountInGraph} setClickedNode= {setClickedNode}/> */}
                            {/* <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} account={account} isAccountInGraph= {isAccountInGraph} setClickedNode={setClickedNode} backendUrl={backendUrl}/> */}
                        </div>
                        <TutorialPopup showTutorial= {showTutorial} setShowTutorial= {setShowTutorial}/>
                        <Graph account={account} chainId={chainId} clickedNode = {clickedNode}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNode={setClickedNode} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                    <Route path="/:id" element={
                        <>
                        

                        <div style={{textAlign:"right", margin : 15}}>
                            <Web3Button />
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <TutorialButton showTutorial= {showTutorial} setShowTutorial={setShowTutorial}/>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <a  href= "https://faucet.polygon.technology/"> Get test tokens </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href={"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://github.com/kelemeno/anthill"> Link to github </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://demo.snapshot.org/#/anthilldao.eth"> Link to voting page </a>
                        </div>

                        <div style={{textAlign:"left", margin : 15}}>
                            {/* <ConnectMetamaskButton provider={provider} setProvider={setProvider} account = {account} setAccounts={setAccount} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl}/> */}
                            {/* <GoHomeButton account={account} isAccountInGraph={isAccountInGraph} setClickedNode= {setClickedNode}/> */}
                            {/* <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} account={account} isAccountInGraph= {isAccountInGraph} setClickedNode= {setClickedNode} backendUrl={backendUrl}/> */}
                        </div>
                        <TutorialPopup showTutorial= {showTutorial} setShowTutorial= {setShowTutorial}/>
                        <Graph account={account} chainId={chainId} clickedNode = {clickedNode}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNode={setClickedNode} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                </Routes>
        
    )
}

root.render(

    <React.StrictMode>
        <BrowserRouter>
            <WagmiConfig client={wagmiClient}>
                <App/>
            </WagmiConfig>
            <Web3Modal projectId={projectId} ethereumClient={ethereumClient} />
        </BrowserRouter>
    </React.StrictMode>
);
