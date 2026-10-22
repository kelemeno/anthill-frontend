import type { NodeData, NodeDataBare } from "../Graph/GraphBase";

// Small wrapper around the native fetch API. Throws on non-2xx so callers keep
// the same "reject on error" behavior the previous axios client provided.
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

type GraphResponse = {
  version: number;
  rootId: string;
  maxRelRootDepth: number;
  randomLeaf: string;
  nodes: { [id: string]: NodeData };
};

// The whole graph is fetched once (GET /graph) and every getter below reads
// from it, instead of one request per node. Call invalidateGraph when the
// backend announces an update.
let graphCache: { backendUrl: string; graph: Promise<GraphResponse> } | null =
  null;

export function invalidateGraph() {
  graphCache = null;
}

function getGraph(backendUrl: string): Promise<GraphResponse> {
  if (graphCache === null || graphCache.backendUrl !== backendUrl) {
    const graph = getJson<GraphResponse>(backendUrl + "graph");
    const entry = { backendUrl, graph };
    graphCache = entry;
    // don't keep a failed fetch around
    graph.catch(() => {
      if (graphCache === entry) graphCache = null;
    });
  }
  return graphCache.graph;
}

async function getNode(backendUrl: string, id: string): Promise<NodeData> {
  const node = (await getGraph(backendUrl)).nodes[id];
  if (node === undefined) {
    throw new Error(`node ${id} not found`);
  }
  return node;
}

export async function getMaxRelRootDepth(backendUrl: string): Promise<number> {
  return (await getGraph(backendUrl)).maxRelRootDepth;
}

export async function getIsNodeInGraph(
  backendUrl: string,
  id: string,
): Promise<boolean> {
  return (await getGraph(backendUrl)).nodes[id] !== undefined;
}

export async function getRootNodeId(backendUrl: string): Promise<string> {
  return (await getGraph(backendUrl)).rootId;
}

export async function getNodeFromServer(
  backendUrl: string,
  id: string,
): Promise<NodeData> {
  if (id === undefined) {
    console.log("bug: trying to get undefined from backend");
    return {} as NodeData;
  }
  return getNode(backendUrl, id);
}

export async function getBareNodeFromServer(
  backendUrl: string,
  id: string,
): Promise<NodeDataBare> {
  const node = await getNode(backendUrl, id);
  return {
    id: node.id,
    name: node.name,
    totalWeight: node.totalWeight,
    currentRep: node.currentRep,
    depth: node.depth,
    relRoot: node.relRoot,
    sentTreeVote: node.sentTreeVote,
    recTreeVotes: node.recTreeVotes,
  };
}

export async function getRandomLeaf(backendUrl: string): Promise<string> {
  return (await getGraph(backendUrl)).randomLeaf;
}
