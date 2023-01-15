import React, {useState}  from 'react';
import * as client from 'react-dom/client';

import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils'


import {AppInner} from './App';
import './index.css';
import {NodeDataRendering} from "./LoadGraph";
// import AnthillJson from "./Anthill.json"


const doc = document.getElementById('root')
const root = client.createRoot(doc!);





const  App = () => {
    var [accounts, setAccounts] =  useState("0x0000000000000000000000000000000000000000");
    var [provider, setProvider] = useState<any>(null);
    var [isAccountInGraph, setIsAccountInGraph] = useState(false);
    var [clickedNode, setClickedNode]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0,"onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

    async function getAccount(props:{setAccounts: any}) {
        var acc = await (provider.request({ method: 'eth_requestAccounts' }));
        props.setAccounts(acc[0])
    }
    
    
    function EthereumButton(props:{setAccounts: any}) {
        detectEthereumProvider().then((res)=>{setProvider(res)});
        if (provider){
            if (accounts != "0x0000000000000000000000000000000000000000") {
                return <div></div>
            }
            return <button onClick={() => getAccount({"setAccounts": props.setAccounts})}>Connect Wallet</button>

        }
        return <div><a href="https://metamask.io/download/">Install Metamask</a></div>
    }

    return (
        <>
            <EthereumButton setAccounts={setAccounts} />
            <EthereumButton setAccounts={setAccounts} />

            <AppInner account={accounts} chainId={1337} clickedNode = {clickedNode} setClickedNode = {setClickedNode} isAccountInGraph={isAccountInGraph} setIsAccountInGraph={setIsAccountInGraph} />
        </>
    )
}

root.render(

    <React.StrictMode>
        <App/>
    </React.StrictMode>
);
