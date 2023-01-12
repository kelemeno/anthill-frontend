import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

// import detectEthereumProvider from '@metamask/detect-provider';
import { AbiItem } from 'web3-utils'
import Web3 from 'web3';

import AnthillJson from "./Anthill.json"


// import { useAccount, useSigner, useProvider} from 'wagmi'
// import { usePrepareContractWrite, useContractWrite } from 'wagmi'
// import {  QueryClientProvider, QueryClient } from '@tanstack/react-query'




import './App.css';
import {GraphDataRendering, LoadNeighbourhood,  NodeData, isVotable, isDagVote, getAnthillGraphNum, NodeDataRendering} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';


const DagVoteButton = (props :{"voter":NodeDataRendering, "recipient": NodeDataRendering, AddDagVote: any, RemoveDagVote: any}) => {
  
  var votable= isVotable(props.voter, props.recipient)
  if (votable) {
    
    if (isDagVote(props.voter, props.recipient)) {
      return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>props.RemoveDagVote(props.voter, props.recipient)} >Remove Dag Vote</button></div>)
    } 
    else {

      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>props.AddDagVote(props.voter, props.recipient)} >Add Dag Vote</button></div>)
    }
  }
  return  <div></div>
}

const SwitchParentButton = (props :{"voter":NodeDataRendering, "recipient": NodeDataRendering, SwitchWithParent: any}) => {
  
  var switchable= (props.voter.sentTreeVote== props.recipient.id) && (props.voter.currentRep > props.recipient.currentRep)
  if (switchable) {
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>props.SwitchWithParent(props.voter)} >You can switch with your parent!</button></div>)
  }
  return  <div></div>
}



const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));




export const AppInner= ()=> {

  const svg  = React.useRef<HTMLDivElement>(null);

  

  const antHillContractAddress = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
   

  // var provider : any;
  var AnthillContract: any; 
  const web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
  

  var [account, setAccount ] = useState("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"); 
  var [chainId, setChainId ] = useState(1337);
  
  AnthillContract = new web3.eth.Contract(AnthillJson.abi  as AbiItem[], antHillContractAddress);

  // these functions are the hard ones, we pass them in and they are used, but they cannot be typechecked easily
  async function AddDagVote(voter: NodeDataRendering, recipient:NodeDataRendering){

    await AnthillContract.methods.addDagVote(voter.id, recipient.id).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});

  }

  async function RemoveDagVote(voter: NodeDataRendering, recipient:NodeDataRendering){

    await AnthillContract.methods.removeDagVote(voter.id, recipient.id).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});

  }

  async function SwitchWithParent(voter: NodeDataRendering, recipient:NodeDataRendering){

    await AnthillContract.methods.switchPositionWithParent(voter.id).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});

  }

  var [anthillGraphNum, setAnthillGraphNum ]= useState(0);
  var [clickedNode, setClickedNode]=useState({"id":"Enter", "name":"Enter", "totalWeight": 0,"onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": []} as NodeDataRendering);

  var [graph, setGraph] = useState( {"Enter":{"id":"Enter", "name":"Enter", "totalWeight": 0,"onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": []}} as GraphDataRendering);


  var checkForUpdates = async () => {
    await getAnthillGraphNum().then((res)=>
        {
         
          if (res != anthillGraphNum) {
            console.log("updating AnthillGraphNum",  res,  anthillGraphNum);
            handleClick(clickedNode.id);
          }
        }
      )
    
  }

  // if (!checkerLaunched) {
  //   console.log("launching checker")
  //   checkerLaunched = true;
  //   checkForUpdates();
  // }
  


  const handleClick = (id2: string) => {
    console.log("handling click", id2)
    LoadNeighbourhood(id2).then((response)=>{setGraph(response[0]); setAnthillGraphNum(response[2]); ;setClickedNode(response[0][response[1]]); setHoverNode(response[0][response[1]]); });
  }


  var [hoverNode, setHoverNode] = useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": []} as NodeDataRendering);
  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);


  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeDataRendering) => {
    setHoverNode(node);
    setAnchorEl(event.currentTarget);
    setAnchorElSaver(event.currentTarget);
  };

  const handleMouseStay = (event: React.MouseEvent<HTMLElement>,) => {
    setAnchorEl(anchorElSaver);
  };

  const handleMouseOut = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  React.useEffect(()=>{

    if (svg.current){
      svg.current.replaceChildren(DrawGraph(graph, handleClick, handleMouseOver, handleMouseOut));
    };
    const interval = setInterval(async () => await checkForUpdates(), 500);
    return () => {
    clearInterval(interval);
  };
  }, [graph]);

  return (<div>
    <div className="AppInner" ref={svg}/>
    <Popover
    id="mouse-over-popover"
    sx={{
      pointerEvents: 'none',
    }}
    open={open}
    anchorEl={anchorEl}
    anchorOrigin={{
      vertical: 'bottom',
      horizontal: 'right',
    }}
    transformOrigin={{
      vertical: 'top',
      horizontal: 'left',
    }}
    onClose={handleMouseOut}
    PaperProps={{
      onMouseEnter: handleMouseStay, 
      onMouseLeave: handleMouseOut, 
      sx: {pointerEvents: 'auto',}
    }}
    transitionDuration="auto"
>
    <div className='Popover' >Name: {hoverNode.name}.  </div>
    <div className='Popover'>Depth: {hoverNode.depth}.  </div>
    <div className='Popover'> Current reputation: {(hoverNode.currentRep/10**18).toFixed(2)} </div>

    <SwitchParentButton voter={clickedNode} recipient={hoverNode} SwitchWithParent={SwitchWithParent}/>


    <DagVoteButton voter={clickedNode} recipient={hoverNode} AddDagVote={AddDagVote} RemoveDagVote={RemoveDagVote}/>
    <div className='Popover'> Move tree vote and START AGAIN here  </div>
    <div className='Popover'> Exit tree (all data lost) </div>
    <div className='Popover'>Relroot: {hoverNode.relRoot} </div>

    <div className='Popover'>Address: {hoverNode.id} </div>

    OR

     <div className='Popover'>Join tree here </div>


  </Popover>
  </div>
  );
}
