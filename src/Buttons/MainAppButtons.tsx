import React, {useState} from 'react';

import { useNavigate, useParams } from "react-router-dom";
import detectEthereumProvider from '@metamask/detect-provider';
import {ethers} from  "ethers";

import '.././App.css';
import {getRandomLeaf, getIsNodeInGraph, LoadNeighbourhood, isVotable, isDagVote, isSwitchable,  NodeDataRendering, serveParent} from '../Graph/GraphCore/LoadGraph';

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

/////////////////////////////////////

export const DagVoteButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, }) => {
  
    if (!props.isAccountInGraph) return (<div></div>)
  
    var votable= isVotable(props.voter, props.recipient)
    if (votable) {
      
      if (isDagVote(props.voter, props.recipient)) {
        return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>RemoveDagVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id)} >Remove reputation vote</button></div>)
      } 
      else {
  
        return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>AddDagVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id)} >Add reputation vote</button></div>)
      }
    }
    return  <div></div>
  }
  
  export const SwitchParentButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering}) => {
    
    if (!props.isAccountInGraph) return (<div></div>)
  
    var switchable= isSwitchable(props.voter , props.recipient) 
    if (switchable) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>SwitchWithParent(props.AnthillContract, props.chainId, props.voter)} >You can switch with your parent!</button></div>)
    }
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div  className='Popover'> Increase your <br/> reputation to  <br/> switch position <br/> with your parent!</div>)
    return  <div></div>
  }
  
 export const JoinTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNodeId": any}) => {
    if (props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (
        <div className='Popover'> 
        <button className = 'PopoverButton'
           onClick={()=>JoinTree(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNodeId)}>
            Join tree here
        </button>
        </div>
      )
    }
    return <div></div>
  }
  
  export  const ChangeNameButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering}) => {
    var [nameInput, setNameInput] = useState("")
    
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    if (props.voter != props.recipient.id) return (<div></div>)

  
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (
        <div className='Popover'>
            
                <input
                    name='nameInput'
                    value={nameInput}
                    placeholder='Name'
                    autoComplete="off"
                    onChange={(event) =>
                        setNameInput(event.target.value)
                      }
                />
                <button className = 'PopoverButton' onClick={
                    ()=>ChangeName(props.AnthillContract, props.chainId, props.voter, nameInput)}>
                    Change name
                </button>
              
        </div>)
    }
    return  <div></div>
  }
  
  export  const LeaveTreeButton = (props :{"AnthillContract": any, "chainId":number ,"isAccountInGraph": boolean, "setIsAccountInGraph":any, "voter":string,"recipient": NodeDataRendering, "setClickedNodeId":any, "navigate":any}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.voter != props.recipient.id) return (<div></div>)
   
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>LeaveTree( props.AnthillContract, props.chainId,  props.voter, props.setIsAccountInGraph, props.navigate, props.setClickedNodeId)} >Leave the tree</button></div>)
  }
  
  export  const MoveTreeVoteButton = (props :{"AnthillContract": any, "chainId":number , "isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, "setClickedNodeId":any, navigate: any}) => {
    if (!props.isAccountInGraph) return (<div></div>)
    if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
    // console.log("joinTreeButton", props.isAccountInGraph, props.voter, props.recipient )
    if (props.recipient.recTreeVotes.includes(props.voter)) return (<div></div>)
    if (props.voter == props.recipient.id) return (<div></div>)
    var notFull = false
    if (props.recipient.recTreeVotes !== undefined) {
      notFull = (props.recipient.recTreeVotes.length < 2) 
    }
    if (notFull) {
      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>MoveTreeVote(props.AnthillContract, props.chainId, props.voter, props.recipient.id, props.setClickedNodeId, props.navigate)} >Move position</button></div>)
    }
    return  <div></div>
  }
  

  ////////////////// Smart contract calls/txs //////////////////
  
  async function AddDagVote(AnthillContract:any, chainId: number, account: string, recipient:string){
    await AnthillContract.methods.addDagVote(account, recipient, 1).send({from: account, chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
  async function RemoveDagVote(AnthillContract:any, chainId: number, account: string, recipient:string){
    await AnthillContract.methods.removeDagVote(account, recipient).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});
  }
  
  async function SwitchWithParent(AnthillContract:any,  chainId: number, account: string){
    await AnthillContract.methods.switchPositionWithParent(account).send({from: account, chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
  export async function JoinTree(AnthillContract:any, chainId: number, account: string, recipient:string, setClickedNodeId:any){
    await AnthillContract.methods.joinTree(account, account.slice(0, 3)+"..."+account.slice(-3), recipient).send({from:account  , chainId: chainId}).then((res:any)=>{ setClickedNodeId(account); console.log(res)});
  }
  
  async function ChangeName(AnthillContract:any, chainId: number, account: string, name: string){
    await AnthillContract.methods.changeName(account, name).send({from:account  , chainId: chainId}).then((res:any)=>{console.log(res)});
  }
  
  async function LeaveTree(AnthillContract:any, chainId: number, account: string, setIsAccountInGraph: any, navigate: any, setClickedNodeId:any){
    
    await AnthillContract.methods.leaveTree(account).send({from: account, chainId: chainId}).then((res:any)=>{
      console.log(res);
      setIsAccountInGraph(false);
      var parent = serveParent(account);
      setClickedNodeId(parent);
      // console.log("parent", parent);
      navigate("/?id="+parent);
    });
  }
  
  async function MoveTreeVote(AnthillContract:any, chainId: number, account: string, recipient:string, setClickedNodeId:any, navigate:any){
    await AnthillContract.methods.moveTreeVote(account, recipient).send({from: account, chainId: chainId}).then((res:any)=>{
        setClickedNodeId(recipient);
        navigate("/?id="+recipient);
        console.log(res)});
  }
  