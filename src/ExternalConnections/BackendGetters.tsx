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

export async function getMaxRelRootDepth(backendUrl: string): Promise<number> {
  const data = await getJson<{ maxRelRootDepth: number }>(
    backendUrl + "maxRelRootDepth",
  );
  return data.maxRelRootDepth;
}

export async function getIsNodeInGraph(
  backendUrl: string,
  id: string,
): Promise<boolean> {
  const data = await getJson<{ isNodeInGraph: boolean }>(
    backendUrl + "isNodeInGraph/" + id,
  );
  return data.isNodeInGraph;
}

export async function getRootNodeId(backendUrl: string): Promise<string> {
  const data = await getJson<{ id: string }>(backendUrl + "rootId");
  return data.id;
}

export async function getNodeFromServer(
  backendUrl: string,
  id: string,
): Promise<NodeData> {
  if (id === undefined) {
    console.log("bug: trying to get undefined from backend");
    return {} as NodeData;
  }
  const data = await getJson<{ nodeData: NodeData }>(backendUrl + "id/" + id);
  return data.nodeData;
}

export async function getBareNodeFromServer(
  backendUrl: string,
  id: string,
): Promise<NodeDataBare> {
  const data = await getJson<{ nodeData: NodeDataBare }>(
    backendUrl + "bareId/" + id,
  );
  return data.nodeData;
}

export async function getRandomLeaf(backendUrl: string): Promise<string> {
  const data = await getJson<{ randomLeaf: string }>(backendUrl + "randomLeaf");
  return data.randomLeaf;
}
