// The API calls: endpoints, bodies, bearer tokens, and server errors surfacing
// as readable messages.
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { act, check, createInviteLink, fetchPolls, saveProfile, votePoll } from "./api";

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
  it("sends actions with the session token", async () => {
    respond({ ok: true });
    await act(session, { fn: "addDagVote", args: { recipient: "0xbb", weight: "1" } });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: { fn: "addDagVote" } });
    expect(last().url).toMatch(/action$/);
  });

  it("shows the server's reason when an action fails", async () => {
    respond({ error: "You already give them a reputation vote." }, 400);
    await expect(act(session, { fn: "addDagVote", args: {} })).rejects.toThrow("already give them");
  });

  it("dry-runs several actions at once", async () => {
    respond({ results: [{ ok: true }, { ok: false, reason: "No" }] });
    const results = await check(session, [
      { fn: "leaveTree", args: {} },
      { fn: "switchPositionWithParent", args: {} },
    ]);
    expect(results[1]).toEqual({ ok: false, reason: "No" });
  });

  it("makes invite links on this site", async () => {
    respond({ code: "abc", expires: "" });
    await expect(createInviteLink(session)).resolves.toBe(`${window.location.origin}/invite/abc`);
  });

  it("reads polls (with the token, for my vote) and votes", async () => {
    respond({ polls: [] });
    await fetchPolls(session);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    respond({ poll: {} });
    await votePoll(session, "p1", 2);
    expect(last()).toMatchObject({ body: { option: 2 } });
    expect(last().url).toMatch(/polls\/p1\/vote$/);
  });

  it("saves the profile", async () => {
    respond({ profile: {} });
    await saveProfile(session, "hi", "https://example.com");
    expect(last().body).toEqual({ bio: "hi", link: "https://example.com" });
  });
});
