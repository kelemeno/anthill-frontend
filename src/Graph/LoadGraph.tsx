// this is where we store the functions that load the graph from the backend.

// import { max } from "d3";
// import { Graph } from "@antv/x6";
import { getBareNodeFromServer,  getNodeFromServer} from "../ExternalConnections/BackendGetters"
import { NodeData, NodeDataBare, GraphData, GraphDataBare } from "./GraphBase";


//// utils, checkers



export function serveParent(voterId: string, anthillGraphServe: GraphData ): string{
  return anthillGraphServe[voterId].sentTreeVote;
}



//// check saved and savers

// We need to save the neighbourhood when clicking on a node
// We need to save the nodes that we will render: the clicked node with id, and the rec/sent tree/Dag votes. 
// for these nodes we also want to know if we can DagVote on them, i.e, are they in the original neighbourhood. 
// for this we can load the relative root from the database, and check if it is in the parents of the original accounts relative root.  
export async function CheckSaveNeighbourHoodWithParentChain(backendUrl: string, id : string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number) {
  
  await CheckSaveNode(backendUrl, id, anthillGraph, anthillGraphBare, maxRelRootDepth);

  // we have to get all the parents up to 2 * maxRelRootDepth
  await getBareParentsForDepth(backendUrl, anthillGraph[id].sentTreeVote, 2*maxRelRootDepth, anthillGraph, anthillGraphBare, maxRelRootDepth);

  // we also have to save the rec/sent tree/Dag votes
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recTreeVotes, anthillGraph, anthillGraphBare, maxRelRootDepth);
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].sentDagVotes.map((r)=>r.id), anthillGraph, anthillGraphBare, maxRelRootDepth);
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recDagVotes.map((r)=> r.id), anthillGraph, anthillGraphBare, maxRelRootDepth);
}

async function getBareParentsForDepth(backendUrl: string, sentTreeVote :string, depthDiff: number, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  if ((sentTreeVote !== "0x0000000000000000000000000000000000000001") && (sentTreeVote !== "")){
    await checkSaveBareNode(backendUrl, sentTreeVote, anthillGraph, anthillGraphBare, maxRelRootDepth);
    var newBareNode = anthillGraphBare[sentTreeVote];
    if ((depthDiff>0) && (newBareNode.sentTreeVote !== "0x0000000000000000000000000000000000000001") ){
      await getBareParentsForDepth(backendUrl, newBareNode.sentTreeVote, depthDiff-1, anthillGraph, anthillGraphBare, maxRelRootDepth);
    }
  }
}

async function checkSaveBareNodeArray(backendUrl: string, ids: string[], anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  for (const i in ids) {
    if ((ids[i] !== "")&&(ids[i] !== "0x0000000000000000000000000000000000000001")){
      await checkSaveBareNode(backendUrl, ids[i], anthillGraph, anthillGraphBare, maxRelRootDepth);
    }
  }
  
}

export async function CheckSaveNode(backendUrl: string, id: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  if ((anthillGraph[id] === undefined) ){
    var node = await getNodeFromServer(backendUrl, id);
    anthillGraph[node.id]= node as NodeData;
    anthillGraphBare[id]= node as NodeDataBare;
  } 
}

async function checkSaveBareNode(backendUrl: string, id: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  if ((anthillGraphBare[id] === undefined) ){
    var node = await getBareNodeFromServer(backendUrl, id);
    anthillGraphBare[node.id]= node as NodeDataBare;
  } 
}

export async function CheckSaveWholeGraph(backendUrl: string, id: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  
  // finding root
  var potRoot = id;
  await CheckSaveNode(backendUrl, potRoot, anthillGraph, anthillGraphBare, maxRelRootDepth);
  while (anthillGraph[potRoot].relRoot !== potRoot) {
    await CheckSaveNode(backendUrl, anthillGraph[potRoot].relRoot, anthillGraph, anthillGraphBare, maxRelRootDepth);
    potRoot = anthillGraph[potRoot].relRoot;
  }

  await checkSaveChildrenRecursive(backendUrl, potRoot, anthillGraph, anthillGraphBare, maxRelRootDepth);
}
  
async function checkSaveChildrenRecursive(backendUrl: string, id: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  await CheckSaveNode(backendUrl, id, anthillGraph, anthillGraphBare, maxRelRootDepth);
  for (const i in anthillGraph[id].recTreeVotes) {
    await checkSaveChildrenRecursive(backendUrl, anthillGraph[id].recTreeVotes[i], anthillGraph, anthillGraphBare, maxRelRootDepth);
  }
}


