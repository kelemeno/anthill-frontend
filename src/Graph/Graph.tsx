import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

import { useNavigate, useParams } from "react-router-dom";
// import detectEthereumProvider from '@metamask/detect-provider';
import useWebSocket from 'react-use-websocket';


import '.././App.css';
import {GraphDataRendering, LoadNeighbourhood, isVotable, isDagVote, isSwitchable, getAnthillGraphNum,  NodeDataRendering, serveParent} from './GraphCore/LoadGraph';
import { DrawGraph, } from './DrawGraph';
import {SwitchParentButton, MoveTreeVoteButton, ChangeNameButton, LeaveTreeButton, JoinTreeButton, DagVoteButton} from '../Buttons/MainAppButtons'



export const Graph= (props:{"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNodeId":string,"setClickedNodeId":any,  "AnthillContract": any, "backendUrl": string, "wsUrl":string })=> {
  // console.log("rendering graph")

  let navigate = useNavigate();

  // we have to use a ref to render the svg (or at least, I couldn't get it to work without it)
  const svg  = React.useRef<HTMLDivElement>(null);
  // we use this and compare it with props.clickedNodeId to see if we need to reload the graph
  const clickedNodeId = React.useRef("");

  // the actual data
  var [anthillGraphNum, setAnthillGraphNum ]= useState(0);
  var [graph, setGraph] = useState( {"id":{"id":props.clickedNodeId, "name":props.clickedNodeId, "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []}} as GraphDataRendering);
  var [hoverNode, setHoverNode] = useState({"id":props.clickedNodeId, "name":props.clickedNodeId, "totalWeight": 0,  "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

  // for the popover
  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);
  var [open, setOpen] = React.useState(Boolean(anchorEl));

  // we delay the popover to render only after the graph is loaded. This is set as true in useEffect
  var [loaded, setLoaded] = React.useState(false);

  // console.log("open", open, anchorEl, loaded)

  const handleClick = (id2: string) => {
    console.log("handling click", id2, props.clickedNodeId, props.account, anthillGraphNum)
    
    handleMouseOut();
    setAnchorEl(null);
    setAnchorElSaver(null);
    setOpen(false);
    setLoaded(false);
    // console.log("open2", open, anchorEl, loaded)

    
    props.setClickedNodeId(id2);

    LoadNeighbourhood(id2,  props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl).then((response)=>{
      setGraph(response[0]);
      setAnthillGraphNum(response[2]); 
      // console.log("response",response[0][response[1]].id )
      navigate("/?id="+response[0][response[1]].id); 
      setHoverNode(response[0][response[1]]);
     });

    setTimeout(() => {setLoaded(true)}, 1000);
    // console.log("open3", open, anchorEl, loaded)    
  }

  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeDataRendering) => {
    
    // console.log("handleMouseOver", open, anchorEl, loaded)

    if (loaded){
      setHoverNode(node);
      setAnchorEl(event.currentTarget);
      setAnchorElSaver(event.currentTarget);
      setOpen(true);
    }
  };

  const handleMouseStay = (event: React.MouseEvent<HTMLElement>,) => {

    if (anchorElSaver){
      // console.log("handleMouseStay", anchorElSaver)
      setAnchorEl(anchorElSaver);
      setOpen(true);

    }
  };

  const handleMouseOut = () => {
    // console.log("handleMouseOut")
    setOpen(false);
    setAnchorEl(null);
  };


  var checkForUpdates = async () => {
    if (clickedNodeId.current != props.clickedNodeId) {clickedNodeId.current = props.clickedNodeId; handleClick(props.clickedNodeId)}
    await getAnthillGraphNum(props.backendUrl).then((res)=>{   
        if (res != anthillGraphNum) {
          
          // console.log("updating AnthillGraphNum",  res,  anthillGraphNum, props.clickedNodeId, id, id? id: "Enter");
          handleClick((props.clickedNodeId));
        }
      }
    )
  }

  var checkForClick = () => {
    if (clickedNodeId.current != props.clickedNodeId) {
      clickedNodeId.current = props.clickedNodeId; 
      handleClick(props.clickedNodeId)}
  }

  React.useEffect(()=>{


      if (svg.current){
        svg.current.replaceChildren(DrawGraph({ "graph":graph ,"handleClick":handleClick, "handleMouseOver":handleMouseOver, "handleMouseOut":handleMouseOut}));
      };
      checkForClick();

      // this has to be the last one (maybe because we rerender multiple times)
      setLoaded(true);
      // console.log("open4", open, anchorEl, loaded);
    
  }, [graph, props.clickedNodeId]);

  const {
    // sendMessage,
    // sendJsonMessage,
    // lastMessage,
    // lastJsonMessage,
    // readyState,
    // getWebSocket,
  } = useWebSocket(props.wsUrl, {
    onOpen: () => {
      console.log('WebSocket connection established.');
    },
    onMessage: (event) => {
      checkForUpdates();
      console.log('WebSocket message received.', event);
    },
    onClose: () => {
      console.log('WebSocket connection closed.');
    }
  });

  return (<div>
    <div className="Graph" ref={svg}/>
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

    <SwitchParentButton AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} />
    <LeaveTreeButton    AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode}  setIsAccountInGraph = {props.setIsAccountInGraph} setClickedNodeId= {props.setClickedNodeId} navigate={navigate}/>
    <MoveTreeVoteButton AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} setClickedNodeId= {props.setClickedNodeId} navigate={navigate} />
    <DagVoteButton      AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode} />
    <JoinTreeButton     AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode}  setClickedNodeId={props.setClickedNodeId}/>
    <ChangeNameButton   AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter={props.account} recipient={hoverNode}  />

    <div className='Popover'> Address: <a href={"https://mumbai.polygonscan.com/address/"+hoverNode.id}>{hoverNode.id.slice(0,5)}...{hoverNode.id.slice(-3)}</a> </div> 


  </Popover>
  </div>
  );
}
