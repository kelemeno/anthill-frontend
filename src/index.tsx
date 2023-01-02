// import * as React from 'react';
import React from 'react';
import {  QueryClientProvider, QueryClient } from '@tanstack/react-query'


import * as client from 'react-dom/client';
import {AppInner} from './App';
import { WagmiConfig, createClient } from 'wagmi'
import { getDefaultProvider } from 'ethers'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { InjectedConnector } from 'wagmi/connectors/injected'

import './index.css';

const doc = document.getElementById('root')
const root = client.createRoot(doc!);

const client2 = createClient({
    autoConnect: true,
    provider: getDefaultProvider(),
  })

root.render(
    <React.StrictMode>
        <WagmiConfig client={client2}>
        <Profile />
        <AppInner/>


        </WagmiConfig>


    </React.StrictMode>
);

function Profile() {
    const { address, isConnected } = useAccount()
    const { connect } = useConnect({
      connector: new InjectedConnector(),
    })
    const { disconnect } = useDisconnect()
   
    if (isConnected)
      return (
         <div>
          {/* Connected to {address}
          <button onClick={() => disconnect()}>Disconnect</button> */}
        </div>
      )
    return <button onClick={() => connect()}>Connect Wallet</button>
  }