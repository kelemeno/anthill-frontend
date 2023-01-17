import React, {useState}  from 'react';
import * as client from 'react-dom/client';
import { Routes, Route, useParams, BrowserRouter, useNavigate } from 'react-router-dom';


import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils'
// there was some problem with the web3 alternative, so we use ethers


import {AppInner} from './App';
import './index.css';
import AnthillJson from "./Anthill.json"
import {JoinTreeRandomlyButton, ConnectMetamaskButton, GoHomeButton} from "./Buttons"
import { getRootNodeId } from './LoadGraph';


const doc = document.getElementById('root')
const root = client.createRoot(doc!);

const  App = () => {

    const antHillContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    const chainId = 1337;
    var AnthillContract: any; 
    const web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
    AnthillContract = new web3.eth.Contract(AnthillJson.abi  as AbiItem[], antHillContractAddress);
    
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
    // var [clickedNodeId, setClickedNodeId]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0,"onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

    return (
        
            <BrowserRouter>
                <Routes>
                <Route path="/" element={
                        <>
                        <div style={{textAlign:"left", margin : 10}}>
                            <ConnectMetamaskButton provider={provider} setProvider={setProvider} accounts = {accounts} setAccounts={setAccounts} setIsAccountInGraph={setIsAccountInGraph} />
                            <GoHomeButton accounts={accounts} isAccountInGraph={isAccountInGraph} setClickedNodeId= {setClickedNodeId}/>
                            <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} accounts={accounts} isAccountInGraph= {isAccountInGraph} setClickedNodeId={setClickedNodeId}/>
                        </div>
                        <div style={{textAlign:"right"}}>
                            <><a  href= "https://github.com/kelemeno/anthill"> Link to github </a></>
                            <><a href= "https://faucet.polygon.technology/"> Get test tokens </a></>
                        </div>
                        
                        <AppInner account={accounts} chainId={chainId} clickedNodeId = {clickedNodeId}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNodeId={setClickedNodeId}/>
                        </>
                    }/>
                    <Route path="/:id" element={
                        <>
                        <div style={{textAlign:"left"}}>
                        <ConnectMetamaskButton provider={provider} setProvider={setProvider} accounts = {accounts} setAccounts={setAccounts} setIsAccountInGraph={setIsAccountInGraph} />
                        <GoHomeButton accounts={accounts} isAccountInGraph={isAccountInGraph} setClickedNodeId= {setClickedNodeId}/>
                        <JoinTreeRandomlyButton AnthillContract= {AnthillContract} chainId={chainId} accounts={accounts} isAccountInGraph= {isAccountInGraph} setClickedNodeId= {setClickedNodeId}/>

                        </div>

                        <div style={{textAlign:"right"}}>
                            <><a href= "https://github.com/kelemeno/anthill"> Link to github </a></>
                         <><a href= "https://faucet.polygon.technology/"> Get test tokens </a></>
                        </div>
                        <AppInner account={accounts} chainId={chainId} clickedNodeId = {clickedNodeId}  isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} AnthillContract={AnthillContract} setClickedNodeId={setClickedNodeId}/>
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
