// this is where we store the whole graph, update it when necessary, do computations on it, store the clicked node, and pass the subgraph that we want to visualise to the graphSVG component
// this means that when we connect our wallet, we reload the graph. This is a bit unnecessary, but ok, as we don't often change the wallet. 
// this component rerenders on clicks, as this is where we store the clicked node, and select the subgraph to display

import React, {useState} from 'react';

import useWebSocket from 'react-use-websocket';

import {JoinTreeRandomlyButton,  GoHomeButton} from "../Buttons/MainAppButtons"

import { GraphSVG } from "./GraphSVG/GraphSVG"
import { GraphData, GraphDataBare, GraphDataRendering , address1} from "./GraphBase"
import { LoadNeighbourhood , CheckSaveNeighbourHood } from './LoadGraph';
import { getMaxRelRootDepth } from '../ExternalConnections/BackendGetters';

function deepEqual(x:any, y:any):boolean {
    const ok = Object.keys, tx = typeof x, ty = typeof y;
    return x && y && tx === 'object' && tx === ty ? (
      ok(x).length === ok(y).length &&
        ok(x).every(key => deepEqual(x[key], y[key]))
    ) : (x === y);
  }

const gettingMaxRelRootDepth = async (backendUrl: string, maxRelRootDepth:number, setMaxRelRootDepth: any ) => {
  if (maxRelRootDepth===0){
    getMaxRelRootDepth(backendUrl).then(
      
      (res)=>{
        if (res !== maxRelRootDepth){
          setMaxRelRootDepth(res)
        }
      }
    )
  }
}

const gettingAccount = async (account : string, isAccountInGraph: boolean, anthillGraph: GraphData, anthillGraphBare: GraphDataBare, maxRelRootDepth:number, backendUrl:string)=>{ 
  // console.log("should we get account?", account, isAccountInGraph)
  if  (isAccountInGraph===true){
    // console.log("getting account1", account)
    await CheckSaveNeighbourHood (backendUrl, account, anthillGraph, anthillGraphBare, maxRelRootDepth)
  }
}

const gettingClickedNode = async (account : string, 
                                  isAccountInGraph: boolean,
                                  clickedNode:string,
                                  altNode: string, 
                                  setAltNode:any, 
                                  anthillGraph: GraphData,
                                  anthillGraphBare: GraphDataBare,
                                  maxRelRootDepth:number, 
                                  graphDisplayed: GraphDataRendering,
                                  setGraphDisplayed: any, 
                                  backendUrl:string )=>{
  if (clickedNode !== "Enter") {
    // console.log("getting clickednode", clickedNode)
    await CheckSaveNeighbourHood(backendUrl, clickedNode, anthillGraph, anthillGraphBare, maxRelRootDepth)
    
      // console.log("clickedNode", clickedNode, anthillGraphBare)
    const response = await  LoadNeighbourhood(clickedNode, account, isAccountInGraph,  backendUrl, anthillGraph, anthillGraphBare, maxRelRootDepth)
        
    if (!deepEqual(response[0], graphDisplayed)){
      setGraphDisplayed(response[0])
          
      // altNode is used for leaving the tree, so it is the parent or if there is no parent then a child. 
      var newAltNode = response[0][response[1]].sentTreeVote;
      if (newAltNode === address1) {
        newAltNode = response[0][response[1]].recTreeVotes[0];
      }
      if (altNode !== newAltNode) {setAltNode(newAltNode)};
    };
      
    
  } 

}

const loadGraphDetails = async (account : string, isAccountInGraph: boolean,  clickedNode:string, altNode:string, setAltNode:any, anthillGraph: GraphData, anthillGraphBare: GraphDataBare, maxRelRootDepth:number, setMaxRelRootDepth:any,  graphDisplayed:GraphDataRendering, setGraphDisplayed:any, backendUrl:string)=>{
  // console.log("in loadGraphDetails", account, isAccountInGraph,  clickedNode, altNode,  maxRelRootDepth,  backendUrl)
  await gettingMaxRelRootDepth(backendUrl, maxRelRootDepth, setMaxRelRootDepth)
  await gettingAccount(account, isAccountInGraph, anthillGraph, anthillGraphBare, maxRelRootDepth, backendUrl)
  await gettingClickedNode( account, isAccountInGraph,  clickedNode, altNode, setAltNode, anthillGraph, anthillGraphBare, maxRelRootDepth, graphDisplayed, setGraphDisplayed, backendUrl)
}

       

export const Graph = (props: {"account":string, "chainId":number, "isAccountInGraph":boolean, "setIsAccountInGraph":any, "clickedNode":string,"setClickedNode":any,  "AnthillContract": any, "backendUrl": string, "wsUrl":string }) => {
    // variables 


    // const navigate = useNavigate();

    var [maxRelRootDepth, setMaxRelRootDepth] =useState(0);
    // the nodes we have clicked on, so have fully loaded
    var [anthillGraph, setAnthillGraph] = useState({}as GraphData);
    // the nodes we only display, so have the minimum info
    var [anthillGraphBare, setAnthillGraphBare]  = useState({} as GraphDataBare);

    var [clickedNode, setClickedNode] = React.useState(props.clickedNode);

    var [graphDisplayed, setGraphDisplayed] = useState( {"id":{"id":props.clickedNode, "name":props.clickedNode, "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": [], "isVotable":false, "isDagVote":false, "isSwitchable": false}} as GraphDataRendering);

    var [altNode, setAltNode] = useState("");
    
    loadGraphDetails(props.account, props.isAccountInGraph,  clickedNode, altNode, setAltNode, anthillGraph, anthillGraphBare, maxRelRootDepth, setMaxRelRootDepth, graphDisplayed, setGraphDisplayed, props.backendUrl)

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
      // console.log("clickedNode", clickedNode, "props.isAccountInGraph", props.isAccountInGraph)
      if (clickedNode === "Enter"){
        setClickedNode(props.clickedNode)
      }
      
      if (props.isAccountInGraph===true){
        // console.log("getting account1", props.account)
        CheckSaveNeighbourHood(props.backendUrl, props.account, anthillGraph, anthillGraphBare, maxRelRootDepth)
      }

    }, [clickedNode, props.clickedNode, props.account, props.isAccountInGraph, props.backendUrl, anthillGraph, anthillGraphBare, maxRelRootDepth]);
  
    const props2 = { "account":props.account, 
    "chainId":props.chainId,
    "isAccountInGraph": props.isAccountInGraph,
    "setIsAccountInGraph": props.setIsAccountInGraph,
    // here we use the state variable and not the props variable for clickedNode
    "clickedNode": clickedNode,
    "setClickedNode": setClickedNode,
    "AnthillContract": props.AnthillContract,
    "graph": graphDisplayed, 
    "altNode":altNode,
    "maxRelRootDepth": maxRelRootDepth,
    "anthillGraph": anthillGraph,
    "anthillGraphBare": anthillGraphBare}

    return (
    <>
      <div style={{textAlign:"left"}}>
        <GoHomeButton account={props.account} isAccountInGraph={props.isAccountInGraph} setClickedNode= {setClickedNode}/>
        <JoinTreeRandomlyButton AnthillContract= {props.AnthillContract} chainId={props.chainId} account={props.account} isAccountInGraph= {props.isAccountInGraph} setClickedNode= {setClickedNode} backendUrl={props.backendUrl}/>
      </div>
      <GraphSVG {...props2}/>
    </>
    )
}