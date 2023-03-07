import React, {useState}  from 'react';
import * as client from 'react-dom/client';
import { Routes, Route, useParams, BrowserRouter, useNavigate } from 'react-router-dom';
// import useWebSocket from 'react-use-websocket';



import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils'
// there was some problem with the web3 alternative, so we use ethers


import {Graph} from './Graph';
import './index.css';
import AnthillJson from "./Anthill.json"
import {JoinTreeRandomlyButton, ConnectMetamaskButton, GoHomeButton} from "./Buttons"
import { getRootNodeId } from './LoadGraph';


const doc = document.getElementById('root')
const root = client.createRoot(doc!);

const  App = () => {
    const testing = true;
    
    var anthillContractAddress;
    var chainId;
    var web3; 
    var backendUrl;
    var wsUrl;

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

    if (id == undefined) {
        id = "Enter"
    }
    // console.log("main app2",id)

    var [clickedNodeId, setClickedNodeId] = useState(id);
    var [accounts, setAccounts] =  useState("0x0000000000000000000000000000000000000000");
    var [provider, setProvider] = useState<any>(null);
    var [isAccountInGraph, setIsAccountInGraph] = useState(false);
    // var [clickedNodeId, setClickedNodeId]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

    return (
        
            <BrowserRouter>
                <Routes>
                <Route path="/" element={
                        <>
                        <div style={{textAlign:"left", margin : 15}}>
                            <ConnectMetamaskButton provider={provider} setProvider={setProvider} accounts = {accounts} setAccounts={setAccounts} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl} />
                            <GoHomeButton accounts={accounts} isAccountInGraph={isAccountInGraph} setClickedNodeId= {setClickedNodeId}/>
                            <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} accounts={accounts} isAccountInGraph= {isAccountInGraph} setClickedNodeId={setClickedNodeId} backendUrl={backendUrl}/>
                        
                        <div style={{textAlign:"right"}}>
                            <><a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <><a  href= "https://faucet.polygon.technology/"> Get test tokens </a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= {"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a></>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <><a  href= "https://github.com/kelemeno/anthill"> Link to github </a></>
                        </div>
                        </div>
                        <Graph account={accounts} chainId={chainId} clickedNodeId = {clickedNodeId}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNodeId={setClickedNodeId} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                    <Route path="/:id" element={
                        <>
                        <div style={{textAlign:"left"}}>
                        <ConnectMetamaskButton provider={provider} setProvider={setProvider} accounts = {accounts} setAccounts={setAccounts} setIsAccountInGraph={setIsAccountInGraph} backendUrl={backendUrl}/>
                        <GoHomeButton accounts={accounts} isAccountInGraph={isAccountInGraph} setClickedNodeId= {setClickedNodeId}/>
                        <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} accounts={accounts} isAccountInGraph= {isAccountInGraph} setClickedNodeId= {setClickedNodeId} backendUrl={backendUrl}/>

                        </div>

                        <div style={{textAlign:"right"}}>
                            <a  href= "https://medium.com/@kalman_94947/anthill-a-liquid-reputation-system-ebd69a98e580"> Link to medium post </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;
                            <a  href= "https://faucet.polygon.technology/"> Get test tokens </a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href={"https://mumbai.polygonscan.com/address/"+anthillContractAddress}> Link to Blockexplorer</a>
                            &nbsp; &nbsp;&nbsp;&nbsp;

                            <a  href= "https://github.com/kelemeno/anthill"> Link to github </a>
                        </div>
                        <Graph account={accounts} chainId={chainId} clickedNodeId = {clickedNodeId}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNodeId={setClickedNodeId} backendUrl={backendUrl} wsUrl={wsUrl}/>
                        </>
                    }/>
                </Routes>
            </BrowserRouter>
        
    )
}

root.render(

    <React.StrictMode>
        <App/>
    </React.StrictMode>
);
