// import { toChecksumAddress } from 'web3-utils'
 
import {getAnthillGraphNum, getBareNodeFromServer, getIsNodeInGraph, getMaxRelRootDepth, getRandomLeaf, getNodeFromServer} from "../../ExternalConnections/BackendGetters"
import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering } from "./GraphBase";

 // variables 

 var maxRelRootDepth = 0;
 var anthillGraphNum = 0;

 var anthillGraph : GraphData = {};
 var anthillGraphBare : GraphDataBare = {};

 var anthillGraphServe : GraphData = {};
  var anthillGraphBareServe : GraphDataBare = {};

 var outdated= true; 




 


//// utils, checkers

async function checkAnthillGraphNum(backendUrl: string, ): Promise<boolean>{
  var newAnthillGraphNum = await getAnthillGraphNum(backendUrl);
  outdated = (newAnthillGraphNum != anthillGraphNum)   
  return outdated
} 

export function serveParent(voterId: string): string{
  return anthillGraphServe[voterId].sentTreeVote;
}



//// check saved and savers

// We need to save the neighbourhood when clicking on a node
// We need to save the nodes that we will render: the clicked node with id, and the rec/sent tree/Dag votes. 
// for these nodes we also want to know if we can DagVote on them, i.e, are they in the original neighbourhood. 
// for this we can load the relative root from the database, and check if it is in the parents of the original accounts relative root.  
async function checkSaveNeighbourHood(backendUrl: string, id : string) {


  (await checkAnthillGraphNum(backendUrl));
  
  if (outdated){
    
    console.log("we are outdated, clearing graphs")
    anthillGraphNum = await getAnthillGraphNum(backendUrl);
    anthillGraph = {} as GraphData;
    anthillGraphBare = {} as GraphDataBare;
  
  } else if ((anthillGraphServe[id])) {
    return ;
  }

  // we don't have the node, or it is not up to date.
  var node  = await getNodeFromServer(backendUrl, id); 
  anthillGraph[node.id]= node as NodeData; 
  anthillGraphBare[node.id]= node as NodeDataBare;

  await getBareParentsForDepth(backendUrl, node.sentTreeVote, 2*maxRelRootDepth);

  // saving each node
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recTreeVotes);
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].sentDagVotes.map((r)=>r.id));
  await checkSaveBareNodeArray(backendUrl, anthillGraph[id].recDagVotes.map((r)=> r.id));


  anthillGraphServe = anthillGraph;
  anthillGraphBareServe = anthillGraphBare;
}

async function getBareParentsForDepth(backendUrl: string, sentTreeVote :string, depthDiff: number){
  if ((sentTreeVote != "0x0000000000000000000000000000000000000001") && (sentTreeVote != "")){
    await checkSaveBareNode(backendUrl, sentTreeVote);
    var newBareNode = anthillGraphBare[sentTreeVote];
    if ((depthDiff>0) && (newBareNode.sentTreeVote != "0x0000000000000000000000000000000000000001") ){
      await getBareParentsForDepth(backendUrl, newBareNode.sentTreeVote, depthDiff-1);
    }
  }
}

async function checkSaveBareNodeArray(backendUrl: string, ids: string[]){
  for (const i in ids) {
    if ((ids[i] != "")&&(ids[i] != "0x0000000000000000000000000000000000000001")){
      await checkSaveBareNode(backendUrl, ids[i]);
    }
  }
  
}

async function checkSaveBareNode(backendUrl: string, id: string){
  if ((anthillGraphBare[id] === undefined) ){
    var node = await getBareNodeFromServer(backendUrl, id);
    anthillGraphBare[node.id]= node as NodeDataBare;
  } 
}

////// main entrypoint and rendering/serving

// every graph we load is focused on a node, that was clicked on. 
export async function LoadNeighbourhood(id: string, account: string, accountInGraph :boolean, setAccountInGraph: any, backendUrl: string, ): Promise<[GraphDataRendering, string, number]> {
  var newGraphDataRendering = {} as GraphDataRendering;

  maxRelRootDepth =  await getMaxRelRootDepth(backendUrl, ); 
  
  if (id == "Enter"){
       id = await getRandomLeaf(backendUrl, );
  } else {
    var isIdInGraph = await getIsNodeInGraph(backendUrl, id);
    if (!isIdInGraph){  id = await getRandomLeaf(backendUrl, );}
  }


  var isAccountInGraph = await getIsNodeInGraph(backendUrl, account );
  if (isAccountInGraph){
    await checkSaveNeighbourHood(backendUrl, account);
  }
  
  // we want to XOR
  if ((isAccountInGraph) && (!accountInGraph)){
    setAccountInGraph(true);
  } else if ((!isAccountInGraph) && (accountInGraph)){
    setAccountInGraph(false);
  }


  // this saves the data into our Database
  await checkSaveNeighbourHood(backendUrl, id)
  // console.log("anthillGraph in LoadN for id:  ", id ,  anthillGraph)
  // console.log("anthillGraphBare in Load N for id:",id,  anthillGraphBare)
  
  // this collect the elements it into a renderable graph
  newGraphDataRendering = renderNeighbourhood(id)
  // console.log("newGraphDataRendering: ", newGraphDataRendering)
  return [newGraphDataRendering, id, anthillGraphNum];

}


// we return a partial graph from the whole graph, focused on node with id. Here the hard part is selecting which parts to include. 
// we fully download every node we render. If it is in our data 
function renderNeighbourhood(id : string) : GraphDataRendering{
  var neighbourhood = {} as GraphDataRendering;
  // we are focusing on this node, so we display all its connections.
  var node = anthillGraphServe[id];
  // console.log("id for", id,  anthillGraph, anthillGraph[id], node)
  neighbourhood[id] = renderingNodeData(node);

  // add sent dag votes
  node.sentDagVotes.map ((sDagVote)=>{
      var recipient = anthillGraphBareServe[sDagVote.id];      
      neighbourhood[recipient.id] =  renderingNodeDataBare(recipient);
    }
  )

  var parent = node as NodeDataBare;
  // add tree parents
  for (var i = 0; i < maxRelRootDepth; i++) { 
    if ((parent.sentTreeVote == "") || (parent.sentTreeVote == "0x0000000000000000000000000000000000000001")){
      break;
    }

    var newParentId = parent.sentTreeVote;

    const newParent :NodeDataRendering= renderingNodeDataBare(anthillGraphBareServe[newParentId]); 

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
    var parent = anthillGraphBareServe[newParentId];
  }

  // add rec dag votes
  // console.log("recDagvotes", node.recDagVotes)
  if (node.recDagVotes.length != 0) {
    node.recDagVotes.map((rDagVote)=>{
      var voter = anthillGraphBareServe[rDagVote.id];
      // console.log("voter", voter)
      if (voter != undefined) {
        neighbourhood[voter.id] =  renderingNodeDataBare(voter);
        neighbourhood[voter.id].parentIds.push(id);
      }
    })
  }

  // add rec tree votes
  // console.log("recTreeVotes", node.recTreeVotes)
  if (node.recTreeVotes.length != 0) {
    node.recTreeVotes.map((id)=>{
      var voter = anthillGraphBareServe[id];  
      // console.log("id in recTreevotes", id)
      if ((neighbourhood[id] == undefined) && (voter != undefined)) {
        neighbourhood[id] =  renderingNodeDataBare(voter);
        neighbourhood[id].parentIds.push(node.id);
      }
    })
  }

  return neighbourhood;
}

function renderingNodeData(node: NodeData): NodeDataRendering {
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
  return nodeRendering;
}

function renderingNodeDataBare(node: NodeDataBare): NodeDataRendering {
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
  return nodeRendering;
}

