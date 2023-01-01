import React, {useState} from 'react';
import Popover from '@mui/material/Popover';
import { makeStyles } from '@mui/material/styles';

import './App.css';
import {GraphData, getNeighbourhood, GraphDataToArray, getRootNode, NodeData} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';

import detectEthereumProvider from '@metamask/detect-provider';



export const AppInner =() =>{
  const svg  = React.useRef<HTMLDivElement>(null);
 
  var [graph, setGraph] = useState( {"Enter":{"id":"Enter", "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[]}}as GraphData);
  const handleClick = (id2: string) => {
    getNeighbourhood(id2).then(response=>setGraph(response));
  }


  var [hoverNode, setHoverNode] = useState({"id":"Enter", "name":"Enter","parentIds": [], "treeParentId":"",  "childIds":[]} as NodeData);
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
    }
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
      horizontal: 'left',
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
    <div className='Popover'>I use Popover over {hoverNode.name}. {}</div>
  </Popover>
  </div>
  );
}
