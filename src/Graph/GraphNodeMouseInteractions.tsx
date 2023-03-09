import { useNavigate, useParams } from "react-router-dom";

import { NodeDataRendering } from "./GraphCore/GraphBase";
import {LoadNeighbourhood} from "./GraphCore/LoadGraph";


export const handleClick = (props: {id: string, setOpen: any, setAnchorEl:any, setAnchorElSaver:any, setLoaded:any, setClickedNodeId:any, setGraph:any, setAnthillGraphNum:any, setHoverNode:any, account:string, isAccountInGraph:boolean, setIsAccountInGraph:any, backendUrl:string, navigate:any} ) => {
    // console.log("handling click", id2, props.clickedNodeId, props.account, anthillGraphNum)
    
    

    props.setOpen(false);
    props.setAnchorEl(null);
    props.setAnchorElSaver(null);
    props.setLoaded(false);
    // console.log("open2", open, anchorEl, loaded)

    
    props.setClickedNodeId(props.id);

    LoadNeighbourhood(props.id,  props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl).then((response)=>{
        props.setGraph(response[0]);
        props.setAnthillGraphNum(response[2]); 
      // console.log("response",response[0][response[1]].id )
      props.navigate("/?id="+response[0][response[1]].id); 
      props.setHoverNode(response[0][response[1]]);
     });

    setTimeout(() => {props.setLoaded(true)}, 1000);
    // console.log("open3", open, anchorEl, loaded)    
  }

 export const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeDataRendering, loaded: boolean, setHoverNode: any, setAnchorEl:any, setAnchorElSaver:any, setOpen:any) => {
    
    // console.log("handleMouseOver", open, anchorEl, loaded)

    if (loaded){
      setHoverNode(node);
      setAnchorEl(event.currentTarget);
      setAnchorElSaver(event.currentTarget);
      setOpen(true);
    }
  };

 export const handleMouseStay = (anchorElSaver: any, setAnchorEl:any, setOpen:any) => {

    if (anchorElSaver){
      // console.log("handleMouseStay", anchorElSaver)
      setAnchorEl(anchorElSaver);
      setOpen(true);

    }
  };

export const handleMouseOut = (setOpen:any, setAnchorEl:any) => {
    // console.log("handleMouseOut")
    setOpen(false);
    setAnchorEl(null);
  };