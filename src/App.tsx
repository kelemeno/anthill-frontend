import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

// import detectEthereumProvider from '@metamask/detect-provider';
import { AbiItem } from 'web3-utils'
import Web3 from 'web3';

import AnthillJson from "./Anthill.json"

import './App.css';
import {GraphDataRendering, LoadNeighbourhood, isVotable, isDagVote, isSwitchable, getAnthillGraphNum, getBareNodeFromServer,  NodeDataRendering} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';


const DagVoteButton = (props :{"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, AddDagVote: any, RemoveDagVote: any}) => {
  
  if (!props.isAccountInGraph) return (<div></div>)

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

const SwitchParentButton = (props :{"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, SwitchWithParent: any}) => {
  
  if (!props.isAccountInGraph) return (<div></div>)

  var switchable= isSwitchable(props.voter , props.recipient) 
  if (switchable) {
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>props.SwitchWithParent(props.voter)} >You can switch with your parent!</button></div>)
  }
  return  <div></div>
}

const JoinTreeButton = (props :{"isAccountInGraph": boolean, "voter":string, "recipient": NodeDataRendering, JoinTree: any}) => {
  if (props.isAccountInGraph) return (<div></div>)
  if (props.voter == "0x0000000000000000000000000000000000000000") return (<div></div>)
  
  var notFull = false
  if (props.recipient.recTreeVotes !== undefined) {
    notFull = (props.recipient.recTreeVotes.length < 2) 
  }
  if (notFull) {
    return (<div className='Popover'><button className = 'PopoverButton' onClick={()=>props.JoinTree(props.voter, props.recipient)} >Join tree here</button></div>)
  }
  return  <div></div>
}


export const AppInner= (props:{"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNode":NodeDataRendering, "setClickedNode":any})=> {

  const svg  = React.useRef<HTMLDivElement>(null);
  const antHillContractAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
  var AnthillContract: any; 
  const web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
  var [anthillGraphNum, setAnthillGraphNum ]= useState(0);
  var [graph, setGraph] = useState( {"Enter":{"id":"Enter", "name":"Enter", "totalWeight": 0,"onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []}} as GraphDataRendering);
  var [hoverNode, setHoverNode] = useState({"id":"Enter", "name":"Enter", "totalWeight": 0, "onchainRep":1, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);
  
  AnthillContract = new web3.eth.Contract(AnthillJson.abi  as AbiItem[], antHillContractAddress);

  // these functions are the hard ones, we pass them in and they are used, but they cannot be typechecked easily
  async function AddDagVote(voter: NodeDataRendering, recipient:NodeDataRendering){
    await AnthillContract.methods.addDagVote(voter.id, recipient.id).send({from: props.account[0], chainId: props.chainId}).then((res:any)=>{console.log(res)});
  }

  async function RemoveDagVote(voter: NodeDataRendering, recipient:NodeDataRendering){
    await AnthillContract.methods.removeDagVote(voter.id, recipient.id).send({from: props.account[0], chainId:props.chainId}).then((res:any)=>{console.log(res)});
  }

  async function SwitchWithParent(voter: NodeDataRendering, recipient:NodeDataRendering){
    await AnthillContract.methods.switchPositionWithParent(voter.id).send({from: props.account[0], chainId: props.chainId}).then((res:any)=>{console.log(res)});
  }

  async function JoinTree(voter: string, recipient:NodeDataRendering){
    console.log(voter, recipient.id, props.account, props.chainId)
    await AnthillContract.methods.joinTree(voter, "name", recipient.id).send({from:props.account[0]  , chainId: props.chainId}).then((res:any)=>{console.log(res)});
  }

  const handleClick = (id2: string) => {
    console.log("handling click", id2, props.account)
    LoadNeighbourhood(id2,  props.account, props.isAccountInGraph, props.setIsAccountInGraph).then((response)=>{
      setGraph(response[0]);
       setAnthillGraphNum(response[2]); 
       props.setClickedNode(response[0][response[1]]); setHoverNode(response[0][response[1]]); });
  }

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

  // var checkAccountInGraph = async () => {
  //   await getBareNodeFromServer(props.account).then((res)=>{
  //     if (res != null) {
  //       props.setIsAccountInGraph(true);
  //     }
  //   })
  // }

  var checkForUpdates = async () => {
    await getAnthillGraphNum().then((res)=>{   
        if (res != anthillGraphNum) {
          console.log("updating AnthillGraphNum",  res,  anthillGraphNum);
          handleClick(props.clickedNode.id);
        }
      }
    )
  }

  React.useEffect(()=>{

    if (svg.current){
      svg.current.replaceChildren(DrawGraph(graph, handleClick, handleMouseOver, handleMouseOut));
    };

    const interval = setInterval(async () => await checkForUpdates(), 200);

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

    <SwitchParentButton isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} SwitchWithParent={SwitchWithParent}/>
    <DagVoteButton isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} AddDagVote={AddDagVote} RemoveDagVote={RemoveDagVote}/>
    <JoinTreeButton isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} JoinTree={JoinTree} />

    <div className='Popover'> Move tree vote and START AGAIN here  </div>
    <div className='Popover'> Exit tree (all data lost) </div>
    <div className='Popover'> Relroot: {hoverNode.relRoot} </div>

    <div className='Popover'> Address: {hoverNode.id} </div>


  </Popover>
  </div>
  );
}
