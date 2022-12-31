import axios from "axios";

 export type GraphData= {[id: string]: NodeData;}
 export type NodeData = {"id":string, "parentIds":string[], childIds?:string[], loaded: boolean}

 


 var AnthillGraph : GraphData = {};

 export async function getNeighbourhood(id: string): Promise<GraphData> {
    if (id == "Enter"){
      return await getRootNode()
    }

    var newGraphData :GraphData= {}
    
    var node  = await getNode(id)

    newGraphData[node.id] = node

    for (const parentId of node.parentIds) {
        const newParent :NodeData= {id: parentId, parentIds: [], loaded : false}
        newGraphData[newParent.id] = newParent
    }

    if (node.childIds){
        for (const childID of node.childIds) {
            const newChild :NodeData= {id: childID, parentIds: [id],  loaded: false}
            newGraphData[newChild.id] = newChild
        }
    }
    return newGraphData
}


export async function getNode(id: string): Promise<NodeData>{
    
    var node = AnthillGraph[id];
    
    if (!node.loaded) {
       var nodePromise= loadNodeFromServer(id)
      return nodePromise
    }

    return node
}

export async function getRootNode(): Promise<GraphData>{
  var node:NodeData = await axios.get("http://localhost:5000/root").then(response => {SaveNode(response.data); return response.data}); 
  var id = node.id
  var graph : GraphData= {id : node} as GraphData
  return graph
}

function loadNodeFromServer(id: string): Promise<NodeData> {
  return axios.get("http://localhost:5000/"+id).then(response => {SaveNode(response.data); return response.data});
}

function SaveNode(node: NodeData): NodeData {
  // save node

  AnthillGraph[node.id] = node
  AnthillGraph[node.id].loaded = true

  // save parents and children to graph
  for (const parentId of node.parentIds) {
    if (!(parentId in AnthillGraph)){
      // we don't need to save details, as they will be incomplete anyway
      AnthillGraph[parentId] = {id: parentId, parentIds: [], loaded: false}
    }
  }

  if (node.childIds){
    for (const childId of node.childIds) {
      if (!(childId in AnthillGraph)){
        AnthillGraph[childId] = {id: childId, parentIds: [], loaded: false}
      }
    }
  }

  return node
}

export function GraphDataToArray(graph: GraphData): NodeData[]{
  var array :NodeData[] = []
  for (const key in graph) {
    array.push(graph[key])
  }
  return array
}

 
  
  
// function  loadGraph(address: string, url: string): GraphData{

    
// }

// const DevnetUrl = "http://localhost:8545";
// const AnthillAddress = ;

// const AnthillGraph = loadGraph(AnthillAddress, DevnetUrl)

// export default AnthillGraph

 