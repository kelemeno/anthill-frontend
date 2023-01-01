import axios from "axios";

 export type GraphData= {[id: string]: NodeData;}
 // currently we store dag and tree votes in parentIds, but only treevotes in childIds. When renderint, we push all parents to parentIds. 
 export type NodeData = {"id":string,"name": string, "parentIds":string[], "treeParentId": string,  "childIds":string[]}

 var anthillGraph : GraphData = {};
 var relRootDepth = 0;

 export async function getRelRootDepth(){
  var response = await axios.get("http://localhost:5000/relRootDepth").then(response => {return response.data}); 
  relRootDepth = response;
}

 export async function getRootNode(): Promise<string>{
  return await axios.get("http://localhost:5000/root").then(response => {anthillGraph[response.data.id] = response.data; return response.data.id}); 
}

function loadNodeFromServer(id: string) {
  return axios.get("http://localhost:5000/id/"+id).then(response => {anthillGraph[response.data.id] = response.data;});
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
export async function getNeighbourhood(id: string): Promise<GraphData> {
    if (id == "Enter"){
      await getRelRootDepth();   
      id = await getRootNode();
    }
    
    var newGraphData  = await renderNeighbourhood(id)
    return newGraphData
}

// we return a partial graph from the whole graph, focused on node with id. Here the hard part is selecting which parts to include. 
// we fully download every node we render. If it is in our data 
async function renderNeighbourhood(id : string) : Promise<GraphData>{
  var neighbourhood = {} as GraphData;
  // we are focusing on this node, so we display all its connections.
  var node = anthillGraph[id];
  neighbourhood[id] = node;

  // add dag votes
  for (var i = 0; i < node.parentIds.length; i++) {
      var parentId = node.parentIds[i];
      var parentName = parentId.slice(-4);

      if (anthillGraph[parentId] == undefined) {
        await loadNodeFromServer(parentId);
      } 

      // this node will not have all its connections, as we only want to show the connections of the node we are focusing on
      const parent :NodeData= {"id": parentId, "name": parentName, "parentIds": [], "treeParentId": "", "childIds": []}
      neighbourhood[parentId] = parent;

      // node already has the details, no need to modify it
  }

  var parent = node;
  // add tree parents
  for (var i = 0; i < relRootDepth; i++) { 
      if (parent.treeParentId == "") {
        break;
      }

      var newParentId = parent.treeParentId;

      if (anthillGraph[newParentId] === undefined) {
        await loadNodeFromServer(newParentId);
      }

      const newParent :NodeData= {"id": newParentId, "name": anthillGraph[newParentId].name,  "parentIds": [], "treeParentId":"", "childIds": [parent.id]}

      // we are mixing dag and tree votes, we check if this was already added as a dag vote to node, if so we remove it, as we want it in the parent chain
      if (neighbourhood[newParentId] !== undefined) {
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

        if (anthillGraph[childId] === undefined) {
          await loadNodeFromServer(childId);
        }

        neighbourhood[childId] = {"id": childId, "name": anthillGraph[childId].name,  "parentIds": [node.id], "treeParentId":node.id, "childIds": []} as NodeData;
        // neighbourhood[childId] = anthillGraph[childId];
    }
    return neighbourhood;
}



