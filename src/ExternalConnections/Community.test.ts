// Unit tests for the invite, profile, poll and dry-run calls. fetch is mocked;
// we assert the endpoint, method, body and bearer token, and that check
// results are cached until invalidated.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkAction, invalidateChecks } from "./BackendActions";
import {
  closePoll,
  createInvite,
  createPoll,
  formatReputation,
  getInvite,
  listPolls,
  saveProfile,
  votePoll,
} from "./Community";
import type { Api } from "./Passkey";

const backendUrl = "http://backend/";
const api: Api = {
  backendUrl,
  session: { token: "tok", user: { id: "0xaa", name: "Ada" } },
};
const fetchMock = vi.fn();

function respond(data: unknown, status = 200) {
  // a fresh Response per call: a body can only be read once
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(data), { status }));
}

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return {
    url,
    method: init.method,
    auth: init.headers.Authorization,
    body: init.body ? JSON.parse(init.body) : undefined,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  invalidateChecks();
});

describe("invites", () => {
  it("creates an invite as the signed-in user", async () => {
    respond({ code: "abc", expires: "2026-11-05T00:00:00.000Z" });
    await expect(createInvite(api)).resolves.toMatchObject({ code: "abc" });
    expect(lastCall()).toMatchObject({ url: `${backendUrl}invites`, method: "POST", auth: "Bearer tok" });
  });

  it("looks up an invite without signing in, and surfaces the reason it's invalid", async () => {
    respond({ error: "This invite has already been used." }, 400);
    await expect(getInvite(backendUrl, "abc")).rejects.toThrow("already been used");
    expect(lastCall()).toMatchObject({ url: `${backendUrl}invites/abc`, method: "GET" });
  });
});

it("saves a profile", async () => {
  respond({ profile: { bio: "hi", link: "" } });
  await saveProfile(api, "hi", "");
  expect(lastCall()).toMatchObject({ url: `${backendUrl}profile`, body: { bio: "hi", link: "" } });
});

describe("polls", () => {
  it("lists, creates, votes and closes", async () => {
    respond({ polls: [] });
    await expect(listPolls(api)).resolves.toEqual([]);
    expect(lastCall()).toMatchObject({ url: `${backendUrl}polls`, method: "GET", auth: "Bearer tok" });

    respond({ poll: {} });
    await createPoll(api, "Lunch?", ["Pizza", "Sushi"]);
    expect(lastCall().body).toEqual({ question: "Lunch?", options: ["Pizza", "Sushi"] });

    await votePoll(api, "p1", 1);
    expect(lastCall()).toMatchObject({ url: `${backendUrl}polls/p1/vote`, body: { option: 1 } });

    await closePoll(api, "p1");
    expect(lastCall().url).toBe(`${backendUrl}polls/p1/close`);
  });

  it("formats 18-decimal reputation with two decimals", () => {
    expect(formatReputation("2500000000000000000")).toBe("2.50");
    expect(formatReputation("0")).toBe("0.00");
  });
});

describe("checkAction", () => {
  it("dry-runs once per action until invalidated", async () => {
    respond({ results: [{ ok: false, reason: "Join the tree first." }] });
    const args = { recipient: "0xbb", weight: "1" };
    await expect(checkAction(api, "addDagVote", args)).resolves.toEqual({
      ok: false,
      reason: "Join the tree first.",
    });
    expect(lastCall().body).toEqual({ actions: [{ fn: "addDagVote", args }] });
    await checkAction(api, "addDagVote", args);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateChecks();
    await checkAction(api, "addDagVote", args);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is skipped while signed out", () => {
    expect(checkAction({ backendUrl, session: undefined }, "leaveTree", {})).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
