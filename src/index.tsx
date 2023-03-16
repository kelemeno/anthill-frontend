import React, {useState}  from 'react';
import * as client from 'react-dom/client';
import { Routes, Route,  BrowserRouter, useNavigate } from 'react-router-dom';
// import useWebSocket from 'react-use-websocket';




// import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils'
// there was some problem with the web3 alternative, so we use ethers


import {Graph} from './Graph/GraphMain';
import './index.css';
import AnthillJson from "./ExternalConnections/Anthill.json"
import { ConnectMetamaskButton} from "./Buttons/MainAppButtons"
import {getIsNodeInGraph, getRandomLeaf} from "./ExternalConnections/BackendGetters"



const doc = document.getElementById('root')
const root = client.createRoot(doc!);

const  App = () => {
    const testing = false;
    
    var anthillContractAddress;
    var chainId;
    var web3; 
    var backendUrl ="";
    var wsUrl;

    var navigate = useNavigate();

    if (!testing) {
        anthillContractAddress = "0xb2218969ECF92a3085B8345665d65FCdFED9F981"; // mumbai v3
        // const anthillContractAddress = "0x7b7D7Ea1c6aBA7aa7de1DC8595A9e839B0ee58FB"; // mumbai v2
        // const anthillContractAddress =  "0xE2C8d9C92eAb868C6078C778f12f794858147947"; //mumbai v1
        chainId = 80001; //mumbai testnet
        web3 = new Web3(Web3.givenProvider || "https://polygon-mumbai.infura.io/v3/4458cf4d1689497b9a38b1d6bbf05e78");

        backendUrl = "https://anthill-/db.herokuapp.com/"
        wsUrl = 'wss://anthill-/db.herokuapp.com'; // this might be wrong
    
    } else {
        anthillContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512" // forge with lib
        chainId =1337; //anvil
        web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
        backendUrl = "http://localhost:5000/"
        wsUrl = 'ws://127.0.0.1:8000'; //this hopefully works 
    }

    

    var AnthillContract: any; 
    AnthillContract = new web3.eth.Contract(AnthillJson.abi  as AbiItem[], anthillContractAddress);
    
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
    var [account, setAccount] =  useState("0x0000000000000000000000000000000000000000");
    var [provider, setProvider] = useState<any>(null);
    var [isAccountInGraph, setIsAccountInGraph] = useState(false);
    
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
       
        
      }, [backendUrl, clickedNode, isClickedNodeInGraph, navigate]);        
      
    // var [clickedNodeId, setClickedNodeId]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);
    

    return (
        
                <Routes>
                <Route path="/" element={
                        <>
                        
                        
                        <div style={{textAlign:"right"}}>
                            <><a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <><a  href= "https://faucet.polygon.technology/"> Get test tokens </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= {"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= "https://github.com/kelemeno/anthill"> Link to github </a></>
                        </div>

                        <div style={{textAlign:"left", margin : 15}}>
                            <ConnectMetamaskButton provider={provider} setProvider={setProvider} account = {account} setAccounts={setAccount} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl} />
                            {/* <GoHomeButton account={account} isAccountInGraph={isAccountInGraph} setClickedNode= {setClickedNode}/> */}
                            {/* <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} account={account} isAccountInGraph= {isAccountInGraph} setClickedNode={setClickedNode} backendUrl={backendUrl}/> */}
                        </div>

                        <Graph account={account} chainId={chainId} clickedNode = {clickedNode}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNode={setClickedNode} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                    <Route path="/:id" element={
                        <>
                        

                        <div style={{textAlign:"right"}}>
                            <a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <a  href= "https://faucet.polygon.technology/"> Get test tokens </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href={"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://github.com/kelemeno/anthill"> Link to github </a>
                        </div>

                        <div style={{textAlign:"left"}}>
                            <ConnectMetamaskButton provider={provider} setProvider={setProvider} account = {account} setAccounts={setAccount} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl}/>
                            {/* <GoHomeButton account={account} isAccountInGraph={isAccountInGraph} setClickedNode= {setClickedNode}/> */}
                            {/* <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} account={account} isAccountInGraph= {isAccountInGraph} setClickedNode= {setClickedNode} backendUrl={backendUrl}/> */}
                        </div>

                        <Graph account={account} chainId={chainId} clickedNode = {clickedNode}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNode={setClickedNode} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                </Routes>
        
    )
}

root.render(

    <React.StrictMode>
        <BrowserRouter>
            <App/>
        </BrowserRouter>
    </React.StrictMode>
);
