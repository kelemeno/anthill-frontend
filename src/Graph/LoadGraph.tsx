// this is where we store the functions that load the graph from the backend.

import { max } from "d3";
import { getBareNodeFromServer, getIsNodeInGraph, getMaxRelRootDepth, getRandomLeaf, getNodeFromServer} from "../ExternalConnections/BackendGetters"
import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering , isVotable, isDagVote, isSwitchable} from "./GraphBase";

//// utils, checkers



export function serveParent(voterId: string, anthillGraphServe: GraphData ): string{
  return anthillGraphServe[voterId].sentTreeVote;
}



//// check saved and savers

// We need to save the neighbourhood when clicking on a node
// We need to save the nodes that we will render: the clicked node with id, and the rec/sent tree/Dag votes. 
// for these nodes we also want to know if we can DagVote on them, i.e, are they in the original neighbourhood. 
// for this we can load the relative root from the database, and check if it is in the parents of the original accounts relative root.  
async function checkSaveNeighbourHood(backendUrl: string, id : string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number) {
  
  // if we already have it saved, we don't need to do anything.
  if ((anthillGraph[id])) {
    return ;
  }

  // we don't have the node
  var node  = await getNodeFromServer(backendUrl, id); 
  anthillGraph[id]= node as NodeData; 
  anthillGraphBare[id]= node as NodeDataBare;

  // we have to get all the parents up to 2 * maxRelRootDepth
  await getBareParentsForDepth(backendUrl, node.sentTreeVote, 2*maxRelRootDepth, anthillGraph, anthillGraphBare, maxRelRootDepth);

  // we also have to save the rec/sent tree/Dag votes
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recTreeVotes, anthillGraph, anthillGraphBare, maxRelRootDepth);
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].sentDagVotes.map((r)=>r.id), anthillGraph, anthillGraphBare, maxRelRootDepth);
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recDagVotes.map((r)=> r.id), anthillGraph, anthillGraphBare, maxRelRootDepth);


 
}

async function getBareParentsForDepth(backendUrl: string, sentTreeVote :string, depthDiff: number, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  if ((sentTreeVote != "0x0000000000000000000000000000000000000001") && (sentTreeVote != "")){
    await checkSaveBareNode(backendUrl, sentTreeVote, anthillGraph, anthillGraphBare, maxRelRootDepth);
    var newBareNode = anthillGraphBare[sentTreeVote];
    if ((depthDiff>0) && (newBareNode.sentTreeVote != "0x0000000000000000000000000000000000000001") ){
      await getBareParentsForDepth(backendUrl, newBareNode.sentTreeVote, depthDiff-1, anthillGraph, anthillGraphBare, maxRelRootDepth);
    }
  }
}

async function checkSaveBareNodeArray(backendUrl: string, ids: string[], anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  for (const i in ids) {
    if ((ids[i] != "")&&(ids[i] != "0x0000000000000000000000000000000000000001")){
      await checkSaveBareNode(backendUrl, ids[i], anthillGraph, anthillGraphBare, maxRelRootDepth);
    }
  }
  
}

async function checkSaveBareNode(backendUrl: string, id: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number){
  if ((anthillGraphBare[id] === undefined) ){
    var node = await getBareNodeFromServer(backendUrl, id);
    anthillGraphBare[node.id]= node as NodeDataBare;
  } 
}

////// selecting the graph to render


function renderingNodeData(node: NodeData, account: string, maxRelRootDepth: number, anthillGraph: GraphData, anthillGraphBare: GraphDataBare): NodeDataRendering {
  var nodeRendering = {} as NodeDataRendering;
  nodeRendering.id = node.id;

  if (node.name == "Name") {
    nodeRendering.name = node.id.slice(0, 2)+".."+node.id.slice((node.id.length)-3);
  } else {
    nodeRendering.name = node.name;
  }

  nodeRendering.currentRep = node.currentRep;
  nodeRendering.depth = node.depth;
  nodeRendering.relRoot = node.relRoot;
  nodeRendering.recTreeVotes = node.recTreeVotes;
  nodeRendering.sentTreeVote = node.sentTreeVote;

  nodeRendering.parentIds =[];
  // we add sentTreeVote along with the parent chain. 

  nodeRendering.parentIds = nodeRendering.parentIds.concat(node.sentDagVotes.map(r=>r.id).filter(r=>r!=node.sentTreeVote));

  // we will eventually want these last three fields to be part of nodeDataBare, and to be calculated when loading, not when selecting. 
  nodeRendering.isVotable = isVotable(account, node as NodeDataBare, maxRelRootDepth, anthillGraph, anthillGraphBare);
  
  nodeRendering.isDagVote = false;
  if (nodeRendering.isVotable ){
    nodeRendering.isDagVote = isDagVote(account, node.id,  maxRelRootDepth, anthillGraph, anthillGraphBare);
  }
  nodeRendering.isSwitchable = isSwitchable(account, node.id,node.currentRep, maxRelRootDepth, anthillGraph, anthillGraphBare);
  return nodeRendering;
}

function renderingNodeDataBare(node: NodeDataBare, account:string, maxRelRootDepth: number, anthillGraph: GraphData, anthillGraphBare: GraphDataBare): NodeDataRendering {
  var nodeRendering = {} as NodeDataRendering;
  // console.log("node in renderingNodeDataBare", node)
  nodeRendering.id = node.id;
  if (node.name == "Name") {
    nodeRendering.name = node.id.slice(0, 2)+".."+node.id.slice((node.id.length)-3);
  } else {
    // console.log("name", node.name, node.name.length)
    if (node.name.length < 7) {
      nodeRendering.name = node.name;
    } else {
      nodeRendering.name = node.name.slice(0, 6)+"..";
    }
  }
  
  nodeRendering.currentRep = node.currentRep;
  nodeRendering.depth = node.depth;
  nodeRendering.relRoot = node.relRoot;
  nodeRendering.recTreeVotes = node.recTreeVotes;
  nodeRendering.sentTreeVote = node.sentTreeVote;

  nodeRendering.parentIds = [];

  // we will eventually want these last three fields to be part of nodeDataBare, and to be calculated when loading, not when selecting. 
  nodeRendering.isVotable = isVotable(account, node as NodeDataBare, maxRelRootDepth, anthillGraph, anthillGraphBare);
  nodeRendering.isDagVote = false;
  if (nodeRendering.isVotable ){
    nodeRendering.isDagVote = isDagVote(account, node.id,  maxRelRootDepth, anthillGraph, anthillGraphBare);
  }
  nodeRendering.isSwitchable = isSwitchable(account, node.id,node.currentRep, maxRelRootDepth, anthillGraph, anthillGraphBare);

  return nodeRendering;
}


// we return a partial graph from the whole graph, focused on node with id. Here the hard part is selecting which parts to include. 
// we fully download every node we render. If it is in our data 
function selectNeighbourhood(id : string, account:string, maxRelRootDepth:number, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, ) : GraphDataRendering{
  var neighbourhood = {} as GraphDataRendering;
  // we are focusing on this node, so we display all its connections.
  var node = anthillGraph[id];
  // console.log("id for", id,  anthillGraph, anthillGraph[id], node)
  neighbourhood[id] = renderingNodeData(node, account, maxRelRootDepth, anthillGraph, anthillGraphBare);

  // add sent dag votes
  node.sentDagVotes.map ((sDagVote)=>{
      var recipient = anthillGraphBare[sDagVote.id];      
      neighbourhood[recipient.id] =  renderingNodeDataBare(recipient, account, maxRelRootDepth, anthillGraph, anthillGraphBare);
    }
  )

  var parent = node as NodeDataBare;
  // add tree parents
  for (var i = 0; i < maxRelRootDepth; i++) { 
    if ((parent.sentTreeVote == "") || (parent.sentTreeVote == "0x0000000000000000000000000000000000000001")){
      break;
    }

    var newParentId = parent.sentTreeVote;

    const newParent :NodeDataRendering= renderingNodeDataBare(anthillGraphBare[newParentId], account, maxRelRootDepth, anthillGraph, anthillGraphBare); 

    // we are mixing dag and tree votes, we check if this was already added as a dag vote to node, if so we remove it, as we want it in the parent chain
    // special case, we might remove and re-add the vote from node to its parent 
    if (neighbourhood[newParentId] != undefined) {
      // remove the extra node
      delete neighbourhood[newParentId];

      // remove link to extra vote
      neighbourhood[id].parentIds.map((parentId, i)=>{
        if (parentId == newParentId) {
          neighbourhood[id].parentIds.splice(i, 1);
        }
      })

    }
    neighbourhood[newParentId] = newParent;
    neighbourhood[parent.id].parentIds.push(newParentId);
    neighbourhood[parent.id].sentTreeVote = newParentId;
    var parent = anthillGraphBare[newParentId];
  }

  // add rec dag votes
  // console.log("recDagvotes", node.recDagVotes)
  if (node.recDagVotes.length != 0) {
    node.recDagVotes.map((rDagVote)=>{
      var voter = anthillGraphBare[rDagVote.id];
      // console.log("voter", voter)
      if (voter != undefined) {
        neighbourhood[voter.id] =  renderingNodeDataBare(voter, account, maxRelRootDepth, anthillGraph, anthillGraphBare);
        neighbourhood[voter.id].parentIds.push(id);
      }
    })
  }

  // add rec tree votes
  // console.log("recTreeVotes", node.recTreeVotes)
  if (node.recTreeVotes.length != 0) {
    node.recTreeVotes.map((id)=>{
      var voter = anthillGraphBare[id];  
      // console.log("id in recTreevotes", id)
      if ((neighbourhood[id] == undefined) && (voter != undefined)) {
        neighbourhood[id] =  renderingNodeDataBare(voter, account, maxRelRootDepth, anthillGraph, anthillGraphBare);
        neighbourhood[id].parentIds.push(node.id);
      }
    })
  }

  return neighbourhood;
}


// every graph we load is focused on a node, that was clicked on. 
export async function LoadNeighbourhood(id: string, account: string, accountInGraph :boolean, setAccountInGraph: any, backendUrl: string, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, maxRelRootDepth:number): Promise<[GraphDataRendering, string]> {

  maxRelRootDepth =  await getMaxRelRootDepth(backendUrl, ); 
  
  if ((id === "Enter")|| (id === undefined) || (id === "")){
       id = await getRandomLeaf(backendUrl, );
  } else {
    // console.log("getIsNode 2", id === "")
    var isIdInGraph = await getIsNodeInGraph(backendUrl, id);
    if (!isIdInGraph){  id = await getRandomLeaf(backendUrl, );}
  }


  var isAccountInGraph: boolean
  if ((account !== undefined) || (account !== "")){
    // console.log("getIsNode 3")

    isAccountInGraph = await getIsNodeInGraph(backendUrl, account);
  } else {
    isAccountInGraph = false;
  }

  if (isAccountInGraph){
    // we save the account into our graph. 
    await checkSaveNeighbourHood(backendUrl, account, anthillGraph, anthillGraphBare, maxRelRootDepth);
  }
  
  // we want to XOR
  if ((isAccountInGraph) && (!accountInGraph)){
    setAccountInGraph(true);
  } else if ((!isAccountInGraph) && (accountInGraph)){
    setAccountInGraph(false);
  }


  // we save the data into our Database
  await checkSaveNeighbourHood(backendUrl, id, anthillGraph, anthillGraphBare, maxRelRootDepth)
  // console.log("anthillGraph in LoadN for id:  ", id ,  anthillGraph)
  // console.log("anthillGraphBare in Load N for id:",id,  anthillGraphBare)
  
  var newGraphDataRendering = {} as GraphDataRendering;
  // this collect the elements it into a renderable graph
  newGraphDataRendering = selectNeighbourhood(id, account, maxRelRootDepth,  anthillGraph, anthillGraphBare)
  // console.log("newGraphDataRendering: ", newGraphDataRendering)
  return [newGraphDataRendering, id];

}