import axios from "axios";

 export type GraphData= {[id: string]: NodeData;}
 // currently we store dag and tree votes in parentIds, but only treevotes in childIds. When renderint, we push all parents to parentIds. 
 export type NodeData = {"id":string,"name": string, "parentIds":string[], "treeParentId": string,  "childIds":string[], "loaded": boolean}

 var maxRelRootDepth = 0;
 var anthillGraphNum = 0;
 var anthillGraph : GraphData = {};
 var rootAddress = "";


 export async function getMaxRelRootDepth(){
  maxRelRootDepth = await axios.get("http://localhost:5000/maxRelRootDepth").then(response => {return response.data.maxRelRootDepth}); 
}

export async function getAnthillGraphNum(): Promise<number>{
  return await axios.get("http://localhost:5000/anthillGraphNum").then(response => {return response.data.anthillGraphNum}); 
}

export async function getRootNode(): Promise<[string , boolean]>{
  return await axios.get("http://localhost:5000/root").then(response => {const success = saveNode(response.data.anthillGraphNum, response.data.nodeData); return [response.data.nodeData.id, success];}); 
}

export async function getRelRoot(id: string): Promise<[ NodeData, number,  boolean]>{
  return await axios.get("http://localhost:5000/getRelRoot/"+id).then(response => {const success = saveNode(response.data.anthillGraphNum, response.data.nodeData); return [response.data.nodeData, response.data.depthDiff, success];}); 
}

async function loadNodeFromServer(id: string): Promise<boolean> {
  return await axios.get("http://localhost:5000/id/"+id).then(response => {const success = saveNode(response.data.anthillGraphNum, response.data.nodeData); return success;}); 
}

function saveNode(newAnthillGraphNum: number, node: NodeData) : boolean{
  if (newAnthillGraphNum != anthillGraphNum){
    anthillGraphNum = newAnthillGraphNum;
    anthillGraph = {"node.id": node} as GraphData;
    rootAddress = ""; 
    return false
  }
  anthillGraph[node.id] = node;
  return true

}

function findRelRoot(id: string): [string, number] {
  var relRoot = id;
  var relRootDiff = 0;
  var success = true;
  for ( relRootDiff= 0; relRootDiff < maxRelRootDepth; relRootDiff++) {
      
      var parentId = anthillGraph[relRoot].treeParentId;

      if (parentId == "") {
        break;
      }
      relRoot = parentId;

      // if (anthillGraph[relRoot] === undefined) {
          
      //   throw eror here somehow! we should have loaded the rel Root of id
      // }
  }
  return [relRoot , relRootDiff];
}

export function findDepthDiff(voter :string,  recipient : string): [boolean, number]{
        
  if ((anthillGraph[voter] === undefined) || (anthillGraph[recipient] === undefined)) {
      return [false, 0];
  }

  var [relRoot, relRootDiff] = findRelRoot(voter);

  var recipientAncestor = recipient;

  for (var i = 0; i < relRootDiff; i++) {
      if (recipientAncestor == relRoot) {
          return [true, maxRelRootDepth-i];
      }
      
      recipientAncestor = anthillGraph[recipientAncestor].treeParentId;

      if (recipientAncestor == "") {
          return [false, 0];
      }
  }
  return [false, 0];
}

export function checkDagVote(voter: string, recipient: string): boolean{

  if (anthillGraph[voter].parentIds.includes(recipient)) {
      return true;
  }
  return false;
}

export function GraphDataToArray(graph: GraphData): NodeData[]{
  var array :NodeData[] = [];
  
  for (const key in graph) {
    var node = graph[key] as NodeData;
    array.push(node)
  }
  return array
}

// every graph we load is focused on a node, with specified id. We note for each node whether it has been focused, so totally loaded yet. 
export async function GetNeighbourhood(id: string): Promise<[GraphData, number]> {
  var success = false;
  var newGraphData = {} as GraphData;
  
  // here the assumption is we will not have lot of events, and the database can quickly update compared to our queries of it. 
  while (!success) {
    if (id == "Enter"){
      await getMaxRelRootDepth();   

      var [id, success] = await getRootNode();
      if (!success) {continue}
    }

    success = await checkSaveNeighbourHood(id)
    if (!success) {continue}
    
    newGraphData = renderNeighbourhood(id)
  }

  anthillGraph[id].loaded= true;
  return [newGraphData, anthillGraphNum];

}


async function checkSaveNeighbourHood(id : string) : Promise<boolean>{
  

  var [relRoot, depthDiff, success ] = await getRelRoot(id);

  if (!success) {return success}

  // getting all the nodes in the neighbourhood of id, above id
  if (depthDiff > 0) {
    var success = await checkSaveRecursive(relRoot.id, depthDiff -1 )
  }
  
  // getting id and its children
  var success = await checkSaveRecursive(id, 1)



  return success
}

async function checkSaveRecursive(id: string, depth: number): Promise<boolean>{
  var success = await checkSaveNode(id);
  if (!success) {return success}

  if (depth == 0) {return true}
  for  (const i in anthillGraph[id].childIds)  {
    success = await checkSaveRecursive(anthillGraph[id].childIds[i], depth -1)
    if (!success) {return success}
  }
  return true
}

async function checkSaveNode(id: string): Promise<boolean>{
  if (anthillGraph[id] === undefined) {
    return await loadNodeFromServer(id);
  } 
  return true 
}

// we return a partial graph from the whole graph, focused on node with id. Here the hard part is selecting which parts to include. 
// we fully download every node we render. If it is in our data 
function renderNeighbourhood(id : string) : GraphData{
  var neighbourhood = {} as GraphData;
  // we are focusing on this node, so we display all its connections.
  var node = anthillGraph[id];
  neighbourhood[id] = node;

  // add dag votes
  for (var i = 0; i < node.parentIds.length; i++) {
      var parentId = node.parentIds[i];
      var parentName = parentId.slice(-4);

      // if (anthillGraph[parentId] == undefined) {
      //   throw error here this should not happen
      // } 

      // this node will not have all its connections, as we only want to show the connections of the node we are focusing on
      const parent :NodeData= {"id": parentId, "name": parentName, "parentIds": [], "treeParentId": "", "childIds": [], "loaded": false}
      neighbourhood[parentId] = parent;

      // node already has the details, no need to modify it
  }

  var parent = node;
  // add tree parents
  for (var i = 0; i < maxRelRootDepth; i++) { 
      if (parent.treeParentId == "") {
        break;
      }

      var newParentId = parent.treeParentId;

      // if (anthillGraph[newParentId] === undefined) {
      //   throw error here, we should have loaded the neighbourhood
      // }

      const newParent :NodeData= {"id": newParentId, "name": anthillGraph[newParentId].name,  "parentIds": [], "treeParentId":"", "childIds": [parent.id], "loaded": false}

      // we are mixing dag and tree votes, we check if this was already added as a dag vote to node, if so we remove it, as we want it in the parent chain
      if (neighbourhood[newParentId] != undefined) {

        delete neighbourhood[newParentId];
        for (var j = 0; j < node.parentIds.length; j++) {
          if (node.parentIds[j] == newParentId) {

            node.parentIds.splice(j, 1);
            break;
          }
        }
      }
      neighbourhood[newParentId] = newParent;
      // we mixed dag and tree votes, so we need the following line.
      // we put it in the middle, hopufully it renders nicely 

      // neighbourhood[parent.id].parentIds.push(newParentId);
      // or
      neighbourhood[parent.id].parentIds.splice(neighbourhood[parent.id].parentIds.length/2, 0, newParentId);
      
      neighbourhood[parent.id].treeParentId = newParentId;
      parent = anthillGraph[newParentId];
    }

    for (var i = 0; i < node.childIds.length; i++) {
        var childId = node.childIds[i];

        // if (anthillGraph[childId] === undefined) {
        //   throw error here
        // }

        neighbourhood[childId] = {"id": childId, "name": anthillGraph[childId].name,  "parentIds": [node.id], "treeParentId":node.id, "childIds": [], "loaded": false} as NodeData;
        // neighbourhood[childId] = anthillGraph[childId];
    }
    return neighbourhood;
}



