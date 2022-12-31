import React, {useState} from 'react';
import Popover from '@mui/material/Popover';
import { makeStyles } from '@mui/material/styles';

import './App.css';
import {GraphData, getNeighbourhood, GraphDataToArray, getRootNode} from './LoadGraph';
import { DrawGraph, } from './DrawGraph';
import axios from "axios";
import { response } from 'express';


// const useStyles = makeStyles(theme => ({
//   popover: {
//     pointerEvents: 'none',
//   },
//   popoverContent: {
//     pointerEvents: 'auto',
//   },
// }));



export const AppInner =() =>{
  const svg  = React.useRef<HTMLDivElement>(null);
  // var s = new XMLSerializer();
  // var str = s.serializeToString(DrawGraph("Awan"));
  // console.log("image text", str)
  var [graph, setGraph] = useState( {"Enter":{"id":"Enter", "name":"Enter","parentIds": [], "childIds":[],  "loaded": false}}as GraphData);
  var [hoverId, setHoverId] = useState("");

 

  const handleClick = (id2: string) => {
    getNeighbourhood(id2).then(response=>setGraph(response));
  }



  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [anchorElSaver, setAnchorElSaver] = React.useState<HTMLElement | null>(null);


  const handleMouseOver = (event: React.MouseEvent<HTMLElement>, id: string) => {
    setHoverId(id);
    setAnchorEl(event.currentTarget);
    setAnchorElSaver(event.currentTarget);

  };

  const handleMouseStay = (event: React.MouseEvent<HTMLElement>,) => {
    // setHoverId(id);
    setAnchorEl(anchorElSaver);
  };

  const handleMouseOut = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);
  // const classes = useStyles();

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
    // disableRestoreFocus
  >
    <div className='Popover'>I use Popover over {hoverId}.</div>
  </Popover>
  </div>
  );
}

// export default class App extends React.Component {

//   render(){
//     // var s = new XMLSerializer();
//     // var str = s.serializeToString(this.Image);
//     // console.log("image text", str)    
    
//     return (
//       <AppInner />
//     )
//   }
// }