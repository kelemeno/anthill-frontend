// Tests for the read-side workflow: the frontend fetching graph data from the
// backend. The global fetch is mocked; all getters read from one cached
// GET /graph, which invalidateGraph drops.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBareNodeFromServer,
  getIsNodeInGraph,
  getMaxRelRootDepth,
  getNodeFromServer,
  getRandomLeaf,
  getRootNodeId,
  invalidateGraph,
} from "./BackendGetters";

const backendUrl = "http://localhost:5001/";
const fetchMock = vi.fn();

const root = {
  id: "0x02",
  name: "Root2",
  totalWeight: "0",
  currentRep: "3",
  depth: 0,
  relRoot: "0x02",
  sentTreeVote: "0x01",
  recTreeVotes: ["0x04"],
  sentDagVotes: [],
  recDagVotes: [{ id: "0x04", weight: "1", dist: 1, posInOther: 0 }],
};
const graph = {
  version: 1,
  rootId: "0x02",
  maxRelRootDepth: 6,
  randomLeaf: "0x0b",
  nodes: { "0x02": root },
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

beforeEach(() => {
  invalidateGraph();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(jsonResponse(graph));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("all getters share a single GET /graph", async () => {
  await expect(getRandomLeaf(backendUrl)).resolves.toBe("0x0b");
  await expect(getMaxRelRootDepth(backendUrl)).resolves.toBe(6);
  await expect(getRootNodeId(backendUrl)).resolves.toBe("0x02");
  await expect(getNodeFromServer(backendUrl, "0x02")).resolves.toEqual(root);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "graph");
});

it("invalidateGraph makes the next getter refetch", async () => {
  await getRootNodeId(backendUrl);
  invalidateGraph();
  await getRootNodeId(backendUrl);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

describe("getIsNodeInGraph", () => {
  it("returns true when the node is present", async () => {
    await expect(getIsNodeInGraph(backendUrl, "0x02")).resolves.toBe(true);
  });

  it("returns false when the node is absent", async () => {
    await expect(getIsNodeInGraph(backendUrl, "0x99")).resolves.toBe(false);
  });
});

it("getNodeFromServer short-circuits on an undefined id without calling the backend", async () => {
  const result = await getNodeFromServer(backendUrl, undefined as never);
  expect(result).toEqual({});
  expect(fetchMock).not.toHaveBeenCalled();
});

it("getNodeFromServer rejects for an unknown node", async () => {
  await expect(getNodeFromServer(backendUrl, "0xff")).rejects.toThrow();
});

it("getBareNodeFromServer returns only the bare fields", async () => {
  const bare = await getBareNodeFromServer(backendUrl, "0x02");
  expect(bare).toEqual({
    id: "0x02",
    name: "Root2",
    totalWeight: "0",
    currentRep: "3",
    depth: 0,
    relRoot: "0x02",
    sentTreeVote: "0x01",
    recTreeVotes: ["0x04"],
  });
});

it("a failed fetch rejects and is not cached", async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));
  await expect(getRootNodeId(backendUrl)).rejects.toThrow();
  await expect(getRootNodeId(backendUrl)).resolves.toBe("0x02");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
