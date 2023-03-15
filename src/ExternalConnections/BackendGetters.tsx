import axios from "axios";
import { NodeData, NodeDataBare } from "../Graph/GraphBase";

export async function getMaxRelRootDepth(backendUrl: string): Promise<number>{
    return await axios.get(backendUrl+"maxRelRootDepth").then(response => {return response.data.maxRelRootDepth}); 
  }
  
  export async function getIsNodeInGraph(backendUrl: string, id:string):Promise<boolean>{
    return await axios.get(backendUrl+"isNodeInGraph/"+id).then(response => {return response.data.isNodeInGraph}); 
  }
  
  
  export async function getRootNodeId(backendUrl: string): Promise<string >{
    return await axios.get(backendUrl+"rootId").then(response => { return response.data.id;}); 
  }
  
  // export async function getAnthillGraphNum(backendUrl: string, ): Promise<number>{
  //   return await axios.get(backendUrl+"anthillGraphNum").then(response => {return response.data.anthillGraphNum}); 
  // }
  
 export async function getNodeFromServer(backendUrl: string, id: string) : Promise<NodeData>{
    // console.log("getting id", id)
    return await axios.get(backendUrl+"id/"+id).then(response => { return response.data.nodeData;}); 
  }
  
  export async function getBareNodeFromServer(backendUrl: string, id: string):Promise<NodeDataBare>{
    return await axios.get(backendUrl+"bareId/"+id).then(response => {return response.data.nodeData; }); 
  }
  
  export async function getRandomLeaf(backendUrl: string, ):Promise<string>{
    return await axios.get(backendUrl+"randomLeaf").then(response => {return response.data.randomLeaf}); 
  }