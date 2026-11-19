// The API calls: endpoints, bodies, bearer tokens, and server errors surfacing
// as readable messages. Confirming it's you: a passkey, or Google (asked
// first) for an account without one at hand. Also Google sign-in's two ends:
// what this tab keeps before going to Google (and freeing what waited when the
// browser brings the page Back), and the callback's checks (the state must be
// the one this tab started; it goes back only to paths on this site; linking
// and confirming finish with the signed-in session). And pairing agents with a
// community's agent commons (for one in the cloud, its key made here and the
// code claimed with a proof of it), and the agents' list and revoking. And a
// community's site: reading it, and saving all of it. And a commons'
// proposals: listing them (signed in or not), approving one as a task and
// declining a pending approval.
// @vitest-environment jsdom
import { startAuthentication } from "@simplewebauthn/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  act,
  agentInstructionsUrl,
  approvePairing,
  approveProposal,
  backendUrl,
  browser,
  check,
  claimPairing,
  createCommunity,
  createInviteLink,
  createPairing,
  declineProposal,
  deleteAccount,
  downloadMyData,
  endSession,
  fetchAccount,
  fetchAgents,
  fetchAuthMethods,
  fetchCommunities,
  fetchGraph,
  fetchPairing,
  fetchPasskeys,
  fetchPolls,
  fetchProposals,
  fetchSessions,
  fetchSite,
  finishGoogle,
  isCancel,
  linkGoogle,
  loadSession,
  makeAgentKey,
  newRecoveryCode,
  pairMessage,
  rejectPairing,
  removePasskey,
  revokeAgent,
  sameSitePath,
  saveProfile,
  saveSession,
  saveSite,
  signInWithGoogle,
  signOut,
  signOutEverywhere,
  slugify,
  takeGoogleFlow,
  unlinkGoogle,
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

// Answers by path: each handler gets the request's Authorization header and
// returns [body, status?].
function serve(routes: Record<string, (auth: string | undefined) => [unknown, number?]>) {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const path = String(url).replace(/^https?:\/\/[^/]+\//, "");
    const handler = routes[path];
    const [body, status] = handler
      ? handler((init.headers as Record<string, string>).Authorization)
      : [{ error: "Not found" }, 404];
    return new Response(JSON.stringify(body), { status: status ?? 200 });
  });
}

// The Authorization header of each call to `path`.
const calls = (path: string) =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith(`/${path}`)).map(([, init]) => init.headers.Authorization);

const bodyOf = (path: string) =>
  JSON.parse(fetchMock.mock.calls.find(([url]) => String(url).endsWith(`/${path}`))![1].body);

const reauth: [unknown, number] = [{ error: "Please sign in again first, to confirm it's you.", code: "reauth" }, 401];

const googleUrl = (state: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=x&state=${state}&nonce=n`;

function last() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), method: init.method, auth: init.headers.Authorization, body: init.body && JSON.parse(init.body) };
}

const asked = vi.fn((_: string) => true);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
  browser.leave = vi.fn();
  asked.mockReset();
  asked.mockReturnValue(true);
  vi.stubGlobal("confirm", asked);
});

// The browser bringing this page back from its back-forward cache.
const backFromGoogle = (persisted = true) =>
  window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));

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
    let fresh = { token: "tok2", user: session.user };
    serve({
      "auth/recovery-code": (auth) => (auth === "Bearer tok" ? reauth : [{ recoveryCode: "CODE" }]),
      "auth/me": () => [{ user: session.user, methods: { passkeys: 1, google: null, recoveryCode: true } }],
      "auth/login/options": () => [{ flowId: "f", options: {} }],
      "auth/login/verify": () => [fresh],
      "auth/sign-out": () => [{ ok: true }],
    });
    const kept = vi.fn();
    await expect(newRecoveryCode(session, kept)).resolves.toBe("CODE");
    expect(kept).toHaveBeenCalledWith({ token: "tok2", user: session.user });
    expect(last()).toMatchObject({ url: expect.stringMatching(/auth\/recovery-code$/), auth: "Bearer tok2" });
    // the replaced token is ended on the server, not left in the sessions list
    expect(calls("auth/sign-out")).toEqual(["Bearer tok"]);

    // a passkey of another account doesn't count (and its session is ended)
    kept.mockReset();
    fresh = { token: "tok3", user: { id: "0xbb", name: "Bo" } };
    await expect(newRecoveryCode(session, kept)).rejects.toThrow(/another account/);
    expect(kept).not.toHaveBeenCalled();
    expect(calls("auth/sign-out")).toContain("Bearer tok3");
  });

  it("confirms it's you through Google when the account has no passkeys, after asking", async () => {
    serve({
      "auth/delete": () => reauth,
      "auth/me": () => [{ user: session.user, methods: { passkeys: 0, google: { email: "ada@example.com" }, recoveryCode: false } }],
      "auth/google/start": () => [{ url: googleUrl("st8") }],
    });
    deleteAccount(session, vi.fn(), "Ada").catch(() => {});
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalledWith(googleUrl("st8")));
    expect(asked.mock.calls[0][0]).toMatch(/To delete your account, confirm it's you with Google/);
    // a confirmation, for this session: never a sign-in that could make an account
    expect(bodyOf("auth/google/start")).toEqual({ intent: "confirm", origin: window.location.origin });
    expect(calls("auth/google/start")).toEqual(["Bearer tok"]);
    // no passkey sheet, and back to the account page as this account, to do it again
    expect(calls("auth/login/options")).toEqual([]);
    expect(takeGoogleFlow()).toEqual({
      state: "st8",
      intent: "confirm",
      returnTo: "/account",
      userId: "0xaa",
      action: "delete your account",
    });
  });

  it("stays put, saying nothing, when confirming with Google is declined", async () => {
    serve({
      "auth/recovery-code": () => reauth,
      "auth/me": () => [{ user: session.user, methods: { passkeys: 0, google: { email: "ada@example.com" }, recoveryCode: false } }],
      "auth/google/start": () => [{ url: googleUrl("st8") }],
    });
    asked.mockReturnValue(false);
    const error = await newRecoveryCode(session, vi.fn()).catch((e) => e);
    expect(isCancel(error)).toBe(true);
    expect(calls("auth/google/start")).toEqual([]);
    expect(browser.leave).not.toHaveBeenCalled();
  });

  it("offers Google when the passkey sheet is closed and Google is linked", async () => {
    serve({
      "auth/passkeys/p1/remove": () => reauth,
      "auth/me": () => [{ user: session.user, methods: { passkeys: 1, google: { email: "ada@example.com" }, recoveryCode: true } }],
      "auth/login/options": () => [{ flowId: "f", options: {} }],
      "auth/google/start": () => [{ url: googleUrl("st9") }],
    });
    const closed = Object.assign(new Error("closed"), { name: "NotAllowedError" });
    vi.mocked(startAuthentication).mockRejectedValueOnce(closed);
    removePasskey(session, vi.fn(), "p1").catch(() => {});
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalledWith(googleUrl("st9")));
    expect(asked.mock.calls[0][0]).toMatch(/No passkey confirmed it's you\. To remove that passkey, confirm it's you with Google/);
    expect(bodyOf("auth/google/start")).toMatchObject({ intent: "confirm" });

    // without Google there's nothing else to offer: a closed sheet is just a cancel
    serve({
      "auth/passkeys/p1/remove": () => reauth,
      "auth/me": () => [{ user: session.user, methods: { passkeys: 2, google: null, recoveryCode: true } }],
      "auth/login/options": () => [{ flowId: "f", options: {} }],
    });
    asked.mockClear();
    vi.mocked(startAuthentication).mockRejectedValueOnce(closed);
    await expect(removePasskey(session, vi.fn(), "p1")).rejects.toBe(closed);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("accounts", () => {
  it("asks which ways to sign in the server offers, without a token", async () => {
    respond({ passkey: true, google: true });
    await expect(fetchAuthMethods()).resolves.toEqual({ passkey: true, google: true });
    expect(last()).toMatchObject({ method: "GET", auth: undefined, url: expect.stringMatching(/auth\/methods$/) });
  });

  it("starts Google sign-in: remembers the state in this tab, then goes to Google", async () => {
    respond({ url: googleUrl("abc") });
    signInWithGoogle("/c/club/people?x=1").catch(() => {});
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalledWith(googleUrl("abc")));
    expect(last()).toMatchObject({ method: "POST", auth: undefined, body: { intent: "signin", origin: window.location.origin } });
    expect(JSON.parse(sessionStorage.getItem("anthill.googleFlow")!)).toEqual({
      intent: "signin",
      returnTo: "/c/club/people?x=1",
      state: "abc",
    });
  });

  it("remembers what to open once back, and whether it started from the sign-in dialog", async () => {
    respond({ url: googleUrl("abc") });
    signInWithGoogle("/", { fromSignIn: true, then: "create" }).catch(() => {});
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalled());
    expect(takeGoogleFlow()).toEqual({ state: "abc", intent: "signin", returnTo: "/", fromSignIn: true, then: "create" });
    // and nothing it doesn't know
    sessionStorage.setItem(
      "anthill.googleFlow",
      JSON.stringify({ state: "s", intent: "signin", returnTo: "/", fromSignIn: "yes", then: "settings", action: 3 }),
    );
    expect(takeGoogleFlow()).toEqual({ state: "s", intent: "signin", returnTo: "/", userId: undefined });
    sessionStorage.setItem("anthill.googleFlow", JSON.stringify({ state: "s", intent: "admin", returnTo: "/" }));
    expect(takeGoogleFlow()).toBeUndefined();
  });

  it("frees whatever waited on Google when the browser brings the page back", async () => {
    respond({ url: googleUrl("abc") });
    const trip = signInWithGoogle("/");
    const settled = vi.fn();
    trip.catch(settled);
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalled());
    // an ordinary page show (not from the back-forward cache) changes nothing
    backFromGoogle(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).not.toHaveBeenCalled();
    backFromGoogle();
    await vi.waitFor(() => expect(settled).toHaveBeenCalled());
    // as a cancel: nothing to show
    expect(isCancel(settled.mock.calls[0][0])).toBe(true);
    // still remembered, for going Forward to Google
    expect(takeGoogleFlow()).toMatchObject({ state: "abc" });
  });

  it("goes only to Google's sign-in page", async () => {
    respond({ url: "https://accounts.example.com/o/oauth2/v2/auth?state=abc" });
    await expect(signInWithGoogle("/")).rejects.toThrow(/Couldn't start signing in with Google/);
    respond({ url: "https://accounts.google.com/o/oauth2/v2/auth" });
    await expect(signInWithGoogle("/")).rejects.toThrow(/Couldn't start signing in with Google/);
    expect(browser.leave).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("anthill.googleFlow")).toBeNull();
  });

  it("links Google with a fresh session, bound to this account", async () => {
    respond({ url: googleUrl("lnk") });
    linkGoogle(session, vi.fn()).catch(() => {});
    await vi.waitFor(() => expect(browser.leave).toHaveBeenCalled());
    expect(last()).toMatchObject({ auth: "Bearer tok", body: { intent: "link" } });
    expect(takeGoogleFlow()).toEqual({ state: "lnk", intent: "link", returnTo: "/account", userId: "0xaa" });
    // read once only
    expect(takeGoogleFlow()).toBeUndefined();
  });

  it("goes back only to paths on this site", () => {
    expect(sameSitePath("/c/club/explore?replay=1#top")).toBe("/c/club/explore?replay=1#top");
    expect(sameSitePath("/invite/a%20b")).toBe("/invite/a%20b");
    for (const bad of [
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "evil",
      "",
      undefined,
      42,
      "/auth/google?code=x",
    ]) {
      expect(sameSitePath(bad), String(bad)).toBe("/");
    }
  });

  it("unlinks Google, removes a passkey and deletes the account at the right addresses", async () => {
    respond({ ok: true });
    await unlinkGoogle(session, vi.fn());
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", url: expect.stringMatching(/auth\/google\/unlink$/) });
    await removePasskey(session, vi.fn(), "cred/+1");
    expect(last().url).toMatch(/auth\/passkeys\/cred%2F%2B1\/remove$/);
    await deleteAccount(session, vi.fn(), "Ada");
    expect(last()).toMatchObject({ url: expect.stringMatching(/auth\/delete$/), body: { confirm: "Ada" } });
  });

  it("shows why a passkey can't be removed", async () => {
    respond({ error: "That's your only way to sign in." }, 400);
    await expect(removePasskey(session, vi.fn(), "cred")).rejects.toThrow("only way to sign in");
  });

  it("lists the account, its passkeys and sessions, and ends one", async () => {
    const account = { user: session.user, profile: { bio: "", link: "" }, methods: { passkeys: 2, google: null, recoveryCode: true } };
    respond(account);
    await expect(fetchAccount(session)).resolves.toEqual(account);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok", url: expect.stringMatching(/auth\/me$/) });
    respond({ passkeys: [{ id: "p1", createdAt: "2026-11-01T00:00:00Z", transports: ["internal"] }] });
    await expect(fetchPasskeys(session)).resolves.toHaveLength(1);
    expect(last().url).toMatch(/auth\/passkeys$/);
    respond({ sessions: [{ id: "s1", method: "passkey", device: "Chrome on macOS", createdAt: "", current: true }] });
    await expect(fetchSessions(session)).resolves.toMatchObject([{ id: "s1", current: true }]);
    respond({ ok: true });
    await endSession(session, "s2");
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", url: expect.stringMatching(/auth\/sessions\/s2\/end$/) });
  });

  it("signs out on the server, and everywhere", async () => {
    respond({ ok: true });
    await signOut(session);
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", url: expect.stringMatching(/auth\/sign-out$/) });
    await signOutEverywhere(session);
    expect(last().url).toMatch(/auth\/sign-out-everywhere$/);
  });

  it("saves the account's data as a file", async () => {
    respond({ account: { id: "0xaa" } });
    const createObjectURL = vi.fn((_: Blob) => "blob:anthill/1");
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await downloadMyData(session);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok", url: expect.stringMatching(/auth\/export$/) });
    expect(clicked).toHaveBeenCalled();
    const file = createObjectURL.mock.calls[0][0];
    expect(JSON.parse(await file.text())).toEqual({ account: { id: "0xaa" } });
    clicked.mockRestore();
  });
});

describe("the Google callback", () => {
  const started = (flow: object) => sessionStorage.setItem("anthill.googleFlow", JSON.stringify(flow));
  const query = (q: string) => new URLSearchParams(q);

  it("finishes only a flow this tab started", async () => {
    // nothing started here (a link someone else made)
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toMatchObject({
      ok: false,
      message: expect.stringMatching(/wasn't started from this tab/),
    });
    // started here, but another state comes back
    started({ state: "mine", intent: "signin", returnTo: "/c/club" });
    await expect(finishGoogle(query("code=c&state=theirs"), undefined)).resolves.toMatchObject({
      ok: false,
      returnTo: "/c/club",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    // and the flow is gone either way: the right state now finishes nothing
    await expect(finishGoogle(query("code=c&state=mine"), undefined)).resolves.toMatchObject({ ok: false });
  });

  it("signs in and goes back where the person was", async () => {
    started({ state: "s", intent: "signin", returnTo: "/c/club/polls" });
    respond({ token: "tok", user: session.user, created: false });
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toEqual({
      ok: true,
      session,
      returnTo: "/c/club/polls",
      done: "signedIn",
    });
    expect(last()).toMatchObject({ method: "POST", auth: undefined, body: { state: "s", code: "c" } });
    expect(last().url).toMatch(/auth\/google\/finish$/);
  });

  it("never goes back off this site, whatever was stored", async () => {
    started({ state: "s", intent: "signin", returnTo: "//evil.example/" });
    respond({ token: "tok", user: session.user, created: true });
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toMatchObject({
      ok: true,
      returnTo: "/",
      done: "created",
    });
  });

  it("says when Google sign-in was cancelled", async () => {
    started({ state: "s", intent: "signin", returnTo: "/" });
    await expect(finishGoogle(query("error=access_denied&state=s"), undefined)).resolves.toMatchObject({
      ok: false,
      message: "Google sign-in was cancelled.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's reason when finishing fails", async () => {
    started({ state: "s", intent: "signin", returnTo: "/" });
    respond({ error: "That sign-in has expired. Try again." }, 400);
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toMatchObject({
      ok: false,
      message: "That sign-in has expired. Try again.",
    });
  });

  it("links with the signed-in session, and only for the account it started from", async () => {
    started({ state: "s", intent: "link", returnTo: "/account", userId: "0xaa" });
    respond({ ok: true });
    await expect(finishGoogle(query("code=c&state=s"), session)).resolves.toMatchObject({
      ok: true,
      session,
      done: "linked",
    });
    expect(last()).toMatchObject({ auth: "Bearer tok", body: { state: "s", code: "c" } });

    fetchMock.mockClear();
    started({ state: "s", intent: "link", returnTo: "/account", userId: "0xaa" });
    const other = { token: "tok-bo", user: { id: "0xbb", name: "Bo" } };
    await expect(finishGoogle(query("code=c&state=s"), other)).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says what a failed flow was for", async () => {
    started({ state: "s", intent: "link", returnTo: "/account", userId: "0xaa" });
    respond({ error: "That Google account is already linked to another Anthill account." }, 400);
    await expect(finishGoogle(query("code=c&state=s"), session)).resolves.toEqual({
      ok: false,
      message: "That Google account is already linked to another Anthill account.",
      returnTo: "/account",
      intent: "link",
    });
  });

  it("confirms it's you with the signed-in session, keeps the fresh one and ends the old one", async () => {
    started({ state: "s", intent: "confirm", returnTo: "/account", userId: "0xaa", action: "delete your account" });
    serve({
      "auth/google/finish": (auth) => (auth === "Bearer tok" ? [{ token: "tok-new", user: session.user }] : [{ error: "no" }, 401]),
      "auth/sign-out": () => [{ ok: true }],
    });
    await expect(finishGoogle(query("code=c&state=s"), session)).resolves.toEqual({
      ok: true,
      session: { token: "tok-new", user: session.user },
      returnTo: "/account",
      done: "confirmed",
      action: "delete your account",
    });
    expect(bodyOf("auth/google/finish")).toEqual({ state: "s", code: "c" });
    expect(calls("auth/sign-out")).toEqual(["Bearer tok"]);
  });

  it("shows the server's refusal of another Google account when confirming, keeping the session", async () => {
    started({ state: "s", intent: "confirm", returnTo: "/account", userId: "0xaa" });
    serve({
      "auth/google/finish": () => [{ error: "That Google account isn't the one linked to this Anthill account." }, 400],
      "auth/sign-out": () => [{ ok: true }],
    });
    await expect(finishGoogle(query("code=c&state=s"), session)).resolves.toMatchObject({
      ok: false,
      intent: "confirm",
      message: expect.stringMatching(/isn't the one linked/),
    });
    expect(calls("auth/sign-out")).toEqual([]);
  });

  it("confirms only for the account still signed in", async () => {
    started({ state: "s", intent: "confirm", returnTo: "/account", userId: "0xaa" });
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toMatchObject({ ok: false, intent: "confirm" });
    started({ state: "s", intent: "confirm", returnTo: "/account", userId: "0xaa" });
    await expect(
      finishGoogle(query("code=c&state=s"), { token: "tok-bo", user: { id: "0xbb", name: "Bo" } }),
    ).resolves.toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes on what the sign-in was started with", async () => {
    started({ state: "s", intent: "signin", returnTo: "/", fromSignIn: true, then: "create" });
    respond({ token: "tok", user: session.user, created: true });
    await expect(finishGoogle(query("code=c&state=s"), undefined)).resolves.toMatchObject({
      ok: true,
      done: "created",
      fromSignIn: true,
      then: "create",
    });
  });
});

describe("agents", () => {
  const pairing = { id: "p1", code: "ABCD-EFGH", expiresAt: "2026-11-18T12:30:00.000Z", prompt: "Fetch it." };

  it("starts a pairing with what the agent is, signed in", async () => {
    respond({ ...pairing, loopPrompt: "Do a round." });
    await expect(createPairing(session, "builders", { harness: "claude-code", modelFamily: "claude" })).resolves.toEqual({
      ...pairing,
      loopPrompt: "Do a round.",
    });
    expect(last()).toMatchObject({
      method: "POST",
      auth: "Bearer tok",
      body: { harness: "claude-code", modelFamily: "claude" },
    });
    expect(last().url).toBe(`${backendUrl}c/builders/commons/pairings`);
  });

  it("writes the loop prompt itself when the server doesn't", async () => {
    respond(pairing);
    const made = await createPairing(session, "builders", { harness: "codex", modelFamily: "gpt" });
    expect(agentInstructionsUrl("builders")).toBe(`${backendUrl}c/builders/commons/agent.md`);
    expect(made.loopPrompt).toBe(`Read your instructions verbatim: run \`curl -fsSL ${backendUrl}c/builders/commons/agent.md\` in your shell and follow the page exactly as printed (not through a web-fetch or summarizing tool, which would reword its commands and rules), and do one iteration as it says.`);
  });

  it("asks where a pairing is, and approves or rejects it", async () => {
    const claim = { modelFamily: "claude", harness: "claude-code", fingerprint: "3f2a-91bc-07de-55e1" };
    respond({ id: "p1", status: "claimed", expiresAt: pairing.expiresAt, claim });
    await expect(fetchPairing(session, "builders", "p1")).resolves.toMatchObject({ status: "claimed", claim });
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    expect(last().url).toMatch(/\/c\/builders\/commons\/pairings\/p1$/);

    respond({ agent: { keyId: "k1", modelFamily: "claude", harness: "claude-code" } });
    await expect(approvePairing(session, "builders", "p1")).resolves.toEqual({
      keyId: "k1",
      modelFamily: "claude",
      harness: "claude-code",
    });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok" });
    expect(last().url).toMatch(/\/commons\/pairings\/p1\/approve$/);

    respond({ ok: true });
    await rejectPairing(session, "builders", "p1");
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok" });
    expect(last().url).toMatch(/\/commons\/pairings\/p1\/reject$/);
  });

  it("says why an approval failed (the coordinator out of reach)", async () => {
    respond({ error: "Couldn't reach the commons' coordinator." }, 502);
    await expect(approvePairing(session, "builders", "p1")).rejects.toMatchObject({
      status: 502,
      message: "Couldn't reach the commons' coordinator.",
    });
  });

  it("signs a claim over the commons' canonical message", () => {
    expect(pairMessage({ modelFamily: "claude", code: "C-1", harness: "claude code", community: "builders", agentKey: "k\"1" })).toBe(
      'anthill-commons/pair/v1\n{"agentKey":"k\\"1","code":"C-1","community":"builders","harness":"claude code","modelFamily":"claude"}',
    );
  });

  it("claims a code for a key made here, without a session, with a proof of the key", async () => {
    const key = await makeAgentKey();
    // base64url DER, no padding: a 44-byte SPKI, and a PKCS8 the kit reads
    expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{59}$/);
    expect(key.privateKey).toMatch(/^[A-Za-z0-9_-]+$/);
    respond({ status: "claimed", fingerprint: "3f2a-91bc", expiresAt: "2026-11-18T12:30:00.000Z" });
    await expect(claimPairing("builders", "C-1", { harness: "claude-code", modelFamily: "claude" }, key)).resolves.toMatchObject({
      fingerprint: "3f2a-91bc",
    });
    expect(last()).toMatchObject({ method: "POST", auth: undefined });
    expect(last().url).toBe(`${backendUrl}c/builders/commons/pairings/claim`);
    const { proof, ...claim } = last().body;
    expect(claim).toEqual({ agentKey: key.publicKey, code: "C-1", harness: "claude-code", modelFamily: "claude" });
    const bytes = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey("spki", bytes(key.publicKey), { name: "Ed25519" }, false, ["verify"]);
    const message = new TextEncoder().encode(pairMessage({ ...claim, community: "builders" }));
    expect(proof).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await crypto.subtle.verify({ name: "Ed25519" }, publicKey, bytes(proof), message)).toBe(true);
  });

  it("lists your agents and revokes one, with or without a reason", async () => {
    const agent = {
      keyId: "k/1",
      modelFamily: "gpt",
      harness: "codex",
      active: true,
      registeredAt: "2026-11-18T10:00:00.000Z",
    };
    respond({ agents: [agent] });
    await expect(fetchAgents(session, "builders")).resolves.toEqual([agent]);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    expect(last().url).toMatch(/\/c\/builders\/commons\/agents$/);

    respond({ ok: true });
    await revokeAgent(session, "builders", "k/1", "key leaked");
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: { reason: "key leaked" } });
    // (a key id is one path segment, whatever it holds)
    expect(last().url).toMatch(/\/commons\/agents\/k%2F1\/revoke$/);
    await revokeAgent(session, "builders", "k/1");
    expect(last().body).toEqual({});
  });
});

describe("proposals", () => {
  const proposal = {
    id: "p/1",
    title: "Fix the login test",
    proposedAt: "2026-11-18T10:00:00.000Z",
    evidence: [{ kind: "failingTest", text: "login fails: npm test" }],
    author: { agent: "k1", modelFamily: "claude", owner: { id: "0xaa", name: "Ada" } },
    task: null,
  };

  it("lists a commons' proposals, signed in or not", async () => {
    const list = { proposals: [proposal], total: 1, canApprove: false };
    respond(list);
    await expect(fetchProposals("builders")).resolves.toEqual(list);
    expect(last()).toMatchObject({ method: "GET", auth: undefined });
    expect(last().url).toBe(`${backendUrl}c/builders/commons/proposals`);
    respond({ ...list, canApprove: true, owners: [{ id: "0xaa", name: "Ada" }], youAreOwner: true });
    await expect(fetchProposals("builders", session)).resolves.toMatchObject({ canApprove: true, youAreOwner: true });
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
  });

  it("is a 404 where the server doesn't run the commons", async () => {
    respond({ error: "Not found" }, 404);
    await expect(fetchProposals("club")).rejects.toMatchObject({ status: 404 });
  });

  it("approves one as a task, and declines a pending approval", async () => {
    const pending = { ...proposal, task: { status: "pending", id: "t-1", ring: 1, sizeEstimate: 40, acceptanceTestPaths: ["test/a.test.ts"], specAuthor: { id: "0xaa", name: "Ada" } } };
    respond({ added: true, proposal: pending });
    await expect(
      approveProposal(session, "builders", "p/1", { ring: 1, sizeEstimate: 40, acceptanceTests: ["test/a.test.ts"] }),
    ).resolves.toEqual({ added: true, proposal: pending });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: { ring: 1, sizeEstimate: 40, acceptanceTests: ["test/a.test.ts"] } });
    // (a proposal id is one path segment, whatever it holds)
    expect(last().url).toBe(`${backendUrl}c/builders/commons/proposals/p%2F1/approve`);

    await approveProposal(session, "builders", "p/1", { ring: 0, sizeEstimate: 0, acceptanceTests: ["a"], specAuthor: "0xbb" });
    expect(last().body).toEqual({ ring: 0, sizeEstimate: 0, acceptanceTests: ["a"], specAuthor: "0xbb" });

    respond({ removed: true, proposal });
    await expect(declineProposal(session, "builders", "p/1")).resolves.toEqual({ removed: true, proposal });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: {} });
    expect(last().url).toBe(`${backendUrl}c/builders/commons/proposals/p%2F1/decline`);
  });

  it("says why an approval was refused", async () => {
    respond({ error: "That proposal is already a task.", code: "already-a-task" }, 400);
    await expect(
      approveProposal(session, "builders", "p1", { ring: 2, sizeEstimate: 1, acceptanceTests: ["a"] }),
    ).rejects.toMatchObject({ status: 400, code: "already-a-task", message: "That proposal is already a task." });
  });
});

describe("site", () => {
  const site = { pages: { explore: true, polls: false, people: true, agents: false }, accent: "teal", about: "# Hi" };

  it("reads a community's site, signed out or with the token (a private one needs it)", async () => {
    respond({ site });
    await expect(fetchSite("club")).resolves.toEqual(site);
    expect(last()).toMatchObject({ method: "GET", auth: undefined });
    expect(last().url).toBe(`${backendUrl}c/club/site`);
    await fetchSite("back room", session);
    expect(last()).toMatchObject({ method: "GET", auth: "Bearer tok" });
    expect(last().url).toBe(`${backendUrl}c/back%20room/site`);
  });

  it("saves the whole site, signed in, and answers the community", async () => {
    respond({ community: { id: "club", site: { pages: site.pages, accent: "teal", hasAbout: true } } });
    await expect(saveSite(session, "club", site)).resolves.toMatchObject({ id: "club", site: { accent: "teal" } });
    expect(last()).toMatchObject({ method: "POST", auth: "Bearer tok", body: site });
    expect(last().url).toBe(`${backendUrl}c/club/site`);
  });

  it("surfaces the server's refusal in its words", async () => {
    respond({ error: "Choose an accent colour: indigo, blue, teal." }, 400);
    await expect(saveSite(session, "club", { ...site, accent: "plaid" })).rejects.toMatchObject({
      message: "Choose an accent colour: indigo, blue, teal.",
      status: 400,
    });
    respond({ error: "Only the founder can change this community's settings." }, 403);
    await expect(saveSite(session, "club", site)).rejects.toMatchObject({ status: 403 });
  });
});
