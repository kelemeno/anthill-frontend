// this is where the mouse and graphnode interactions are defined

// import { useNavigate, useParams } from "react-router-dom";

import { NodeDataRendering } from "../GraphBase";


export const handleClick = (props: {id: string, setOpen: any, setAnchorEl:any, setAnchorElSaver:any, setLoaded:any, setClickedNodeId:any, setHoverNode:any, navigate:any} ) => { //setAnthillGraphNum:any,
    // console.log("handling click", props.id,)

    props.setLoaded(false);
    props.setOpen(false);
    props.setAnchorEl(null);
    props.setAnchorElSaver(null);

    // setTimeout(() => {

      props.setClickedNodeId(props.id);


      props.setHoverNode({"id":props.id, "name":props.id, "totalWeight": 0,  "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": [], "isVotable": false, "isDagVote": false, "isSwitchable": false} as NodeDataRendering);

    // }, 30)
    
    // console.log("open2", open, anchorEl, loaded)

    

    // props.LoadNeighbourhood(props.id,  props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl).then((response)=>{
    //   props.setGraph(response[0]);
    //   props.setAnthillGraphNum(response[2]); 
    //   // console.log("response",response[0][response[1]].id )

    //   props.navigate("/?id="+props.id); 
    //  });

    setTimeout(() => {props.setLoaded(true)}, 1000);
    // console.log("open3", open, anchorEl, loaded)    
  }

 export const handleMouseOver = (event: React.MouseEvent<HTMLElement>, node: NodeDataRendering, loaded: boolean, setHoverNode: any, setAnchorEl:any, setAnchorElSaver:any, setOpen:any) => {
    
    if ((loaded) && (document.body.contains(event.currentTarget))){
      // console.log("handling mouseover", event.currentTarget)
      setHoverNode(node);
      setAnchorEl(event.currentTarget);
      // console.log("does the document contain the currentTarget?", (document.body.contains(event.currentTarget)), event.currentTarget)
      setAnchorElSaver(event.currentTarget);
      setOpen(true);
    }
  };

 export const handleMouseStay = (anchorElSaver: any, setAnchorEl:any, setOpen:any, loaded:boolean) => {

    if (anchorElSaver && loaded){
      // console.log("handling mouseStay")
      // console.log("handleMouseStay", anchorElSaver)
      setAnchorEl(anchorElSaver);
      setOpen(true);
    }
  };

export const handleMouseOut = (loaded:boolean, setOpen:any, setAnchorEl:any) => {
    if (loaded) {
      // console.log("handling mouseOut")
      setOpen(false);
      setAnchorEl(null);
    }
};