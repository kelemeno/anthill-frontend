import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

import { useNavigate, useParams } from "react-router-dom";
// import detectEthereumProvider from '@metamask/detect-provider';
import useWebSocket from 'react-use-websocket';


import './App.css';
import {GraphDataRendering, LoadNeighbourhood, isVotable, isDagVote, isSwitchable, getAnthillGraphNum,  NodeDataRendering, serveParent} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';
import {SwitchParentButton, MoveTreeVoteButton, ChangeNameButton, LeaveTreeButton, JoinTreeButton, DagVoteButton} from './Buttons'



export const Graph= (props:{"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNodeId":string,"setClickedNodeId":any,  "AnthillContract": any, "backendUrl": string, "wsUrl":string })=> {
  

  let navigate = useNavigate();

  const svg  = React.useRef<HTMLDivElement>(null);
  const clickedNodeId = React.useRef("");

  var [anthillGraphNum, setAnthillGraphNum ]= useState(0);
  var [graph, setGraph] = useState( {"id":{"id":props.clickedNodeId, "name":props.clickedNodeId, "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []}} as GraphDataRendering);
  var [hoverNode, setHoverNode] = useState({"id":props.clickedNodeId, "name":props.clickedNodeId, "totalWeight": 0,  "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": []} as NodeDataRendering);

  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);
    
  const handleClick = (id2: string) => {
    console.log("handling click", id2, props.clickedNodeId, props.account, anthillGraphNum)
    props.setClickedNodeId(id2);
    
    LoadNeighbourhood(id2,  props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl).then((response)=>{
      setGraph(response[0]);
      setAnthillGraphNum(response[2]); 
      // console.log("response",response[0][response[1]].id )
      navigate("/?id="+response[0][response[1]].id); 
      setHoverNode(response[0][response[1]]); });
      setAnchorEl(null);
      setAnchorElSaver(null);
  }

  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeDataRendering) => {
    setHoverNode(node);
    setAnchorEl(event.currentTarget);
    setAnchorElSaver(event.currentTarget);
  };

  const handleMouseStay = (event: React.MouseEvent<HTMLElement>,) => {

    if (anchorElSaver){
      setAnchorEl(anchorElSaver);
    }
  };

  const handleMouseOut = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

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
        svg.current.replaceChildren(DrawGraph(graph, handleClick, handleMouseOver, handleMouseOut));
      };

      const interval = setInterval(async () => await checkForClick(), 100);

      return () => {
      clearInterval(interval);
      }
    
      

    
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
  });

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
