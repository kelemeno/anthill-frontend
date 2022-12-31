import axios from "axios";

 export type GraphData= {[id: string]: NodeData;}
 export type NodeData = {"id":string,"name": string, "parentIds":string[], childIds:string[], loaded: boolean}

 var anthillGraph : GraphData = {};
 var relRootDepth = 0;

 export async function getRelRootDepth(){
  var response = await axios.get("http://localhost:5000/relRootDepth").then(response => {return response.data}); 
  relRootDepth = response;
}

 export async function getRootNode(): Promise<GraphData>{
  var response = await axios.get("http://localhost:5000/root").then(response => {SaveGraph(response.data.id, response.data.graphData); return response.data}); 

  return response.graphData
}

 export async function getNeighbourhood(id: string): Promise<GraphData> {
    if (id == "Enter"){
      await getRelRootDepth();   
      return await getRootNode();
    }
    
    var newGraphData  = await checkSaved(id)
    return newGraphData
}


export async function checkSaved(id: string): Promise<GraphData>{
    
    var node = anthillGraph[id];
    
    if (!node.loaded) {
      var graphPromise= loadNeighbourhoodFromServer(id)
      return graphPromise
    }

    var graph = returnSavedNeighbourhood(id)

    return graph
}

function returnSavedNeighbourhood(id : string) : GraphData{
    var neighbourhood = {} as GraphData;
    var node = anthillGraph[id];
    neighbourhood[id] = node;
    var parent = node;
    for (var i = 0; i < relRootDepth; i++) {
      
      if (parent.parentIds.length == 0) {
        break;
      }

      var newParentId = parent.parentIds[0];
      const newParent :NodeData= {"id": newParentId, "name": anthillGraph[newParentId].name,  "parentIds": [], "childIds": [parent.id], "loaded" : false}

      neighbourhood[newParentId] = newParent;
      neighbourhood[parent.id].parentIds = [newParentId];
      parent = anthillGraph[newParentId];

      
    }

    for (var i = 0; i < node.childIds.length; i++) {
        var childId = node.childIds[i];
        neighbourhood[childId] = anthillGraph[childId];
    }
    // console.log("neighbourhood", neighbourhood)
    return neighbourhood;
}


function loadNeighbourhoodFromServer(id: string): Promise<GraphData> {
  return axios.get("http://localhost:5000/"+id).then(response => {SaveGraph(id, response.data); return  response.data});
}

function SaveGraph(id: string, graph: GraphData){

  // we should only be calling this if anthillGraph[id].loaded == false
  for (const key in graph) {
    SaveNode(graph[key])
  }

  anthillGraph[id].loaded = true
}

function SaveNode(node: NodeData){
  
  if (anthillGraph[node.id] == undefined ){
    anthillGraph[node.id] = node;
  } else if (anthillGraph[node.id].loaded == true){
    return
  } else if (anthillGraph[node.id].parentIds.length == 0) {
    // if we don't have parents, we can replace them
    anthillGraph[node.id].parentIds = node.parentIds;
  } else if (anthillGraph[node.id].childIds.length == 0){
    anthillGraph[node.id].childIds = node.childIds;
  }
}

export function GraphDataToArray(graph: GraphData): NodeData[]{
  var array :NodeData[] = [];
  
  for (const key in graph) {
    var node = graph[key] as NodeData;
    array.push(node)
    // console.log("nodedata?:", graph[key] as NodeData)
    // console.log(array)
  }

  // console.log("array", array)
  return array
}

 
  
  
// function  loadGraph(address: string, url: string): GraphData{

    
// }

// const DevnetUrl = "http://localhost:8545";
// const AnthillAddress = ;

// const anthillGraph = loadGraph(AnthillAddress, DevnetUrl)

// export default anthillGraph

 