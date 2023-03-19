
import { NodeData, NodeDataBare, GraphData, GraphDataBare, NodeDataRendering, GraphDataRendering , isVotable, isDagVote, isSwitchable, address1} from "./GraphBase";
import { CheckSaveWholeGraph } from "./LoadGraph";


////// selecting the graph to render


function renderingNodeData(node: NodeData, account: string, isAccountInGraph: boolean,  maxRelRootDepth: number, anthillGraph: GraphData, anthillGraphBare: GraphDataBare): NodeDataRendering {
    var nodeRendering = {} as NodeDataRendering;
    nodeRendering.id = node.id;
  
    if (node.name === "Name") {
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
  
    // we will eventually want these last three fields to be part of nodeDataBare, and to be calculated when loading, not when selecting. 
    nodeRendering.isVotable= false
    nodeRendering.isDagVote = false;
    nodeRendering.isSwitchable = false;
    
    if (isAccountInGraph){
      nodeRendering.isVotable = isVotable(account, node as NodeDataBare, maxRelRootDepth, anthillGraph, anthillGraphBare);
      if (nodeRendering.isVotable ){
        nodeRendering.isDagVote = isDagVote(account, node.id,  maxRelRootDepth, anthillGraph, anthillGraphBare);
      }
      nodeRendering.isSwitchable = isSwitchable(account, node.id,node.currentRep, maxRelRootDepth, anthillGraph, anthillGraphBare);
    }
  
  
    return nodeRendering;
  }
  
  function renderingNodeDataBare(node: NodeDataBare, account:string, isAccountInGraph:boolean,  maxRelRootDepth: number, anthillGraph: GraphData, anthillGraphBare: GraphDataBare): NodeDataRendering {
    var nodeRendering = {} as NodeDataRendering;
    // console.log("node in renderingNodeDataBare", )
    // console.log("node ", node)
  
    nodeRendering.id = node.id;
    if (node.name === "Name") {
      nodeRendering.name = node.id.slice(0, 2)+".."+node.id.slice((node.id.length)-3);
    } else {
        nodeRendering.name = node.name;
    }
    
    nodeRendering.currentRep = node.currentRep;
    nodeRendering.depth = node.depth;
    nodeRendering.relRoot = node.relRoot;
    nodeRendering.recTreeVotes = node.recTreeVotes;
    nodeRendering.sentTreeVote = node.sentTreeVote;
  
    nodeRendering.parentIds = [];
  
    // we will eventually want these last three fields to be part of nodeDataBare, and to be calculated when loading, not when selecting. 
  
    nodeRendering.isVotable= false
    nodeRendering.isDagVote = false;
    nodeRendering.isSwitchable = false;
    
    if (isAccountInGraph){
      nodeRendering.isVotable = isVotable(account, node as NodeDataBare, maxRelRootDepth, anthillGraph, anthillGraphBare);
      if (nodeRendering.isVotable ){
        nodeRendering.isDagVote = isDagVote(account, node.id,  maxRelRootDepth, anthillGraph, anthillGraphBare);
      }
      nodeRendering.isSwitchable = isSwitchable(account, node.id,node.currentRep, maxRelRootDepth, anthillGraph, anthillGraphBare);
    }
  
    return nodeRendering;
  }
  
  const matchAndSpliceParent : (id:string, newParentId:string, neighbourhood: GraphDataRendering) => (parentId:string, i:number, ) => void  =  
    (id: string, newParentId:string, neighbourhood: GraphDataRendering) => (parentId:string, i:number,)  => {
      if (parentId === newParentId) {
          neighbourhood[id].parentIds.splice(i, 1);
      }
    }
   


// we return a partial graph from the whole graph, focused on node with id. Here the hard part is selecting which parts to include. 
// we fully download every node we render. If it is in our data 
export function SelectNeighbourhoodWithParentChain(id : string, account:string, isAccountInGraph:boolean ,maxRelRootDepth:number, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, ) : GraphDataRendering{
    var neighbourhood = {} as GraphDataRendering;
    // we are focusing on this node, so we display all its connections.
    var node = anthillGraph[id];
    // console.log("id for", id,  anthillGraph, anthillGraph[id], node)
    neighbourhood[id] = renderingNodeData(node, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
  
    // add sent dag votes
    node.sentDagVotes.forEach((sDagVote)=>{
        var recipient = anthillGraphBare[sDagVote.id]; 
        // console.log("recipient1", recipient)
        neighbourhood[recipient.id] =  renderingNodeDataBare(recipient, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
      }
    )
  
    var parent = node as NodeDataBare;
    // add tree parent chain
    for (var i = 0; i < maxRelRootDepth; i++) { 
      if ((parent.sentTreeVote === "") || (parent.sentTreeVote === "0x0000000000000000000000000000000000000001")){
        break;
      }
  
      var newParentId = parent.sentTreeVote;
      // console.log("newParentId, and full node", id,  newParentId, anthillGraphBare[id], anthillGraphBare, anthillGraphBare["0x000000000000000000000000000000000000000b"], anthillGraphBare["0x0000000000000000000000000000000000000005"], anthillGraphBare[newParentId]);     
  
      const newParent :NodeDataRendering= renderingNodeDataBare(anthillGraphBare[newParentId], account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare); 
  
      // we are mixing dag and tree votes, we check if this was already added as a dag vote to node, if so we remove it, as we want it in the parent chain
      // special case, we might remove and re-add the vote from node to its parent 
      if (neighbourhood[newParentId] !== undefined) {
        // remove the extra node
        delete neighbourhood[newParentId];
        neighbourhood[id].parentIds.map(matchAndSpliceParent(id, newParentId, neighbourhood))
      }
      
      neighbourhood[newParentId] = newParent;
      neighbourhood[parent.id].parentIds.push(newParentId);
      neighbourhood[parent.id].sentTreeVote = newParentId;
      parent = anthillGraphBare[newParentId];
    }
  
    // add rec dag votes
    // console.log("recDagvotes", node.recDagVotes)
    if (node.recDagVotes.length !== 0) {
      node.recDagVotes.forEach((rDagVote)=>{
        var voter = anthillGraphBare[rDagVote.id];
        // console.log("voter", voter)
        if (voter !== undefined) {
          // console.log("voter1", voter)
  
          neighbourhood[voter.id] =  renderingNodeDataBare(voter, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
          neighbourhood[voter.id].parentIds.push(id);
        }
      })
    }
  
    // add rec tree votes
    // console.log("recTreeVotes", node.recTreeVotes)
    if (node.recTreeVotes.length !== 0) {
      node.recTreeVotes.forEach((id)=>{
        var voter = anthillGraphBare[id];  
        // console.log("id in recTreevotes", id)
        if ((neighbourhood[id] === undefined) && (voter !== undefined)) {
          // console.log("voter2", voter)
  
          neighbourhood[id] =  renderingNodeDataBare(voter, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
          neighbourhood[id].parentIds.push(node.id);
        }
      })
    }
  
    return neighbourhood;
  }
  
export  function SelectWholeGraph( id: string, account:string, isAccountInGraph:boolean ,maxRelRootDepth:number, anthillGraph : GraphData, anthillGraphBare : GraphDataBare): GraphDataRendering{
    var neighbourhood = {} as GraphDataRendering;

    for (const [key, value] of Object.entries(anthillGraph)) {
        neighbourhood[key] = renderingNodeData(value, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
        if (value.sentTreeVote !== address1){
            neighbourhood[key].parentIds.push(value.sentTreeVote);
        }

    }

    return neighbourhood;

}
  


export function SelectSentRecDagVotes(id : string, account:string, isAccountInGraph:boolean ,maxRelRootDepth:number, anthillGraph:GraphData, anthillGraphBare:GraphDataBare, ) : GraphDataRendering{
    var neighbourhood = {} as GraphDataRendering;

     // we are focusing on this node, so we display all its connections.
     var node = anthillGraph[id];
     // console.log("id for", id,  anthillGraph, anthillGraph[id], node)
     neighbourhood[id] = renderingNodeData(node, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
     neighbourhood[id].parentIds = node.sentDagVotes.map(r=>r.id);


     // add sent dag votes
     node.sentDagVotes.forEach((sDagVote)=>{
         var recipient = anthillGraphBare[sDagVote.id]; 
         // console.log("recipient1", recipient)
         neighbourhood[recipient.id] =  renderingNodeDataBare(recipient, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);

       }
     )

      // add rec dag votes
    // console.log("recDagvotes", node.recDagVotes)
    if (node.recDagVotes.length !== 0) {
        node.recDagVotes.forEach((rDagVote)=>{
          var voter = anthillGraphBare[rDagVote.id];
          // console.log("voter", voter)
          if (voter !== undefined) {
            // console.log("voter1", voter)
    
            neighbourhood[voter.id] =  renderingNodeDataBare(voter, account, isAccountInGraph, maxRelRootDepth, anthillGraph, anthillGraphBare);
            neighbourhood[voter.id].parentIds.push(id);
          }
        })
      }

    return neighbourhood;
}