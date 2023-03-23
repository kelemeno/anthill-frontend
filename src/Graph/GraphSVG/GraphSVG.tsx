// this is where we create the image of the graph, adding in the popover and the buttons

import React, {useState} from 'react';
import Popover from '@mui/material/Popover';

import { useNavigate,  } from "react-router-dom";

import '.././../App.css';
import {  GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering } from "../GraphBase";

import { DrawGraph, } from './DrawGraph';
import {handleClick, handleMouseOut, handleMouseOver, handleMouseStay} from './GraphNodeMouseInteractions'
import {SwitchParentButton, MoveTreeVoteButton, ChangeNameButton, LeaveTreeButton, JoinTreeButton, DagVoteButton} from '../../Buttons/PopupButtons'



export const GraphSVG= (props:{"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNode":string,"setClickedNode":any,  "AnthillContract": any,  "graph":GraphDataRendering, "altNode":string, "maxRelRootDepth":number, "anthillGraph":GraphData, "anthillGraphBare":GraphDataBare })=> {
  // console.log("rendering graph")

  let navigate = useNavigate();

  // we have to use a ref to render the svg (or at least, I couldn't get it to work without it)
  const svg  = React.useRef<HTMLDivElement>(null);
  // we use this and compare it with props.clickedNodeId to see if we need to reload the graph
  // const clickedNodeId = React.useRef("");

  // the actual data
  var [hoverNode, setHoverNode] = useState({"id":props.clickedNode, "name":props.clickedNode, "totalWeight": 0,  "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": [], "isVotable": false, "isDagVote": false, "isSwitchable": false} as NodeDataRendering);

  // for the popover
  var [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  var [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);
  var [open, setOpen] = React.useState(Boolean(anchorEl));

  // we delay the popover to render only after the graph is loaded. This is set as true in useEffect
  var [loaded, setLoaded] = React.useState(false);

  
  // console.log("open", open, anchorEl, loaded)

  

  // var checkForClick = () => {
  //   if (clickedNodeId.current != props.clickedNodeId) {
  //     clickedNodeId.current = props.clickedNodeId; 
  //     handleClickConstructed( props.clickedNodeId )}
  // }


  React.useEffect(()=>{

    const handleClickConstructed = (id:string)=>handleClick({
      "id":id,
      "setOpen":setOpen, 
      "setAnchorEl":setAnchorEl, 
      "setAnchorElSaver":setAnchorElSaver, 
      // "setAnthillGraphNum":setAnthillGraphNum, 
      "setClickedNodeId":props.setClickedNode, 
      "setLoaded":setLoaded,
      "setHoverNode":setHoverNode,
      "navigate":navigate,
    })

      if (svg.current){

        setOpen(false);
        setLoaded(false);
        setAnchorEl(null);
        setAnchorElSaver(null);
        // setHoverNode();

        svg.current.replaceChildren(DrawGraph({
           "graph":props.graph ,
           "clickedNode":props.clickedNode,
           "handleClick":handleClickConstructed,
           "handleMouseOver":(event:  React.MouseEvent<HTMLElement>, node:NodeDataRendering) => 
              handleMouseOver(event, node, loaded, setHoverNode, setAnchorEl, setAnchorElSaver, setOpen ), 
            "handleMouseOut":()=>handleMouseOut(loaded, setOpen, setAnchorEl)}));
      };
      // checkForClick();

      // this has to be the last one (maybe because we rerender multiple times)
      setLoaded(true);
      // console.log("open4", open, anchorEl, loaded);
    
  }, [props.graph, props.clickedNode, props.setClickedNode, loaded, navigate]);

 

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
    onClose={()=>handleMouseOut(loaded, setOpen, setAnchorEl)}
    PaperProps={{
      onMouseEnter: () => handleMouseStay(anchorElSaver, setAnchorEl, setOpen, loaded), 
      onMouseLeave: () => handleMouseOut(loaded, setOpen, setAnchorEl), 
      sx: {pointerEvents: 'auto',}
    }}
    transitionDuration="auto"
>
    <div className='Popover' >Name: {hoverNode.name}.  </div>
    {/* <div className='Popover'>Depth: {hoverNode.depth}.  </div> */}
    <div className='Popover'> Current reputation: {(hoverNode.currentRep/10**18).toFixed(2)} </div>

    <SwitchParentButton AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter  ={props.account} recipient={hoverNode} graph={props.graph}/>
    <LeaveTreeButton    AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter  ={props.account} recipient={hoverNode} setIsAccountInGraph = {props.setIsAccountInGraph} setClickedNode= {props.setClickedNode} navigate={navigate} altNode={props.altNode}/>
    <MoveTreeVoteButton AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter  ={props.account} recipient={hoverNode} setClickedNode= {props.setClickedNode} navigate={navigate} />
    <DagVoteButton      AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} account={props.account} recipient={hoverNode.id} graph={props.graph} />
    <JoinTreeButton     AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter  ={props.account} recipient={hoverNode} setClickedNode={props.setClickedNode}/>
    <ChangeNameButton   AnthillContract = {props.AnthillContract} chainId = {props.chainId} isAccountInGraph = {props.isAccountInGraph} voter  ={props.account} recipient={hoverNode}  />

    <div className='Popover'> Address: <a href={"https://mumbai.polygonscan.com/address/"+hoverNode.id}>{hoverNode.id.slice(0,5)}...{hoverNode.id.slice(-3)}</a> </div> 


  </Popover>
  </div>
  );
}
