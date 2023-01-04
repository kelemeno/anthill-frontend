import React from 'react';
import * as client from 'react-dom/client';

import detectEthereumProvider from '@metamask/detect-provider';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils'


import {AppInner} from './App';
import './index.css';
import AnthillJson from "./Anthill.json"


const doc = document.getElementById('root')
const root = client.createRoot(doc!);

var address = "0x0000000000000000000000000000000000000000";

async function getAccount() {
    const accounts= provider.request({ method: 'eth_requestAccounts' });
}

var provider: any;

function EthereumButton() {
    detectEthereumProvider().then((res)=>{provider = res});
    if (provider){
        const accounts= provider.request({ method: 'eth_requestAccounts' });
        console.log(accounts)
        if (accounts) {
            return <div></div>
        }
    }
    return <button onClick={() => getAccount()}>Connect Wallet</button>
}


root.render(
    
    <React.StrictMode>
        <EthereumButton />
        <AppInner/>
    </React.StrictMode>
);
