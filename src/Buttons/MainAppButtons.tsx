// buttons for the main app. 

import styled from "styled-components";
// import COLORS from "./color";

import { useNavigate } from "react-router-dom";
import detectEthereumProvider from '@metamask/detect-provider';
import {ethers} from  "ethers";

import '.././App.css';
import { getIsNodeInGraph, getRandomLeaf } from '../ExternalConnections/BackendGetters';

// import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering } from "../Graph/GraphBase";

import {JoinTree,} from '../ExternalConnections/SmartContractInteractions'

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
    
  if (props.backendUrl !== "http://localhost:5000/") {
      addNetwork(props.provider);
    }

    var account = ethers.utils.getAddress((await (props.provider.request({ method: 'eth_requestAccounts' })))[0]);
    var isAccountInGraph: boolean;
    if (account === undefined) {
      isAccountInGraph = false;
    } else {
      isAccountInGraph = await getIsNodeInGraph(props.backendUrl, account)
      console.log("isAccountInGraph", isAccountInGraph, account)

    }
    if (isAccountInGraph){
      props.setIsAccountInGraph(isAccountInGraph)
    }    
    props.setAccounts(account)

}


export function ConnectMetamaskButton(props:{"provider":any, "setProvider":any, "account" :string, "setAccounts": any,  "setIsAccountInGraph" :any, "backendUrl": string, }) {
    detectEthereumProvider().then((res)=>{props.setProvider(res); return res});
    if (props.provider){
        if (props.account !== "0x0000000000000000000000000000000000000000") {
            return <div></div>
        }
        return <button onClick={() => getAccount({"backendUrl":props.backendUrl, "provider":props.provider, "setAccounts": props.setAccounts, "setIsAccountInGraph": props.setIsAccountInGraph})}>Connect Wallet</button>

    }
    return <div><a href="https://metamask.io/download/">Install Metamask</a></div>
}

export function GoHomeButton(props:{account: string, isAccountInGraph :boolean, setClickedNode: any}) {
    var navigate = useNavigate();
    if (!props.isAccountInGraph) {return <></>}

    return <button onClick={() => {console.log("gohome"); props.setClickedNode(props.account); navigate("/?id="+props.account);}}>Go to my node</button>
}

export function JoinTreeRandomlyButton(props:{AnthillContract: any, chainId: number, account: string, isAccountInGraph :boolean,backendUrl: string,  setClickedNode: any}) {
    var navigate = useNavigate();
    if (props.isAccountInGraph) {return <></>}
    if (props.account === "0x0000000000000000000000000000000000000000"){return <></>}
    return <button onClick={async () => {
            var recipient = await getRandomLeaf(props.backendUrl )
            await JoinTree(props.AnthillContract, props.chainId, props.account, recipient, props.setClickedNode) ;
            navigate("/"+props.account)
            }   
        }>
        Join tree in random position
        </button>
}

export function TreeOrRepModeSwitch(props:{treeMode: boolean, setTreeMode: any}) {
   
    
  function handleOnChange() {
    // console.log("---", e.target.checked);
    props.setTreeMode(!props.treeMode);
  }
  return (
    < >
    <StyledLabel htmlFor="checkbox" checked={props.treeMode}> 
    
      <input 
        id="checkbox" 
        type="checkbox" 
        checked={props.treeMode}
        onChange={handleOnChange} />   

    </StyledLabel>
    <div style={{ textAlign: 'center', width:'80px' }}>{props.treeMode ? "Tree" : "Reputation"}</div>

    </>
  );
}



const StyledLabel = styled.label<{ checked: boolean }>`  
cursor: pointer;
display: flex;
align-items: center;
text-indent: -9999px;  
width: 60px;  
height: 30px;  
background: ${({ checked }) => (checked ? "#00ff00" :  "#808080")};  
display: block;  
border-radius: 20px;  
position: relative;
margin-left: 10px;
user-select: none;


&:after {    
content: "";    
position: absolute;    
left: ${({ checked }) => (checked ? "6px" : "calc(55% - 1px)")};    top: 4.5px;    
width: 20px;    
height: 20px;    
background: #fff;    
border-radius: 20px;    
transition: 0.3s;  
appearance: none;

}



`;