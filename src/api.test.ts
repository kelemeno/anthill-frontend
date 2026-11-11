// The API calls: endpoints, bodies, bearer tokens, and server errors surfacing
// as readable messages.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  act,
  check,
  createCommunity,
  createInviteLink,
  fetchCommunities,
  fetchGraph,
  fetchPolls,
  loadSession,
  newRecoveryCode,
  saveProfile,
  saveSession,
  slugify,
  votePoll,
  whenSessionRejected,
} from "./api";

// the browser's passkey sheet, answered at once
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: vi.fn(async () => ({ id: "cred" })),
  startRegistration: vi.fn(async () => ({ id: "cred" })),
}));

const session = { token: "tok", user: { id: "0xaa", name: "Ada" } };
const fetchMock = vi.fn();

function respond(data: unknown, status = 200) {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(data), { status }));
}

function last() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("api", () => {
  it("sends actions to the community with the session token", async () => {
    respond({ ok: true });
    await act(session, "club", { fn: "addDagVote", args: { recipient: "0xbb", weight: "1" } });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: { fn: "addDagVote" } });
    expect(last().url).toMatch(/\/c\/club\/action$/);
  });

  it("reads a community's graph, with the token for private ones", async () => {
    respond({ nodes: {} });
    await fetchGraph("back-room", session);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    expect(last().url).toMatch(/\/c\/back-room\/graph$/);
  });

  it("says when a community isn't there", async () => {
    respond({ error: "Not found" }, 404);
    await expect(fetchGraph("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("lists and starts communities", async () => {
    respond({ communities: [{ id: "commons" }] });
    await expect(fetchCommunities()).resolves.toEqual([{ id: "commons" }]);
    respond({ community: { id: "club" } });
    const settings = { name: "Club", description: "", visibility: "public", joinPolicy: "open" } as const;
    await createCommunity(session, { id: "club", ...settings });
    expect(last()).toMatchObject({ method: "POST", body: { id: "club", name: "Club" } });
    expect(last().url).toMatch(/communities$/);
  });

  it("turns names into addresses", () => {
    expect(slugify("Book Club!")).toBe("book-club");
    expect(slugify("  Café  Société ")).toBe("cafe-societe");
    expect(slugify("x".repeat(40))).toHaveLength(32);
  });

  it("shows the server's reason when an action fails", async () => {
    respond({ error: "You already give them a reputation vote." }, 400);
    await expect(act(session, "commons", { fn: "addDagVote", args: {} })).rejects.toThrow("already give them");
  });

  it("dry-runs several actions at once", async () => {
    respond({ results: [{ ok: true }, { ok: false, reason: "No" }] });
    const results = await check(session, "commons", [
      { fn: "leaveTree", args: {} },
      { fn: "switchPositionWithParent", args: {} },
    ]);
    expect(results[1]).toEqual({ ok: false, reason: "No" });
  });

  it("makes invite links on this site", async () => {
    respond({ code: "abc", expires: "" });
    await expect(createInviteLink(session, "club")).resolves.toBe(`${window.location.origin}/invite/abc`);
    expect(last().url).toMatch(/\/c\/club\/invites$/);
  });

  it("reads polls (with the token, for my vote) and votes", async () => {
    respond({ polls: [] });
    await fetchPolls("club", session);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    respond({ poll: {} });
    await votePoll(session, "club", "p1", 2);
    expect(last()).toMatchObject({ body: { option: 2 } });
    expect(last().url).toMatch(/\/c\/club\/polls\/p1\/vote$/);
  });

  it("saves the profile", async () => {
    respond({ profile: {} });
    await saveProfile(session, "hi", "https://example.com");
    expect(last().body).toEqual({ bio: "hi", link: "https://example.com" });
  });

  it("sends a body type only with a body, so anonymous reads need no CORS preflight", async () => {
    respond({ nodes: {} });
    await fetchGraph("commons");
    expect(fetchMock.mock.calls.at(-1)![1].headers).toEqual({});
    respond({ ok: true });
    await act(session, "club", { fn: "leaveTree", args: {} });
    expect(fetchMock.mock.calls.at(-1)![1].headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("never keeps the recovery code with the session", () => {
    saveSession({ ...session, recoveryCode: "AAAA-BBBB" } as typeof session);
    expect(localStorage.getItem("anthill.session")).not.toContain("AAAA");
    // and cleans up what older versions kept
    localStorage.setItem("anthill.session", JSON.stringify({ ...session, recoveryCode: "AAAA-BBBB" }));
    expect(loadSession()).toEqual(session);
    expect(localStorage.getItem("anthill.session")).not.toContain("AAAA");
  });

  it("reports a rejected session token, and only that", async () => {
    const rejected = vi.fn();
    whenSessionRejected(rejected);
    respond({ error: "passkey not verified" }, 401);
    await expect(act(session, "club", { fn: "leaveTree", args: {} })).rejects.toThrow();
    expect(rejected).not.toHaveBeenCalled();
    respond({ error: "session expired" }, 401);
    await expect(act(session, "club", { fn: "leaveTree", args: {} })).rejects.toThrow();
    expect(rejected).toHaveBeenCalledWith("tok");
    whenSessionRejected(undefined);
  });

  it("signs in again when an account change needs a recent sign-in, then retries", async () => {
    const replies = (...data: [unknown, number][]) => {
      for (const [body, status] of data) {
        fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify(body), { status }));
      }
    };
    const reauth = [{ error: "Please sign in again first, to confirm it's you.", code: "reauth" }, 401] as [unknown, number];
    const kept = vi.fn();
    replies(
      reauth,
      [{ flowId: "f", options: {} }, 200],
      [{ token: "tok2", user: session.user }, 200],
      [{ recoveryCode: "CODE" }, 200],
    );
    await expect(newRecoveryCode(session, kept)).resolves.toBe("CODE");
    expect(kept).toHaveBeenCalledWith({ token: "tok2", user: session.user });
    expect(last()).toMatchObject({ url: expect.stringMatching(/auth\/recovery-code$/), auth: "Bearer tok2" });

    // a passkey of another account doesn't count
    kept.mockReset();
    replies(reauth, [{ flowId: "f", options: {} }, 200], [{ token: "tok3", user: { id: "0xbb", name: "Bo" } }, 200]);
    await expect(newRecoveryCode(session, kept)).rejects.toThrow(/another account/);
    expect(kept).not.toHaveBeenCalled();
  });
});
