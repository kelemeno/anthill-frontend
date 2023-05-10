// this is where we store the whole graph, update it when necessary, do computations on it, store the clicked node, and pass the subgraph that we want to visualise to the graphSVG component
// this means that when we connect our wallet, we reload the graph. This is a bit unnecessary, but ok, as we don't often change the wallet. 
// this component rerenders on clicks, as this is where we store the clicked node, and select the subgraph to display

import React, {useState} from 'react';

import useWebSocket from 'react-use-websocket';

import {JoinTreeRandomlyButton, JoinTreeRandomlyCheck, GoHomeButton, TreeOrRepModeSwitch} from "../Buttons/MainAppButtons"

import { GraphSVG } from "./GraphSVG/GraphSVG"
import { GraphData, GraphDataBare, GraphDataRendering , address1} from "./GraphBase"
import {  CheckSaveNeighbourHoodWithParentChain , CheckSaveNode, CheckSaveWholeGraph} from './LoadGraph';
import { getMaxRelRootDepth, getIsNodeInGraph } from '../ExternalConnections/BackendGetters';
import {  SelectSentRecDagVotes, SelectWholeGraph } from './SubGraphSelectors';


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
  // console.log("getting account", isAccountInGraph)
  if  (isAccountInGraph===true){
    // console.log("getting account1", account)

    // here we need the parent chain, as we will check proximity based on that 
    await CheckSaveNeighbourHoodWithParentChain (backendUrl, account, anthillGraph, anthillGraphBare, maxRelRootDepth)
  }
}

const gettingClickedNode = async (
    account : string, 
    isAccountInGraph: boolean,
    treeMode:boolean,
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

    
    var graphToRender = {} as GraphDataRendering

    if (treeMode){
      await CheckSaveWholeGraph(backendUrl, clickedNode, anthillGraph, anthillGraphBare, maxRelRootDepth)
      
        // console.log("clickedNode", clickedNode, anthillGraph)
      graphToRender = SelectWholeGraph(clickedNode, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare)
    } else {
      await CheckSaveNode(backendUrl, clickedNode, anthillGraph, anthillGraphBare, maxRelRootDepth)
      graphToRender = SelectSentRecDagVotes(clickedNode, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare)
    }

    if (!deepEqual(graphToRender, graphDisplayed)){
      setGraphDisplayed(graphToRender)
          
      // altNode is used for leaving the tree, so it is the parent or if there is no parent then a child. 
      var newAltNode = graphToRender[clickedNode].sentTreeVote;
      if (newAltNode === address1) {
        newAltNode = graphToRender[clickedNode].recTreeVotes[0];
      }
      if (altNode !== newAltNode) {setAltNode(newAltNode)};
    };
      
    
  } 

}

const loadGraphDetails = async (account : string, isAccountInGraph: boolean, setIsAccountInGraph:any, treeMode:boolean, clickedNode:string, altNode:string, setAltNode:any, anthillGraph: GraphData, anthillGraphBare: GraphDataBare, maxRelRootDepth:number, setMaxRelRootDepth:any,  graphDisplayed:GraphDataRendering, setGraphDisplayed:any, backendUrl:string)=>{
  // console.log("in loadGraphDetails", account, isAccountInGraph,  clickedNode, altNode,  maxRelRootDepth,  backendUrl)
  // if (account !== undefined)  {
  //   var res = await getIsNodeInGraph(backendUrl, account)
  //   if (res!==isAccountInGraph) {setIsAccountInGraph(res)};
  //   console.log("isAccountInGraph", isAccountInGraph, account)
  // }
  await gettingMaxRelRootDepth(backendUrl, maxRelRootDepth, setMaxRelRootDepth)
  await gettingAccount(account, isAccountInGraph, anthillGraph, anthillGraphBare, maxRelRootDepth, backendUrl)
  await gettingClickedNode( account, isAccountInGraph, treeMode, clickedNode, altNode, setAltNode, anthillGraph, anthillGraphBare, maxRelRootDepth, graphDisplayed, setGraphDisplayed, backendUrl)
}

       

export const Graph = (props: {"account":string, "chainId":number, "clickedNode":string,"setClickedNode":any, "treeMode":boolean, "AnthillContract": any, "backendUrl": string, "wsUrl":string }) => {
    // variables 


    // const navigate = useNavigate();
    var [isAccountInGraph, setIsAccountInGraph] = useState(false);

    var [maxRelRootDepth, setMaxRelRootDepth] =useState(0);
    // the nodes we have clicked on, so have fully loaded
    var [anthillGraph, setAnthillGraph] = useState({}as GraphData);
    // the nodes we only display, so have the minimum info
    var [anthillGraphBare, setAnthillGraphBare]  = useState({} as GraphDataBare);

    var [clickedNode, setClickedNode] = React.useState(props.clickedNode);

    var [graphDisplayed, setGraphDisplayed] = useState( {"id":{"id":props.clickedNode, "name":props.clickedNode, "totalWeight": 0, "currentRep": 1, "depth":0, "relRoot":"Enter", "sentTreeVote": "1", "parentIds": [], "recTreeVotes": [], "isVotable":false, "isDagVote":false, "isSwitchable": false}} as GraphDataRendering);

    var [altNode, setAltNode] = useState("");

    var clearingGraph = async () => {
      if (props.account !== undefined)  {
        await getIsNodeInGraph(props.backendUrl, props.account).then((res)=>{if (res!==isAccountInGraph) {setIsAccountInGraph(res)};})
      } else {
        if (isAccountInGraph) {setIsAccountInGraph(false)}
      }

      setAnthillGraph({});
      setAnthillGraphBare({});
      
    }

    const {sendMessage, } = useWebSocket(props.wsUrl, {
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

    loadGraphDetails(props.account, isAccountInGraph, setIsAccountInGraph, props.treeMode, clickedNode, altNode, setAltNode, anthillGraph, anthillGraphBare, maxRelRootDepth, setMaxRelRootDepth, graphDisplayed, setGraphDisplayed, props.backendUrl)

    React.useEffect(()=>{

      // console.log("clickedNode", clickedNode, "isAccountInGraph", isAccountInGraph)
      if (clickedNode === "Enter"){
        setClickedNode(props.clickedNode)
      }
      
      gettingAccount(props.account, isAccountInGraph, anthillGraph, anthillGraphBare, maxRelRootDepth, props.backendUrl)

    }, [clickedNode, props.clickedNode, props.account, isAccountInGraph, props.backendUrl, anthillGraph, anthillGraphBare, maxRelRootDepth, graphDisplayed, props.treeMode, altNode]);

    // I added this so that when we connect the account, the buttons on the popups for the graph change. Currently we calculate the buttons in SubGraphSelection, but this will be moved to LoadGraph, so that we only do it once. 
    // ideally we will seperate these button details from the graph itself, so that we do not relead when connecting the account. 
    React.useEffect(()=>{
      clearingGraph();
    }, [props.account])
  
    const props2 = { "account":props.account, 
    "chainId":props.chainId,
    "isAccountInGraph": isAccountInGraph,
    "setIsAccountInGraph": setIsAccountInGraph,
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
      <div className="insideButton" style={{textAlign:"left"}}>
        <GoHomeButton account={props.account} isAccountInGraph={isAccountInGraph} setClickedNode= {setClickedNode}/>
        {(JoinTreeRandomlyCheck(isAccountInGraph, props.account ))&&(<JoinTreeRandomlyButton AnthillContract= {props.AnthillContract} chainId={props.chainId} account={props.account} isAccountInGraph= {isAccountInGraph} setClickedNode= {setClickedNode} setIsAccountInGraph={setIsAccountInGraph} backendUrl={props.backendUrl}/>)}
      </div>
      <GraphSVG {...props2}/>
    </>
    )
}