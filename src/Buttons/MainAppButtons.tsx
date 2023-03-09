import React, {useState} from 'react';

import { useNavigate, useParams } from "react-router-dom";
import detectEthereumProvider from '@metamask/detect-provider';
import {ethers} from  "ethers";

import '.././App.css';
import { getIsNodeInGraph, getRandomLeaf } from '../ExternalConnections/BackendGetters';

import { LoadNeighbourhood,  serveParent} from '../Graph/GraphCore/LoadGraph';
import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering } from "../Graph/GraphCore/GraphBase";

import {JoinTree, RemoveDagVote, AddDagVote, MoveTreeVote, ChangeName, SwitchWithParent, LeaveTree} from '../ExternalConnections/SmartContractInteractions'

const addNetwork = async (provider:any) => {
    try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: "0x13881" }],
        });
      } catch (switchError:any) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                    chainId: "0x13881",
                    chainName:  "Mumbai",
                    rpcUrls: ["https://rpc-mumbai.maticvigil.com/"],
                    blockExplorerUrls: ["https://mumbai.polygonscan.com/"],
                    nativeCurrency: {
                        name: "MATIC",
                        symbol: "MATIC", // 2-6 characters long
                        decimals: 18,
                    },
                },
              ],
            });
          } catch (addError) {
            // handle "add" error
          }
        }
    
    window.location.reload();
  };
}

async function getAccount(props:{backendUrl: string, provider:any, setAccounts: any, setIsAccountInGraph :any}) {
    
  if (props.backendUrl != "http://localhost:5000/") {
      addNetwork(props.provider);
    }

    var acc = ethers.utils.getAddress((await (props.provider.request({ method: 'eth_requestAccounts' })))[0]);
    props.setAccounts(acc)
    var isInGraph = await getIsNodeInGraph(props.backendUrl, acc)
    props.setIsAccountInGraph(isInGraph)
    if (isInGraph) await LoadNeighbourhood(acc, acc, isInGraph, props.setIsAccountInGraph, props.backendUrl);
    
}


export function ConnectMetamaskButton(props:{provider:any, setProvider:any, accounts :string, setAccounts: any, setIsAccountInGraph :any, backendUrl: string, }) {
    detectEthereumProvider().then((res)=>{props.setProvider(res); return res});
    if (props.provider){
        if (props.accounts != "0x0000000000000000000000000000000000000000") {
            return <div></div>
        }
        return <button onClick={() => getAccount({"backendUrl":props.backendUrl, "provider":props.provider, "setAccounts": props.setAccounts, setIsAccountInGraph: props.setIsAccountInGraph})}>Connect Wallet</button>

    }
    return <div><a href="https://metamask.io/download/">Install Metamask</a></div>
}

export function GoHomeButton(props:{accounts: string, isAccountInGraph :boolean,   setClickedNodeId: any}) {
    var navigate = useNavigate();
    if (!props.isAccountInGraph) {return <></>}

    return <button onClick={() => {console.log("gohome"); props.setClickedNodeId(props.accounts); navigate("/?id="+props.accounts);}}>Go to my node</button>
}

export function JoinTreeRandomlyButton(props:{AnthillContract: any, chainId: number, accounts: string, isAccountInGraph :boolean,backendUrl: string,  setClickedNodeId: any}) {
    var navigate = useNavigate();
    if (props.isAccountInGraph) {return <></>}
    if (props.accounts == "0x0000000000000000000000000000000000000000"){return <></>}
    return <button onClick={async () => {
            var recipient = await getRandomLeaf(props.backendUrl )
            await JoinTree(props.AnthillContract, props.chainId, props.accounts, recipient, props.setClickedNodeId) ;
            navigate("/"+props.accounts)
            }   
        }>
        Join tree in random position
        </button>
}



 
  