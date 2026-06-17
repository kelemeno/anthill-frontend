// Tests for the read-side workflow: the frontend fetching graph data from the
// backend. The global fetch is mocked so we assert the right endpoint is hit
// and the response is unwrapped correctly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getBareNodeFromServer,
  getIsNodeInGraph,
  getMaxRelRootDepth,
  getNodeFromServer,
  getRandomLeaf,
  getRootNodeId,
} from "./BackendGetters";

const backendUrl = "http://localhost:5001/";
const fetchMock = vi.fn();

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("getRandomLeaf hits /randomLeaf and returns the id", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ randomLeaf: "0x0b" }));
  await expect(getRandomLeaf(backendUrl)).resolves.toBe("0x0b");
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "randomLeaf");
});

it("getMaxRelRootDepth hits /maxRelRootDepth and returns the number", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ maxRelRootDepth: 6 }));
  await expect(getMaxRelRootDepth(backendUrl)).resolves.toBe(6);
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "maxRelRootDepth");
});

it("getRootNodeId hits /rootId and returns the id", async () => {
  fetchMock.mockResolvedValue(jsonResponse({ id: "0x02" }));
  await expect(getRootNodeId(backendUrl)).resolves.toBe("0x02");
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "rootId");
});

describe("getIsNodeInGraph", () => {
  it("returns true when the node is present", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ isNodeInGraph: true }));
    await expect(getIsNodeInGraph(backendUrl, "0x04")).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(backendUrl + "isNodeInGraph/0x04");
  });

  it("returns false when the node is absent", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ isNodeInGraph: false }));
    await expect(getIsNodeInGraph(backendUrl, "0x99")).resolves.toBe(false);
  });
});

it("getNodeFromServer hits /id/:id and returns the nodeData", async () => {
  const nodeData = { id: "0x02", name: "Root2", depth: 0 };
  fetchMock.mockResolvedValue(jsonResponse({ nodeData }));
  await expect(getNodeFromServer(backendUrl, "0x02")).resolves.toEqual(
    nodeData,
  );
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "id/0x02");
});

it("getNodeFromServer short-circuits on an undefined id without calling the backend", async () => {
  const result = await getNodeFromServer(backendUrl, undefined as never);
  expect(result).toEqual({});
  expect(fetchMock).not.toHaveBeenCalled();
});

it("getBareNodeFromServer hits /bareId/:id and returns the nodeData", async () => {
  const nodeData = { id: "0x04", name: "Node4" };
  fetchMock.mockResolvedValue(jsonResponse({ nodeData }));
  await expect(getBareNodeFromServer(backendUrl, "0x04")).resolves.toEqual(
    nodeData,
  );
  expect(fetchMock).toHaveBeenCalledWith(backendUrl + "bareId/0x04");
});

it("getJson rejects on a non-2xx response (parity with the old axios client)", async () => {
  fetchMock.mockResolvedValue(jsonResponse({}, false, 404));
  await expect(getNodeFromServer(backendUrl, "0xff")).rejects.toThrow();
});
