import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

import detectEthereumProvider from '@metamask/detect-provider';
import { AbiItem } from 'web3-utils'
import Web3 from 'web3';

import AnthillJson from "./Anthill.json"


// import { useAccount, useSigner, useProvider} from 'wagmi'
// import { usePrepareContractWrite, useContractWrite } from 'wagmi'
// import {  QueryClientProvider, QueryClient } from '@tanstack/react-query'




import './App.css';
import {GraphData, GetNeighbourhood, GraphDataToArray, getRootNode, NodeData, findDepthDiff, checkDagVote, getAnthillGraphNum} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';


const DagVoteButton = (props :any) => {
  var [isLocal, ] = findDepthDiff(props.voter, props.recipient)
  if (isLocal) {
    
    if (checkDagVote(props.voter, props.recipient)) {
      return ( <div className='Popover'><button className = 'PopoverButton' onClick={()=>props.RemoveDagVote(props.voter, props.recipient)} >Remove Dag Vote</button></div>)
    } 
    else {

      return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>props.AddDagVote(props.voter, props.recipient)} >Add Dag Vote</button></div>)
    }
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


  async function AddDagVote(voter: string, recipient:string){

    await AnthillContract.methods.addDagVote(voter, recipient).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});

  }

  async function RemoveDagVote(voter: string, recipient:string){

    await AnthillContract.methods.removeDagVote(voter, recipient).send({from: account, chainId:chainId}).then((res:any)=>{console.log(res)});

  }

  var [anthillGraphNum, setAnthillGraphNum ]= useState(0);
  var [currentId, setCurrentId]=useState("Enter");

  var [graph, setGraph] = useState( {currentId:{"id":currentId, "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[], "loaded": true}}as GraphData);


  var checkForUpdates = async () => {
    await getAnthillGraphNum().then((res)=>
        {
          console.log("res, ", res,  anthillGraphNum)
          if (res != anthillGraphNum) {
            console.log("updating");
            handleClick(currentId);
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
    GetNeighbourhood(id2).then((response)=>{setGraph(response[0]); setAnthillGraphNum(response[1]); setCurrentId(id2) });
  }


  var [hoverNode, setHoverNode] = useState({"id":"Enter", "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[], "loaded": true} as NodeData);
  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);


  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeData) => {
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
    const interval = setInterval(async () => await checkForUpdates(), 2000);
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
  >
    <div className='Popover'>Name {hoverNode.name}.  Depth: </div>
    <div className='Popover'>Address link to blockexplorer </div>
    <div className='Popover'> Current reputation, onchain reputation </div>
    <div className='Popover'> Current received reputation from metamask address, if loaded </div>
    <DagVoteButton voter="0x0000000000000000000000000000000000000008" recipient="0x0000000000000000000000000000000000000005" AddDagVote={AddDagVote} RemoveDagVote={RemoveDagVote}/>
    <div className='Popover'> Button to move tree vote here, if applicable </div>

    <div className='Popover'> Button to cause position switch with parent, if applicable </div>

  </Popover>
  </div>
  );
}
