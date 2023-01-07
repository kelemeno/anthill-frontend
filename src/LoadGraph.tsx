import axios from "axios";
import { max } from "d3";

 

 type DagVote = {'id': string, 'weight': number, 'posInOther': number}


 export type NodeData = {"id":string, "name":string,  "totalWeight":number; "onchainRep":number, "currentRep": number, "depth":number,  "relRoot":string,  "sentTreeVote": string, "recTreeVotes":string[], "sentDagVotes":DagVote[], "recDagVotes": DagVote[]}
 // Bare is for rendered but not clicked nodes
 export type NodeDataBare =       {"id":string, "name":string,  "totalWeight":number; "onchainRep":number, "currentRep": number, "depth":number, "relRoot":string, "sentTreeVote": string,}
 // we need parentIds for rendering
 export type NodeDataRendering =  {"id":string, "name":string,  "totalWeight":number; "onchainRep":number, "currentRep": number, "depth":number,  "relRoot":string, "sentTreeVote": string, parentIds: string[]}

 export type GraphData= {[id: string]: NodeData;}
 export type GraphDataBare= {[id: string]: NodeDataBare;}
 export type GraphDataRendering= {[id: string]: NodeDataRendering;}

 var maxRelRootDepth = 0;
 var anthillGraphNum = 0;
 var anthillGraph : GraphData = {};
 var anthillGraphBare : GraphDataBare = {};

 var rootAddress = "";

 ///// getters

 export async function getMaxRelRootDepth(){
  maxRelRootDepth = await axios.get("http://localhost:5000/maxRelRootDepth").then(response => {return response.data.maxRelRootDepth}); 
}

export async function getRootNodeId(): Promise<string >{
  return await axios.get("http://localhost:5000/rootId").then(response => {; return response.data.id;}); 
}

export async function getAnthillGraphNum(): Promise<number>{
  return await axios.get("http://localhost:5000/anthillGraphNum").then(response => {return response.data.anthillGraphNum}); 
}

async function getNodeFromServer(id: string) : Promise<NodeData>{
  return await axios.get("http://localhost:5000/id/"+id).then(response => { anthillGraph[response.data.nodeData.id]= response.data.nodeData as NodeData; anthillGraphBare[response.data.nodeData.id]= response.data.nodeData as NodeDataBare; return response.data.nodeData;}); 
}

async function getBareNodeFromServer(id: string):Promise<NodeDataBare>{
  return await axios.get("http://localhost:5000/bareId/"+id).then(response => {anthillGraphBare[response.data.nodeData.id]= response.data.nodeData as NodeDataBare; return response.data.nodeData; }); 
}


//// utils

async function checkAnthillGraphNum(): Promise<boolean>{
  var newAnthillGraphNum = await getAnthillGraphNum();
  var outdated = (newAnthillGraphNum != anthillGraphNum) 
  if (outdated) {
    console.log("we are outdated, clearing graphs")
    anthillGraphNum = newAnthillGraphNum;
    anthillGraph = {} as GraphData;
    anthillGraphBare = {} as GraphDataBare;
    rootAddress = "";
  }
  return outdated
} 


export function isVotable(voter :NodeDataRendering,  recipient : NodeDataBare): boolean{
  // console.log("voter",voter, "recipient", recipient)
  if ((voter.id == "Enter")) {
    return false;
  }

  if ((anthillGraph[voter.id] === undefined)) {
    const error = new Error("isVotable called with undefined voter with id: "+ voter.id+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
    throw error;
  }

  if (voter.depth<=recipient.depth) {
    return false;
  } else if (recipient.depth+maxRelRootDepth< voter.depth ) {

    return false;
  }  

  var relRootRecipient = recipient.relRoot;
  var relRootVoter = voter.relRoot;

  var relRootVoterAncestor = relRootVoter;
  for (var i = 0; i < maxRelRootDepth; i++) {
    
      if (relRootVoterAncestor == relRootRecipient) {
          return true;
      }

      // if we are at the root, we can't take more anscestors
      if ((relRootVoterAncestor == "0x0000000000000000000000000000000000000001")) {
        return false;
      }

      relRootVoterAncestor = anthillGraphBare[relRootVoterAncestor].sentTreeVote;   
  }
  return false;
}

// only called for voter = Metamask account, recipient = rendered node 
export function isDagVote(voter: NodeDataRendering, recipient: NodeDataRendering): boolean{  

  if ((voter.id == "Enter")) {
    return false;
  }

  if ((anthillGraph[voter.id] === undefined)) {
    const error = new Error("isDagVote called with undefined voter with id: "+ voter.id+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
    throw error;
  }

  if ((anthillGraphBare[recipient.id] === undefined)) {
    const error = new Error("isDagVote called with undefined recipientwith id: "+ recipient.id+ ", this should not happen, as we should be checking only for clicked and rendered nodes")
    throw error;
  }

  var voterFull = anthillGraph[voter.id];

  // console.log("In idDagVote, voter",voter, "recipient", recipient)
  if ((voterFull.sentDagVotes === undefined) || (voterFull.sentDagVotes.length == 0)) {
    return false;
  }
  if (voterFull.sentDagVotes.map((r)=>r.id).includes(recipient.id)) {
      return true;
  }
  return false;
}

//// check and savers

// We need to save the neighbourhood when clicking on a node
// We need to save the nodes that we will render: the clicked node with id, and the rec/sent tree/Dag votes. 
// for these nodes we also want to know if we can DagVote on them, i.e, are they in the original neighbourhood. 
// for this we can load the relative root from the database, and check if it is in the parents of the original accounts relative root.  
async function checkSaveNeighbourHood(id : string) {

  if ((anthillGraph[id]) && (await checkAnthillGraphNum())) {
    return ;
  }
  // we don't have the node, or it is not up to date.
  var node  = await getNodeFromServer(id);

  // var relRootNode = (await getBareNodeFromServer(node.relRoot));
  // var relrelRootNode = (await getBareNodeFromServer(relRootNode.relRoot));
  

  await getBareParentsForDepth(node.sentTreeVote, 2*maxRelRootDepth);

  // saving each node
  await checkSaveBareNodeArray(anthillGraph[id].recTreeVotes);
  await checkSaveBareNodeArray(anthillGraph[id].sentDagVotes.map((r)=>r.id));
  await checkSaveBareNodeArray(anthillGraph[id].recDagVotes.map((r)=> r.id));

}

async function getBareParentsForDepth(sentTreeVote :string, depthDiff: number){
  if ((sentTreeVote != "0x0000000000000000000000000000000000000001") && (sentTreeVote != "")){
    await checkSaveBareNode(sentTreeVote);
    var newBareNode = anthillGraphBare[sentTreeVote];
    if ((depthDiff>0) && (newBareNode.sentTreeVote != "0x0000000000000000000000000000000000000001") ){
      await getBareParentsForDepth(newBareNode.sentTreeVote, depthDiff-1);
    }
  }
}

async function checkSaveBareNodeArray(ids: string[]){
  for (const i in ids) {
    if ((ids[i] != "")&&(ids[i] != "0x0000000000000000000000000000000000000001")){
      await checkSaveBareNode(ids[i]);
    }
  }
  
}

async function checkSaveBareNode(id: string){
  if ((anthillGraphBare[id] === undefined) ){
     await getBareNodeFromServer(id);
  } 
}

////// main and rendering

// every graph we load is focused on a node, that was clicked on. 
export async function LoadNeighbourhood(id: string): Promise<[GraphDataRendering, string, number]> {
  var newGraphDataRendering = {} as GraphDataRendering;
   
  if (id == "Enter"){
      await getMaxRelRootDepth();   

      var id = await getRootNodeId();
    }

    // this saves the data into our Database
    await checkSaveNeighbourHood(id)
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
  var node = anthillGraph[id];
  // console.log("id for", id,  anthillGraph, anthillGraph[id], node)
  neighbourhood[id] = renderingNodeData(node);

  // add sent dag votes
  node.sentDagVotes.map ((sDagVote)=>{
      var recipient = anthillGraphBare[sDagVote.id];      
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

    const newParent :NodeDataRendering= renderingNodeDataBare(anthillGraphBare[newParentId]); 

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
  node.recDagVotes.map((rDagVote)=>{
    var voter = anthillGraphBare[rDagVote.id];      
    neighbourhood[voter.id] =  renderingNodeDataBare(voter);
    neighbourhood[voter.id].parentIds.push(id);
  })

  // add rec tree votes
  node.recTreeVotes.map((id)=>{
    var voter = anthillGraphBare[id];  
    
    if (neighbourhood[id] == undefined) {
      neighbourhood[id] =  renderingNodeDataBare(voter);
      neighbourhood[id].parentIds.push(node.id);
    }
  
  })

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

  nodeRendering.onchainRep = node.onchainRep;
  nodeRendering.currentRep = node.currentRep;
  nodeRendering.depth = node.depth;
  nodeRendering.relRoot = node.relRoot;

  nodeRendering.sentTreeVote = node.sentTreeVote;

  nodeRendering.parentIds =[];
  // we add sentTreeVote along with the parent chain. 

  nodeRendering.parentIds = nodeRendering.parentIds.concat(node.sentDagVotes.map(r=>r.id).filter(r=>r!=node.sentTreeVote));
  return nodeRendering;
}

function renderingNodeDataBare(node: NodeDataBare): NodeDataRendering {
  var nodeRendering = {} as NodeDataRendering;
  nodeRendering.id = node.id;
  if (node.name == "Name") {
    nodeRendering.name = node.id.slice(0, 2)+".."+node.id.slice((node.id.length)-3);
  } else {
    nodeRendering.name = node.name;
  }
  
  nodeRendering.onchainRep = node.onchainRep;
  nodeRendering.currentRep = node.currentRep;
  nodeRendering.depth = node.depth;
  nodeRendering.relRoot = node.relRoot;

  nodeRendering.sentTreeVote = node.sentTreeVote;

  nodeRendering.parentIds = [];
  return nodeRendering;
}

