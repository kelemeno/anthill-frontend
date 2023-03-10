// this is where we store the whole graph, update it when necessary, do computations on it, store the clicked node, and pass the subgraph that we want to visualise to the graphSVG component
// this means that when we connect our wallet, we reload the graph. This is a bit unnecessary, but ok, as we don't often change the wallet. 

import React, {useState} from 'react';
import useWebSocket from 'react-use-websocket';


import { GraphSVG } from "./GraphSVG/GraphSVG"
import { GraphData, GraphDataBare, GraphDataRendering , address1} from "./GraphBase"
import { LoadNeighbourhood } from './LoadGraph';

export const Graph = (props: {"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNodeId":string,"setClickedNodeId":any,  "AnthillContract": any, "backendUrl": string, "wsUrl":string }) => {
    // variables 

    var [maxRelRootDepth, setMaxRelRootDepth] = useState(0);
    // var [anthillGraphNum, setAnthillGraphNum ] =  useState(0);

    // the nodes we have clicked on, so have fully loaded
    var [anthillGraph, setAnthillGraph] = useState({}as GraphData);
    // the nodes we only display, so have the minimum info
    var [anthillGraphBare, setAnthillGraphBare]  = useState({} as GraphDataBare);

    // var anthillGraphServe : GraphData = {};
    // var anthillGraphBareServe : GraphDataBare = {};


    var [clickedNode, setClickedNode] = React.useState("");
    var [graph, setGraph] = useState( {"id":{"id":props.clickedNodeId, "name":props.clickedNodeId, "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": [], "isVotable":false, "isDagVote":false, "isSwitchable": false}} as GraphDataRendering);

    var [altNode, setAltNode] = useState("");

    var clearingGraph = async () => {
      setAnthillGraph({});
      setAnthillGraphBare({});
    }

    // const {
    //     // sendMessage,
    //     // sendJsonMessage,
    //     // lastMessage,
    //     // lastJsonMessage,
    //     // readyState,
    //     // getWebSocket,
    //   } =
       useWebSocket(props.wsUrl, {
        onOpen: () => {
          console.log('WebSocket connection established.');
        },
        onMessage: (event) => {
          clearingGraph();
          console.log('WebSocket message received.', event);
        },
        onClose: () => {
          console.log('WebSocket connection closed.');
        }
      });

    React.useEffect(()=>{
      LoadNeighbourhood(clickedNode, props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl, anthillGraph, anthillGraphBare, maxRelRootDepth).then((response)=>{
        setGraph(response[0]);
        var altNode = response[0][response[1]].sentTreeVote;
        // parent is used for leaving the tree, so it is not actually the parent, but the node we swithc to if we leave the tree
        if (altNode== address1) {
          altNode = response[0][response[1]].recTreeVotes[0];
        }
        setAltNode(altNode);
        // setAnthillGraphNum(response[2]); 
      })
    }, [clickedNode, props.account, props.isAccountInGraph, props.setIsAccountInGraph, props.backendUrl, anthillGraph, anthillGraphBare, maxRelRootDepth]);
  


    return GraphSVG({
      "account":props.account, 
      "chainId":props.chainId,
      "isAccountInGraph": props.isAccountInGraph,
      "setIsAccountInGraph": props.setIsAccountInGraph,
      // here we use the state variable and not the props variable for clickedNode
      "clickedNodeId": clickedNode,
      "setClickedNodeId": setClickedNode,
      "AnthillContract": props.AnthillContract,
      "graph": graph, 
      "altNode":altNode,
      "maxRelRootDepth": maxRelRootDepth,
      "anthillGraph": anthillGraph,
      "anthillGraphBare": anthillGraphBare})
}