// Unit tests for the tree actions the UI triggers (join the tree, give/remove a
// vote, change name, leave, switch position, move tree vote). fetch is mocked:
// we assert each action posts the right {fn, args} to /action with the
// session's bearer token, runs its navigation side effects only on success, and
// is unavailable while signed out.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAddDagVote,
  useChangeName,
  useJoinTree,
  useLeaveTree,
  useMoveTreeVote,
  useRemoveDagVote,
  useSwitchWithParent,
} from "./BackendActions";
import type { Api } from "./Passkey";

const backendUrl = "http://backend/";
const recipient = "0x00000000000000000000000000000000000000bb";
const api: Api = {
  backendUrl,
  session: {
    token: "tok",
    user: { id: "0x00000000000000000000000000000000000000aa", name: "Ada" },
  },
};
const signedOut: Api = { backendUrl, session: undefined };

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("alert", vi.fn());
});

function sent() {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${backendUrl}action`);
  expect(init.method).toBe("POST");
  expect(init.headers.Authorization).toBe("Bearer tok");
  return JSON.parse(init.body);
}

describe("tree actions", () => {
  it("join uses the signed-in user's name", async () => {
    await useJoinTree(api, recipient)?.();
    expect(sent()).toEqual({ fn: "joinTree", args: { name: "Ada", recipient } });
  });

  it("add and remove a reputation vote", async () => {
    await useAddDagVote(api, recipient)?.();
    expect(sent()).toEqual({ fn: "addDagVote", args: { recipient, weight: "1" } });

    fetchMock.mockClear();
    await useRemoveDagVote(api, recipient)?.();
    expect(sent()).toEqual({ fn: "removeDagVote", args: { recipient } });
  });

  it("change name and switch with parent", async () => {
    await useChangeName(api, "Bea")?.();
    expect(sent()).toEqual({ fn: "changeName", args: { name: "Bea" } });

    fetchMock.mockClear();
    await useSwitchWithParent(api)?.();
    expect(sent()).toEqual({ fn: "switchPositionWithParent", args: {} });
  });

  it("leave navigates to the alternative node after success", async () => {
    const navigate = vi.fn();
    const setClicked = vi.fn();
    await useLeaveTree(api, navigate, setClicked, "0xalt")?.();
    expect(sent()).toEqual({ fn: "leaveTree", args: {} });
    expect(setClicked).toHaveBeenCalledWith("0xalt");
    expect(navigate).toHaveBeenCalledWith("/?id=0xalt");
  });

  it("move navigates to the new parent after success", async () => {
    const navigate = vi.fn();
    const setClicked = vi.fn();
    await useMoveTreeVote(api, recipient, setClicked, navigate)?.();
    expect(sent()).toEqual({ fn: "moveTreeVote", args: { recipient } });
    expect(navigate).toHaveBeenCalledWith(`/?id=${recipient}`);
  });

  it("a rejected action alerts the backend's reason and skips side effects", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "A mTV 4" }), { status: 400 }),
    );
    const navigate = vi.fn();
    await useMoveTreeVote(api, recipient, vi.fn(), navigate)?.();
    expect(alert).toHaveBeenCalledWith("A mTV 4");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("nothing is available while signed out", () => {
    expect(useJoinTree(signedOut, recipient)).toBeUndefined();
    expect(useAddDagVote(signedOut, recipient)).toBeUndefined();
    expect(useLeaveTree(signedOut, vi.fn(), vi.fn(), "")).toBeUndefined();
  });
});
