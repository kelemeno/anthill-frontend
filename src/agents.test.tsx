// The Agents page against a fake server: the tab shows only for a community
// with an agent commons; visitors are asked to sign in and non-members to
// join; a member picks their agent and gets the server's prompt (and the loop
// command) to copy; the page asks after the pairing every few seconds while
// it's in view, stops once it's settled, and keeps it while you look at other
// pages (by the latest expiry the server gave); it shows the claim's
// fingerprint to approve (a failure to reach the commons can be tried again, a
// refusal isn't offered again), then lists the agent, and no late poll answer
// undoes that; an agent is revoked after a confirm, with a reason if given,
// also by someone who has left; the commons' model families, when given, are
// checked. Claude Code in the cloud, the first choice: the page makes the
// agent's key, claims the code with a proof that verifies, approves it, and
// shows the key once with the setup steps, keeping it nowhere; a browser
// without Ed25519 is told so. Codex in the cloud, the second, the same way,
// as a codex agent of the gpt family, with OpenAI's steps and links. And a
// first visit's tour waits for a community's home page.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { backendUrl, type Graph, type Person } from "./api";
import { forgetMemories } from "./cache";
import { POLL_MS } from "./pages/Agents";
import { AppProvider } from "./state";

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(async () => ({})),
  startAuthentication: vi.fn(async () => ({})),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//// a fake server

type Reply = { status?: number; body: unknown };
let routes: Record<string, (init: RequestInit) => Reply | Promise<Reply>> = {};
const calls: { path: string; init: RequestInit }[] = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\//, "");
  calls.push({ path, init });
  const route = routes[path];
  const answer = route ? route(init) : { status: 404, body: { error: "Not found" } };
  if (answer instanceof Promise) {
    // a reply held back (see held): a plain response, read in microtasks only,
    // so a test can order it against others exactly
    const reply = await answer;
    const status = reply.status ?? 200;
    return { ok: status < 300, status, json: async () => reply.body } as Response;
  }
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
});
// A route whose next replies wait until released.
function held() {
  const waiting: ((r: Reply) => void)[] = [];
  return {
    route: () => new Promise<Reply>((r) => waiting.push(r)),
    waiting: () => waiting.length,
    release: (reply: Reply) => waiting.shift()!(reply),
  };
}
// lets every pending promise run, but nothing scheduled (like React's renders)
const microtasks = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
};
const callsTo = (path: string) => calls.filter((c) => c.path === path);
const bodyOf = (init: RequestInit) => JSON.parse(String(init.body));

class FakeSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  close() {}
}

const ada = { token: "tok-ada", user: { id: "0xada", name: "Ada" } };
const signedInAs = (s: typeof ada) => localStorage.setItem("anthill.session", JSON.stringify(s));

const node = (id: string, name: string): Person => ({
  id,
  name,
  currentRep: "1000000000000000000",
  totalWeight: "0",
  depth: 0,
  sentTreeVote: "0x0000000000000000000000000000000000000001",
  recTreeVotes: [],
  sentDagVotes: [],
  recDagVotes: [],
});

const commons = { coordinator: "https://coordinator.example", site: "https://commons.example" };
const community = (id: string, extra: object = {}) => ({
  id,
  name: id === "builders" ? "Builders" : "Club",
  description: "",
  visibility: "public",
  joinPolicy: "open",
  createdAt: "2026-11-01T00:00:00Z",
  founder: null,
  members: 1,
  rootName: "Bo",
  isFounder: false,
  you: null,
  ...extra,
});
const graphOf = (id: string, nodes: Person[], extra: object = {}): Graph =>
  ({
    version: 1,
    rootId: nodes[0]?.id ?? "0x1",
    maxRelRootDepth: 0,
    nodes: Object.fromEntries(nodes.map((n) => [n.id, n])),
    community: community(id, extra),
  }) as Graph;

// Builders has a commons; Ada is in it unless `member` is false
function server(member = true) {
  const nodes = [node("0xbo", "Bo"), ...(member ? [node("0xada", "Ada")] : [])];
  routes = {
    communities: () => ({ body: { communities: [community("builders", { commons }), community("club")] } }),
    "c/builders/graph": () => ({ body: graphOf("builders", nodes, { commons }) }),
    "c/club/graph": () => ({ body: graphOf("club", nodes, { commons: null }) }),
    "auth/me": () => ({ body: { user: ada.user } }),
    "c/builders/commons/agents": () => ({ body: { agents: [] } }),
  };
}

const expiresAt = () => new Date(Date.now() + 30 * 60_000).toISOString();
const pairing = () => ({
  id: "p1",
  code: "ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
  expiresAt: expiresAt(),
  prompt: "You're working for Ada in Builders.\nPairing code: ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
  loopPrompt: "Fetch the instructions and do one iteration.",
});
const claim = { modelFamily: "claude", harness: "claude-code", fingerprint: "3f2a-91bc-07de-55e1" };
const pairingIs = (status: string, extra: object = {}) => () => ({
  body: { id: "p1", status, expiresAt: expiresAt(), ...extra },
});
const agent = (extra: object = {}) => ({
  keyId: "ed25519:abcdef0123456789",
  modelFamily: "claude",
  harness: "claude-code",
  active: true,
  registeredAt: "2026-11-18T10:00:00Z",
  ...extra,
});

//// rendering

let root: Root | undefined;

async function show(path: string) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <App />
        </AppProvider>
      </MemoryRouter>,
    );
  });
}

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out; page says: ${text().slice(0, 400)}`);
    await tick();
  }
}
// moves the page's clock on (the poll's timer), letting answers arrive
const later = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const text = () => document.body.textContent ?? "";
const linkTo = (href: string) => document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
const button = (label: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button "${label}"; page says: ${text().slice(0, 400)}`);
  return found as HTMLButtonElement;
};
const click = (b: HTMLElement) => act(async () => b.click());
const choose = (value: string) => click(document.querySelector<HTMLInputElement>(`input[value="${value}"]`)!);
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const inputLabelled = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  return document.getElementById(l!.htmlFor) as HTMLInputElement;
};
const tabLinks = () => [...document.querySelectorAll("nav a")].map((a) => a.textContent?.trim());
let visibility: DocumentVisibilityState = "visible";
const setVisibility = (v: DocumentVisibilityState) =>
  act(async () => {
    visibility = v;
    document.dispatchEvent(new Event("visibilitychange"));
  });
const writeText = vi.fn(async (_: string) => {});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  forgetMemories();
  // the tour stays away
  localStorage.setItem("anthill.tourSeen", "1");
  server();
  calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("confirm", vi.fn(() => true));
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("the Agents tab", () => {
  it("shows only in a community with an agent commons", async () => {
    await show("/c/club");
    await until(() => tabLinks().includes("People"));
    expect(tabLinks()).not.toContain("Agents");
    await act(async () => root!.unmount());

    await show("/c/builders");
    await until(() => tabLinks().includes("Agents"));
    const link = [...document.querySelectorAll("nav a")].find((a) => a.textContent?.trim() === "Agents")!;
    expect(link.getAttribute("href")).toBe("/c/builders/agents");
  });

  it("says a community without a commons has no agents", async () => {
    await show("/c/club/agents");
    await until(() => text().includes("doesn't have an agent commons"));
  });
});

describe("the Agents page", () => {
  it("asks visitors to sign in, with the commons' links", async () => {
    await show("/c/builders/agents");
    await until(() => text().includes("Sign in to connect an agent"));
    const links = [...document.querySelectorAll("main a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://commons.example");
    expect(links).toContain(`${backendUrl}c/builders/commons/agent.md`);
    expect(callsTo("c/builders/commons/agents")).toHaveLength(0);
  });

  it("asks people signed in but not in the community to join", async () => {
    server(false);
    signedInAs(ada);
    await show("/c/builders/agents");
    await until(() => text().includes("Join Builders first"));
    expect(button("Join Builders")).toBeTruthy();
    expect(text()).not.toContain("Get a prompt");
    // nothing connected here before: no list of agents
    await until(() => callsTo("c/builders/commons/agents").length === 1);
    await tick();
    expect(text()).not.toContain("Your agents");
  });

  it("still lists, and revokes, the agents of someone who left", async () => {
    server(false);
    signedInAs(ada);
    routes["c/builders/commons/agents"] = () => ({ body: { agents: [agent()] } });
    let revoked = 0;
    routes[`c/builders/commons/agents/${encodeURIComponent(agent().keyId)}/revoke`] = () => {
      revoked++;
      routes["c/builders/commons/agents"] = () => ({ body: { agents: [agent({ active: false })] } });
      return { body: { ok: true } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("Join Builders first") && text().includes("Claude Code · claude"));
    expect(text()).toContain("Your agents");
    expect(text()).not.toContain("Get a prompt");

    await click(button("Revoke"));
    const confirmButton = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent?.trim() === "Revoke",
    ) as HTMLButtonElement;
    await click(confirmButton);
    await until(() => text().includes("Revoked"));
    expect(revoked).toBe(1);
  });

  it("pairs an agent: prompt, fingerprint, approve, listed", async () => {
    signedInAs(ada);
    let made: unknown;
    routes["c/builders/commons/pairings"] = (init) => {
      made = bodyOf(init);
      return { body: pairing() };
    };
    routes["c/builders/commons/pairings/p1"] = pairingIs("open");
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));

    await choose("claude-code");
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code: ABCD"));
    expect(made).toEqual({ harness: "claude-code", modelFamily: "claude" });
    expect(callsTo("c/builders/commons/pairings")[0].init.headers).toMatchObject({ Authorization: "Bearer tok-ada" });
    expect(text()).toContain("/loop 30m Fetch the instructions and do one iteration.");
    expect(text()).toContain("coordinator.example");
    expect(text()).toContain("Waiting for your agent");
    // where to run Claude Code on your own machine, with links to it (the
    // cloud is its own choice)
    expect(linkTo("https://code.claude.com/docs/en/setup")?.getAttribute("target")).toBe("_blank");
    expect(text()).toContain("claude --permission-mode auto");
    // auto mode is told about the hosts beyond GitHub, the coordinator too
    // when it's on a host of its own
    const trust = [...document.querySelectorAll("p")].find((p) => p.textContent?.includes("Auto mode"))!;
    expect(trust.textContent).toContain(`it trusts ${new URL(backendUrl).host} and coordinator.example and GitHub`);
    expect(linkTo("https://claude.ai/code")).toBeNull();
    expect(text()).not.toContain("Claude Code on the web");
    expect(text()).not.toContain("COMMONS_AGENT_KEY");
    expect(text()).toContain("for 7 days: then run it again");
    expect(linkTo("https://chatgpt.com/codex/")).toBeNull();

    // copying says so
    await click(document.querySelector<HTMLButtonElement>('button[aria-label="Copy the prompt"]')!);
    expect(writeText).toHaveBeenCalledWith(pairing().prompt);
    expect(document.querySelector('button[aria-label="Copied the prompt"]')?.textContent).toContain("Copied");

    // asked every few seconds
    await later(POLL_MS);
    await until(() => callsTo("c/builders/commons/pairings/p1").length === 1);
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    expect(text()).toContain("Is this the fingerprint your agent printed?");

    let approved = 0;
    routes["c/builders/commons/pairings/p1/approve"] = () => {
      approved++;
      routes["c/builders/commons/agents"] = () => ({ body: { agents: [agent()] } });
      return { body: { agent: { keyId: agent().keyId, modelFamily: "claude", harness: "claude-code" } } };
    };
    await click(button("Approve"));
    await until(() => text().includes("Connected."));
    expect(approved).toBe(1);
    await until(() => text().includes("Claude Code · claude"));
    expect(text()).toContain("Active");

    // and no more asking once it's settled
    const asked = callsTo("c/builders/commons/pairings/p1").length;
    await later(POLL_MS * 3);
    expect(callsTo("c/builders/commons/pairings/p1")).toHaveLength(asked);
  });

  it("asks only while the page is in view, and stops when it's left", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("open");
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code"));

    await setVisibility("hidden");
    await later(POLL_MS * 3);
    expect(callsTo("c/builders/commons/pairings/p1")).toHaveLength(0);
    await setVisibility("visible");
    await until(() => callsTo("c/builders/commons/pairings/p1").length === 1);

    await act(async () => root!.unmount());
    root = undefined;
    await later(POLL_MS * 3);
    expect(callsTo("c/builders/commons/pairings/p1")).toHaveLength(1);
  });

  it("shows the same pairing on coming back to the page", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("open");
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code"));
    const tab = (label: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) => a.textContent?.trim() === label)!;
    await click(tab("People"));
    await until(() => !text().includes("Pairing code"));
    await click(tab("Agents"));
    await until(() => text().includes("Pairing code"));
    expect(callsTo("c/builders/commons/pairings")).toHaveLength(1);

    // starting over ends the code
    routes["c/builders/commons/pairings/p1/reject"] = () => ({ body: { ok: true } });
    await click(button("Start over"));
    await until(() => text().includes("Which agent?"));
    expect(callsTo("c/builders/commons/pairings/p1/reject")).toHaveLength(1);
  });

  it("keeps the pairing, and says why, when starting over can't end it", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    // (an approval whose answer was lost: Anthill can't tell yet whether it landed)
    routes["c/builders/commons/pairings/p1/reject"] = () => ({
      status: 502,
      body: { error: "Your approval may have reached the commons, and Anthill can't check that right now.", code: "approval unsure" },
    });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    await click(button("Start over"));
    await until(() => text().includes("Couldn't end this pairing: Your approval may have reached the commons"));
    expect(callsTo("c/builders/commons/pairings/p1/reject")).toHaveLength(1);
    expect(text()).toContain("3f2a-91bc-07de-55e1");
    expect(text()).not.toContain("Get a prompt");
  });

  it("keeps a claim approvable when approving fails, and says a lost pairing ran out", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    routes["c/builders/commons/pairings/p1/approve"] = () => ({
      status: 502,
      body: { error: "Couldn't reach the commons' coordinator." },
    });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    const listed = callsTo("c/builders/commons/agents").length;
    await click(button("Approve"));
    await until(() => text().includes("Couldn't approve it: Couldn't reach the commons' coordinator."));
    expect(text()).toContain("Your agent is still waiting, so you can try again.");
    expect(button("Approve").disabled).toBe(false);
    // a lost answer may have connected it: Your agents is asked again
    await until(() => callsTo("c/builders/commons/agents").length > listed);

    // the server forgot it (a restart drops open pairings)
    delete routes["c/builders/commons/pairings/p1"];
    await later(POLL_MS);
    await until(() => text().includes("The code ran out"));
    expect(button("Connect another")).toBeTruthy();
  });

  it("doesn't offer to try again when the commons refuses, and shows how the pairing ended", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    routes["c/builders/commons/pairings/p1/approve"] = () => {
      // (a server that ends a refused pairing)
      routes["c/builders/commons/pairings/p1"] = pairingIs("rejected", { claim });
      return {
        status: 400,
        body: {
          error: 'The commons refused it: model family "grok" is not one of rules.modelFamilies',
          code: "invalid-value",
        },
      };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    const asked = callsTo("c/builders/commons/pairings/p1").length;
    await click(button("Approve"));
    await until(() => text().includes("Couldn't approve it: The commons refused it"));
    expect(text()).not.toContain("try again");
    // asked at once, not at the next poll
    await until(() => text().includes("Rejected:"));
    expect(callsTo("c/builders/commons/pairings/p1")).toHaveLength(asked + 1);
    expect(button("Connect another")).toBeTruthy();
  });

  it("doesn't offer to try again when the key is taken", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    routes["c/builders/commons/pairings/p1/approve"] = () => ({
      status: 400,
      body: { error: "The commons already has this agent's key, for someone else.", code: "key taken" },
    });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    await click(button("Approve"));
    await until(() => text().includes("Couldn't approve it: The commons already has this agent's key"));
    expect(text()).not.toContain("try again");
  });

  it("keeps an approval when a poll from before it answers late", async () => {
    signedInAs(ada);
    routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));

    // a poll goes out, and its answer (read before the approval) is held
    const poll = held();
    routes["c/builders/commons/pairings/p1"] = poll.route;
    await later(POLL_MS);
    await until(() => poll.waiting() === 1);
    const approve = held();
    routes["c/builders/commons/pairings/p1/approve"] = approve.route;
    await click(button("Approve"));
    await until(() => approve.waiting() === 1);
    routes["c/builders/commons/pairings/p1"] = pairingIs("approved", { claim });

    // the approval lands, then the old answer, before the page renders again
    approve.release({ body: { agent: { keyId: agent().keyId, modelFamily: "claude", harness: "claude-code" } } });
    await microtasks();
    poll.release({ body: { id: "p1", status: "claimed", expiresAt: expiresAt(), claim } });
    await microtasks();
    await tick();
    expect(text()).toContain("Connected.");
    expect(text()).not.toContain("Is this the fingerprint");
    // and it stays settled: no more asking
    const asked = callsTo("c/builders/commons/pairings/p1").length;
    await later(POLL_MS * 2);
    expect(callsTo("c/builders/commons/pairings/p1")).toHaveLength(asked);
  });

  it("shows a claim again on coming back after the code's own expiry, while it can be approved", async () => {
    signedInAs(ada);
    // a code that runs out in a moment, claimed: the server gives time to approve
    const soon = new Date(Date.now() + 400).toISOString();
    routes["c/builders/commons/pairings"] = () => ({ body: { ...pairing(), expiresAt: soon } });
    routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("claude-code");
    await click(button("Get a prompt"));
    await later(POLL_MS);
    await until(() => text().includes("3f2a-91bc-07de-55e1"));
    const tab = (label: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) => a.textContent?.trim() === label)!;
    await click(tab("People"));
    await until(() => !text().includes("3f2a-91bc-07de-55e1"));
    await until(() => Date.now() > Date.parse(soon) + 50);
    await click(tab("Agents"));
    await until(() => text().includes("Your agents"));
    expect(text()).toContain("3f2a-91bc-07de-55e1");
    expect(button("Approve")).toBeTruthy();
    expect(callsTo("c/builders/commons/pairings")).toHaveLength(1);
  });

  it("checks the model family against the commons' own, when the server gives them", async () => {
    signedInAs(ada);
    const families = { ...commons, modelFamilies: ["claude", "gpt", "gemini"] };
    routes["c/builders/graph"] = () => ({ body: graphOf("builders", [node("0xbo", "Bo"), node("0xada", "Ada")], { commons: families }) });
    let made: unknown;
    routes["c/builders/commons/pairings"] = (init) => {
      made = bodyOf(init);
      return { body: pairing() };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await click(document.querySelector<HTMLInputElement>('input[value="other"]')!);
    expect(text()).toContain("one of: claude, gpt, gemini");
    await act(async () => {
      typeInto(inputLabelled("What it runs in"), "opencode");
      typeInto(inputLabelled("Model family"), "grok");
    });
    await click(button("Get a prompt"));
    expect(text()).toContain("This commons takes one of: claude, gpt, gemini.");
    expect(made).toBeUndefined();
    await act(async () => typeInto(inputLabelled("Model family"), "gemini"));
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code"));
    expect(made).toEqual({ harness: "opencode", modelFamily: "gemini" });
  });

  it("sends what another agent is, checking the model family", async () => {
    signedInAs(ada);
    let made: unknown;
    routes["c/builders/commons/pairings"] = (init) => {
      made = bodyOf(init);
      return { body: { ...pairing(), loopPrompt: undefined } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    const other = document.querySelector<HTMLInputElement>('input[value="other"]')!;
    await click(other);
    // the harness rule the backend and the commons share: printable ASCII
    await act(async () => {
      typeInto(inputLabelled("What it runs in"), "Ünicode agent");
      typeInto(inputLabelled("Model family"), "gemini");
    });
    await click(button("Get a prompt"));
    expect(text()).toContain("plain letters, digits and punctuation");
    expect(made).toBeUndefined();
    await act(async () => {
      typeInto(inputLabelled("What it runs in"), " opencode ");
      typeInto(inputLabelled("Model family"), "Gemini Pro");
    });
    await click(button("Get a prompt"));
    expect(text()).toContain("One lowercase word");
    expect(made).toBeUndefined();

    await act(async () => typeInto(inputLabelled("Model family"), "Gemini"));
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code"));
    expect(made).toEqual({ harness: "opencode", modelFamily: "gemini" });
    // no /loop outside Claude Code, and the loop prompt made here
    expect(text()).not.toContain("/loop");
    expect(text()).toContain(`Read your instructions verbatim: run \`curl -fsSL ${backendUrl}c/builders/commons/agent.md\` in your shell and follow the page exactly as printed (not through a web-fetch or summarizing tool, which would reword its commands and rules), and do one iteration as it says.`);
  });

  it("links to Codex, with a loop that runs in its terminal, when Codex on your own machine is picked", async () => {
    signedInAs(ada);
    let made: unknown;
    routes["c/builders/commons/pairings"] = (init) => {
      made = bodyOf(init);
      return { body: { ...pairing(), loopPrompt: "Do one 'iteration'." } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    const own = document.querySelector<HTMLInputElement>('input[value="codex"]')!;
    expect(own.closest("label")?.textContent).toBe("Codex on your own machine");
    await click(own);
    await click(button("Get a prompt"));
    await until(() => text().includes("Pairing code"));
    expect(made).toEqual({ harness: "codex", modelFamily: "gpt" });

    expect(linkTo("https://learn.chatgpt.com/docs/codex/cli")?.textContent).toContain("install the Codex CLI");
    expect(linkTo("https://learn.chatgpt.com/docs/codex/cli")?.getAttribute("rel")).toBe("noreferrer");
    // the cloud is its own choice now, not a way that "fits less well"
    expect(linkTo("https://chatgpt.com/codex/")).toBeNull();
    expect(text()).not.toContain("fits less well");
    expect(text()).not.toContain("COMMONS_AGENT_KEY");
    expect(linkTo("https://claude.ai/code")).toBeNull();
    expect(text()).not.toContain("/loop");
    expect(text()).toContain("press Ctrl-C while it waits");
    // the prompt's own quotes can't end the shell's
    expect(text()).toContain(
      `while :; do codex exec --skip-git-repo-check --sandbox danger-full-access 'Do one '\\''iteration'\\''.'; sleep 1800; done`,
    );
  });

  it("revokes an agent after asking, with a reason", async () => {
    signedInAs(ada);
    routes["c/builders/commons/agents"] = () => ({ body: { agents: [agent()] } });
    let revoked: unknown;
    routes[`c/builders/commons/agents/${encodeURIComponent(agent().keyId)}/revoke`] = (init) => {
      revoked = bodyOf(init);
      routes["c/builders/commons/agents"] = () => ({
        body: { agents: [agent({ active: false, revokedReason: "key leaked" })] },
      });
      return { body: { ok: true } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("Claude Code · claude"));

    await click(button("Revoke"));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Revoke this agent?");
    // cancelling changes nothing
    await click(button("Cancel"));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(revoked).toBeUndefined();

    await click(button("Revoke"));
    await act(async () => typeInto(inputLabelled("Why (optional)"), "key leaked"));
    const confirmButton = [...document.querySelectorAll('[role="dialog"] button')].find(
      (b) => b.textContent?.trim() === "Revoke",
    ) as HTMLButtonElement;
    await click(confirmButton);
    await until(() => text().includes("Revoked"));
    expect(revoked).toEqual({ reason: "key leaked" });
    expect(text()).toContain("key leaked");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(text()).toContain("Agent revoked.");
  });
});

//// an agent in the cloud: the page is the one that claims the code

const b64 = (s: string) => Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0));
type Kind = { harness: string; modelFamily: string };
const claudeKind: Kind = { harness: "claude-code", modelFamily: "claude" };
const codexKind: Kind = { harness: "codex", modelFamily: "gpt" };
// the claim as the backend checks it (commonsLink verifyPairProof): the
// agent key's signature over the domain and the claim's canonical JSON, for
// the kind the choice stands for
async function proofVerifies(body: { agentKey: string; code: string; proof: string }, kind: Kind) {
  const key = await crypto.subtle.importKey("spki", b64(body.agentKey), { name: "Ed25519" }, false, ["verify"]);
  const message = `anthill-commons/pair/v1\n{"agentKey":${JSON.stringify(body.agentKey)},"code":${JSON.stringify(body.code)},"community":"builders","harness":${JSON.stringify(kind.harness)},"modelFamily":${JSON.stringify(kind.modelFamily)}}`;
  return b64(body.proof).length === 64 && crypto.subtle.verify({ name: "Ed25519" }, key, b64(body.proof), new TextEncoder().encode(message));
}
let claimed: Record<string, string> | undefined;
function cloudServer(kind: Kind = claudeKind) {
  claimed = undefined;
  routes["c/builders/commons/pairings"] = () => ({ body: pairing() });
  routes["c/builders/commons/pairings/claim"] = async (init) => {
    claimed = bodyOf(init);
    return (await proofVerifies(claimed as never, kind))
      ? { body: { status: "claimed", fingerprint: claim.fingerprint, expiresAt: expiresAt() } }
      : { status: 400, body: { error: "The proof isn't this agent key's signature over the claim.", code: "bad proof" } };
  };
  routes["c/builders/commons/pairings/p1"] = pairingIs("claimed", { claim: { ...claim, ...kind } });
  routes["c/builders/commons/pairings/p1/reject"] = () => ({ body: { ok: true } });
}
const approves = (kind: Kind = claudeKind) => {
  let approved = 0;
  routes["c/builders/commons/pairings/p1/approve"] = () => {
    approved++;
    routes["c/builders/commons/agents"] = () => ({ body: { agents: [agent(kind)] } });
    return { body: { agent: { keyId: agent().keyId, ...kind } } };
  };
  return () => approved;
};
const envLines = () => (document.querySelector('pre[aria-label="the environment variables"]')?.textContent ?? "").split("\n");
const keyLine = () => envLines()[0] ?? "";
const stored = () => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]);
const stepTitles = () => [...document.querySelectorAll("li h3")].map((h) => h.textContent);
const onGithub = { ...commons, repo: "https://github.com/anthill-ai/agent-commons" };
const projectOnGithub = () => {
  routes["c/builders/graph"] = () => ({ body: graphOf("builders", [node("0xbo", "Bo"), node("0xada", "Ada")], { commons: onGithub }) });
};

describe("Claude Code in the cloud", () => {
  it("is the first choice, and the one picked", async () => {
    signedInAs(ada);
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    const choices = [...document.querySelectorAll<HTMLInputElement>('input[name="agent-choice"]')];
    // the clouds first, Claude Code's then Codex's
    expect(choices.map((c) => c.value)).toEqual(["claude-cloud", "codex-cloud", "claude-code", "codex", "other"]);
    expect(choices[0].checked).toBe(true);
    expect(choices.map((c) => c.closest("label")?.textContent)).toEqual([
      "Claude Code in the cloud",
      "Codex in the cloud",
      "Claude Code on your own machine",
      "Codex on your own machine",
      "Another agent",
    ]);
    expect(text()).toContain("It keeps running with your computer off.");
    expect(text()).toContain("run every hour in Claude's cloud");
    expect(text()).not.toContain("ChatGPT plan");
    expect(button("Make its key and connect")).toBeTruthy();
  });

  it("makes the key here, claims the code with it, approves it, and shows the setup once", async () => {
    signedInAs(ada);
    cloudServer();
    const approved = approves();
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    const before = stored();

    await click(button("Make its key and connect"));
    await until(() => text().includes("Connected."));
    expect(bodyOf(callsTo("c/builders/commons/pairings")[0].init)).toEqual({ harness: "claude-code", modelFamily: "claude" });
    // claimed as the agent would, with a proof that verifies, and no session
    expect(Object.keys(claimed!).sort()).toEqual(["agentKey", "code", "harness", "modelFamily", "proof"]);
    expect(claimed).toMatchObject({ code: pairing().code, harness: "claude-code", modelFamily: "claude" });
    expect(await proofVerifies(claimed as never, claudeKind)).toBe(true);
    expect(callsTo("c/builders/commons/pairings/claim")[0].init.headers).not.toHaveProperty("Authorization");
    expect(approved()).toBe(1);
    await until(() => text().includes("Claude Code · claude"));
    expect(text()).toContain("For Claude Code in the cloud (claude).");

    // the private key for that public key, as the kit reads it
    const line = keyLine();
    expect(line).toMatch(/^COMMONS_AGENT_KEY=[A-Za-z0-9_-]+$/);
    const privateKey = await crypto.subtle.importKey("pkcs8", b64(line.split("=")[1]), { name: "Ed25519" }, false, ["sign"]);
    const publicKey = await crypto.subtle.importKey("spki", b64(claimed!.agentKey), { name: "Ed25519" }, false, ["verify"]);
    const signed = await crypto.subtle.sign({ name: "Ed25519" }, privateKey, new TextEncoder().encode("hello"));
    expect(await crypto.subtle.verify({ name: "Ed25519" }, publicKey, signed, new TextEncoder().encode("hello"))).toBe(true);
    // and never sent anywhere
    const secret = line.split("=")[1];
    expect(calls.some((c) => String(c.init.body ?? "").includes(secret))).toBe(false);
    expect(text()).toContain("it isn't sent to Anthill and this page doesn't keep it");

    // the steps, with their links
    for (const title of ["Give your agent its key", "Make a cloud environment", "Schedule it"]) {
      expect([...document.querySelectorAll("h3")].map((h) => h.textContent)).toContain(title);
    }
    for (const href of [
      "https://claude.ai/code",
      "https://code.claude.com/docs/en/cloud-environments",
      "https://claude.ai/code/routines",
      "https://github.com/new",
    ]) {
      expect(linkTo(href)?.getAttribute("target")).toBe("_blank");
    }
    const network = [...document.querySelectorAll("p")].find((p) => p.textContent?.includes("Network access"))!;
    expect(network.textContent).toContain("new environment named Anthill Builders.");
    expect(network.textContent).toContain(`Full, or Limited with ${new URL(backendUrl).host} and coordinator.example under Allowed domains`);
    expect(network.textContent).not.toContain("github.com");
    // the coordinator in the environment too, so the agent needn't export it
    expect(envLines()).toEqual([line, "COMMONS_URL=https://coordinator.example"]);
    // the setup script that installs the kit and tells auto mode what the key is for
    expect(document.querySelector('pre[aria-label="the setup script"]')?.textContent).toBe(
      `curl -fsSL ${backendUrl}c/builders/commons/cloud-setup.sh | bash`,
    );
    // the task's prompt says, as the member, what the environment and key are for
    const prompt = document.querySelector('pre[aria-label="the task\'s prompt"]')?.textContent ?? "";
    expect(prompt.startsWith("Run my Anthill agent. I set up this cloud environment for my agent in the agent commons of the Anthill community builders")).toBe(true);
    // (and that a run without the key, so outside the environment, stops)
    expect(prompt.endsWith(` If COMMONS_AGENT_KEY isn't set, stop and say so. ${pairing().loopPrompt}`)).toBe(true);
    expect(text()).toContain("0 * * * *");
    expect(text()).toContain("Set it to run hourly");
    expect(text()).toContain("Not the commons' project");
    expect(text()).toContain("press Run now once");
    expect(text()).not.toContain("/loop");

    // kept nowhere: not on the device, and gone on coming back to the page
    expect(stored()).toBe(before);
    expect(stored()).not.toContain(secret);
    const tab = (label: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) => a.textContent?.trim() === label)!;
    await click(tab("People"));
    await until(() => !text().includes("COMMONS_AGENT_KEY"));
    await click(tab("Agents"));
    await until(() => text().includes("Which agent?"));
    expect(text()).not.toContain("COMMONS_AGENT_KEY");
    expect(document.body.innerHTML).not.toContain(secret);
    expect(stored()).toBe(before);
  });

  it("starts with forking the project when it's on GitHub, and puts the fork in the environment", async () => {
    signedInAs(ada);
    projectOnGithub();
    cloudServer();
    approves();
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await click(button("Make its key and connect"));
    await until(() => text().includes("Connected."));

    // in the member's order: fork, let Claude push, key, environment, task
    expect([...document.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(
      expect.arrayContaining(["Fork the project", "Let Claude push to your fork", "Give your agent its key", "Make a cloud environment", "Schedule it"]),
    );
    expect(stepTitles()).toEqual([
      "Fork the project",
      "Let Claude push to your fork",
      "Give your agent its key",
      "Make a cloud environment",
      "Schedule it",
    ]);
    expect(linkTo("https://github.com/anthill-ai/agent-commons/fork")?.getAttribute("target")).toBe("_blank");
    expect(linkTo("https://github.com/apps/claude")).toBeTruthy();
    // nothing of Codex's cloud
    expect(document.querySelector('a[href*="chatgpt.com"]')).toBeNull();

    // the fork line follows the GitHub name typed, and waits for a valid one
    expect(envLines()[2]).toBe("COMMONS_FORK=https://github.com/<your GitHub name>/agent-commons");
    await act(async () => typeInto(inputLabelled("Your GitHub name"), "-bad-"));
    expect(text()).toContain("Letters, digits and single hyphens");
    expect(envLines()[2]).toBe("COMMONS_FORK=https://github.com/<your GitHub name>/agent-commons");
    await act(async () => typeInto(inputLabelled("Your GitHub name"), "kelemeno"));
    expect(envLines()).toEqual([keyLine(), "COMMONS_URL=https://coordinator.example", "COMMONS_FORK=https://github.com/kelemeno/agent-commons"]);

    // the task takes the fork and an empty repository, and the prompt names the fork
    expect(text()).toContain("two repositories: your fork and an");
    const prompt = document.querySelector('pre[aria-label="the task\'s prompt"]')?.textContent ?? "";
    expect(prompt).toContain("COMMONS_FORK is my fork of the project");
  });

  it("keeps the key and offers to approve again when approving gets no answer", async () => {
    signedInAs(ada);
    cloudServer();
    routes["c/builders/commons/pairings/p1/approve"] = () => ({ status: 502, body: { error: "Couldn't reach the commons' coordinator." } });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await click(button("Make its key and connect"));
    await until(() => text().includes("Couldn't approve it: Couldn't reach the commons' coordinator."));
    expect(keyLine()).toMatch(/^COMMONS_AGENT_KEY=/);
    const approved = approves();
    await click(button("Try again"));
    await until(() => text().includes("Connected."));
    expect(approved()).toBe(1);
    expect(keyLine()).toMatch(/^COMMONS_AGENT_KEY=/);
  });

  it("doesn't offer to try again when the commons refuses it", async () => {
    signedInAs(ada);
    cloudServer();
    routes["c/builders/commons/pairings/p1/approve"] = () => ({
      status: 400,
      body: { error: "The commons already has this agent's key, for someone else.", code: "key taken" },
    });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await click(button("Make its key and connect"));
    await until(() => text().includes("Couldn't approve it: The commons already has this agent's key"));
    expect(text()).not.toContain("Try again");
  });

  it("says so, and ends the code, when the claim fails", async () => {
    signedInAs(ada);
    cloudServer();
    routes["c/builders/commons/pairings/claim"] = () => ({ status: 429, body: { error: "Too many requests: try again in a minute." } });
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await click(button("Make its key and connect"));
    await until(() => text().includes("Couldn't pair the new key: Too many requests"));
    await until(() => callsTo("c/builders/commons/pairings/p1/reject").length === 1);
    expect(text()).not.toContain("COMMONS_AGENT_KEY");
    expect(callsTo("c/builders/commons/pairings/p1/approve")).toHaveLength(0);
  });

  it("says plainly when the browser can't make the key, before asking for a code", async () => {
    signedInAs(ada);
    cloudServer();
    const generate = vi
      .spyOn(crypto.subtle, "generateKey")
      .mockRejectedValue(new DOMException("Unrecognized algorithm name", "NotSupportedError"));
    try {
      await show("/c/builders/agents");
      await until(() => text().includes("None yet."));
      await click(button("Make its key and connect"));
      await until(() => text().includes("This browser can't make the agent's key"));
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "Try a current Chrome, Edge, Firefox or Safari, or pick another way to run your agent.",
      );
      expect(callsTo("c/builders/commons/pairings")).toHaveLength(0);
    } finally {
      generate.mockRestore();
    }
  });
});

describe("Codex in the cloud", () => {
  const pick = async () => {
    await show("/c/builders/agents");
    await until(() => text().includes("None yet."));
    await choose("codex-cloud");
  };
  const boxed = (label: string) => document.querySelector(`pre[aria-label="${label}"]`)?.textContent ?? "";

  it("is the second choice, and says what it needs", async () => {
    signedInAs(ada);
    await pick();
    const choices = [...document.querySelectorAll<HTMLInputElement>('input[name="agent-choice"]')];
    expect(choices[1].value).toBe("codex-cloud");
    expect(choices[1].checked).toBe(true);
    // (not "a fresh machine each run": a schedule made in the task's chat
    // comes back to the same one)
    expect(text()).toContain(
      "It keeps running with your computer off. The cloud's machines don't keep your agent's key, which is why it goes in the cloud environment's settings.",
    );
    // (no promise of an hourly schedule there: OpenAI doesn't document one)
    expect(text()).toContain("then you set it up in OpenAI's cloud.");
    expect(text()).toContain("It needs a ChatGPT plan with Codex: Plus or higher.");
    expect(
      linkTo("https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan")?.getAttribute("target"),
    ).toBe("_blank");
    expect(button("Make its key and connect")).toBeTruthy();
  });

  it("connects a codex agent of the gpt family with a key made here, and shows OpenAI's setup once", async () => {
    signedInAs(ada);
    cloudServer(codexKind);
    const approved = approves(codexKind);
    await pick();
    const before = stored();

    await click(button("Make its key and connect"));
    await until(() => text().includes("Connected."));
    // what it is, to the pairing and in the claim the page signs
    expect(bodyOf(callsTo("c/builders/commons/pairings")[0].init)).toEqual({ harness: "codex", modelFamily: "gpt" });
    expect(Object.keys(claimed!).sort()).toEqual(["agentKey", "code", "harness", "modelFamily", "proof"]);
    expect(claimed).toMatchObject({ code: pairing().code, harness: "codex", modelFamily: "gpt" });
    expect(await proofVerifies(claimed as never, codexKind)).toBe(true);
    expect(await proofVerifies(claimed as never, claudeKind)).toBe(false);
    expect(callsTo("c/builders/commons/pairings/claim")[0].init.headers).not.toHaveProperty("Authorization");
    expect(approved()).toBe(1);
    await until(() => text().includes("Codex · gpt"));
    expect(text()).toContain("For Codex in the cloud (gpt).");

    // the key the kit reads, sent nowhere
    const line = keyLine();
    expect(line).toMatch(/^COMMONS_AGENT_KEY=[A-Za-z0-9_-]+$/);
    const secret = line.split("=")[1];
    await crypto.subtle.importKey("pkcs8", b64(secret), { name: "Ed25519" }, false, ["sign"]);
    expect(calls.some((c) => String(c.init.body ?? "").includes(secret))).toBe(false);
    expect(envLines()).toEqual([line, "COMMONS_URL=https://coordinator.example"]);

    // the steps (no fork: the project isn't on GitHub), each with its links
    expect(stepTitles()).toEqual(["Give your agent its key", "Make a cloud environment", "Schedule it"]);
    for (const href of [
      "https://chatgpt.com",
      "https://learn.chatgpt.com/docs/environments/cloud-environments",
      "https://github.com/new",
      "https://learn.chatgpt.com/docs/cloud",
      "https://learn.chatgpt.com/docs/automations#schedule-a-task-inside-a-chat",
    ]) {
      expect(linkTo(href)?.getAttribute("target")).toBe("_blank");
    }
    // none of Claude Code's
    expect(document.querySelector('a[href*="claude"]')).toBeNull();
    expect(text()).not.toContain("0 * * * *");

    // the environment: named for the community if it has a name (the docs
    // show no field for one), an empty repository (GitHub is connected in its
    // picker), the key in its variables, only the hosts beyond GitHub and npm
    // added, private
    const environment = [...document.querySelectorAll("li")].find((li) => li.querySelector("h3")?.textContent === "Make a cloud environment")!;
    expect(environment.textContent).toContain("choose Work in > Cloud, open Select environment and pick Create environment");
    expect(environment.textContent).toContain("If it lets you name it, call it Anthill Builders. Set:");
    expect(environment.textContent).not.toContain("Call it");
    const settings = [...environment.querySelectorAll("ul li")].map((li) => li.textContent);
    expect(settings).toEqual([
      "Repositories: connect GitHub if it asks, then pick an empty one of your own: Codex runs a repository's install and tests while setting up.",
      "Environment variables: the lines above.",
      `Public internet access: Enable all public internet access off, Enable package manager domains on, and ${new URL(backendUrl).host} and coordinator.example under Additional allowed domains.`,
      "Who can use: Only me.",
    ]);
    // the setup script is a line Codex is told to run, in the cloud's chat
    expect(environment.textContent).toContain("Then tell Codex, in that setup chat, not one on your computer:");
    expect(boxed("the setup message")).toBe(
      `Set this environment up by running exactly this command, nothing else, and keep it as the Install script: curl -fsSL ${backendUrl}c/builders/commons/codex-setup.sh | bash`,
    );
    expect(text()).not.toContain("cloud-setup.sh");
    expect(environment.textContent).toContain("When it's done, press Publish.");

    // the task: the member's own words about the key, then the loop prompt
    // (a run outside the environment, so without the key, stops); run once,
    // then hourly by asking in the task's own chat, the docs' way for a Codex
    // chat, with what to check, since OpenAI doesn't document it for the cloud
    const prompt = boxed("the task's prompt");
    expect(prompt.startsWith("Run my Anthill agent. I set up this cloud environment for my agent in the agent commons of the Anthill community builders")).toBe(true);
    expect(prompt.endsWith(` If COMMONS_AGENT_KEY isn't set, stop and say so. ${pairing().loopPrompt}`)).toBe(true);
    expect(prompt).not.toContain("COMMONS_FORK");
    const schedule = [...document.querySelectorAll("li")].find((li) => li.querySelector("h3")?.textContent === "Schedule it")!;
    expect(schedule.textContent).toContain("Start a new task in that environment (Work in > Cloud) with this prompt:");
    expect(schedule.textContent).toContain("Its first round only looks around. Then, in that same task, tell Codex:");
    expect(boxed("the schedule message")).toBe("Repeat this every hour, in this chat: one round of my Anthill agent each time.");
    expect(schedule.textContent).toContain("Every hour is the most a plan allows (how).");
    expect(schedule.textContent).toContain(
      "OpenAI's docs don't cover scheduling a cloud task yet, so check the next run: it should show up in that task, or as a new one in that environment, not as a plain ChatGPT chat.",
    );
    // not the Scheduled page: the docs have it for ChatGPT's tasks, which run outside the environment
    expect(schedule.textContent).not.toContain("in Scheduled");

    // kept nowhere: not on the device, and gone on coming back to the page
    expect(stored()).toBe(before);
    expect(stored()).not.toContain(secret);
    const tab = (label: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) => a.textContent?.trim() === label)!;
    await click(tab("People"));
    await until(() => !text().includes("COMMONS_AGENT_KEY"));
    await click(tab("Agents"));
    await until(() => text().includes("Which agent?"));
    expect(text()).not.toContain("COMMONS_AGENT_KEY");
    expect(document.body.innerHTML).not.toContain(secret);
    expect(stored()).toBe(before);
  });

  it("starts with the fork and Codex's GitHub connection when the project is on GitHub", async () => {
    signedInAs(ada);
    projectOnGithub();
    cloudServer(codexKind);
    approves(codexKind);
    await pick();
    await click(button("Make its key and connect"));
    await until(() => text().includes("Connected."));

    expect(stepTitles()).toEqual([
      "Fork the project",
      "Let Codex push to your fork",
      "Give your agent its key",
      "Make a cloud environment",
      "Schedule it",
    ]);
    expect(linkTo("https://github.com/anthill-ai/agent-commons/fork")?.getAttribute("target")).toBe("_blank");
    // GitHub is connected where OpenAI's docs say, the environment's
    // repository picker, and sees the fork and the empty repository: with the
    // fork alone, the fork would be the only one to pick there
    const push = [...document.querySelectorAll("li")].find((li) => li.querySelector("h3")?.textContent === "Let Codex push to your fork")!;
    expect(push.textContent).toContain(
      "Connect GitHub when Create environment shows its repository picker (step 4, how) and, if GitHub asks which repositories, give it only your fork and an empty one made for this.",
    );
    expect(
      push.querySelector('a[href="https://learn.chatgpt.com/docs/environments/cloud-environments#create-and-publish-an-environment"]')?.getAttribute("target"),
    ).toBe("_blank");
    expect(push.querySelector('a[href="https://github.com/new"]')?.textContent).toBe("empty one");
    expect(stepTitles()[3]).toBe("Make a cloud environment"); // the "step 4" it names
    expect(document.querySelector('a[href*="settings/connectors"]')).toBeNull();
    expect(linkTo("https://github.com/apps/claude")).toBeNull();
    // a push Codex can't make isn't the end: the commons takes the work anyway
    expect(text()).toContain("If Codex still can't push, your agent's work is reviewed and merged the same way, only without a pull request.");

    await act(async () => typeInto(inputLabelled("Your GitHub name"), "kelemeno"));
    expect(envLines()).toEqual([keyLine(), "COMMONS_URL=https://coordinator.example", "COMMONS_FORK=https://github.com/kelemeno/agent-commons"]);
    expect(boxed("the task's prompt")).toContain("COMMONS_FORK is my fork of the project");
    // the fork is never the environment's repository: the empty one is
    expect(text()).toContain(
      "Repositories: connect GitHub if it asks, then pick the empty one, never your fork: Codex runs a repository's install and tests while setting up.",
    );
    expect(text()).not.toContain("Repositories: none");
    expect(text()).not.toContain("two repositories");
  });

  it("keeps the key and offers to approve again when approving gets no answer", async () => {
    signedInAs(ada);
    cloudServer(codexKind);
    routes["c/builders/commons/pairings/p1/approve"] = () => ({ status: 502, body: { error: "Couldn't reach the commons' coordinator." } });
    await pick();
    await click(button("Make its key and connect"));
    await until(() => text().includes("Couldn't approve it: Couldn't reach the commons' coordinator."));
    const line = keyLine();
    expect(line).toMatch(/^COMMONS_AGENT_KEY=/);
    const approved = approves(codexKind);
    await click(button("Try again"));
    await until(() => text().includes("Connected."));
    expect(approved()).toBe(1);
    expect(keyLine()).toBe(line);
  });
});

describe("the tour on a first visit", () => {
  const touring = () => document.querySelector('[role="dialog"][aria-label="Guided tour"]') !== null;

  it("waits for a community's home page when the visit opens on a deep link", async () => {
    localStorage.removeItem("anthill.tourSeen");
    await show("/c/builders/agents");
    await until(() => text().includes("Sign in to connect an agent"));
    await later(3000);
    // still where the link led
    expect(touring()).toBe(false);
    expect(text()).toContain("Sign in to connect an agent");

    const home = [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find((a) => a.textContent?.trim() === "You")!;
    await click(home);
    await later(3000);
    await until(touring);
  });

  it("starts by itself on a community's home page", async () => {
    localStorage.removeItem("anthill.tourSeen");
    await show("/c/builders");
    await later(3000);
    await until(touring);
  });
});

describe("the privacy page", () => {
  it("says what an agent commons keeps, and that Anthill can't erase it", async () => {
    await show("/privacy");
    await until(() => text().includes("Communities with an agent commons"));
    const page = text();
    for (const said of [
      "the agent's public key, the model family and what it runs in",
      "with your Anthill user id",
      "the reason you give",
      "separate from Anthill's log and append-only",
      "Revoking an agent, leaving the community or deleting your Anthill account doesn't erase anything from it",
      "For an agent run in the cloud, the website makes its key in your browser: the private key is shown to you once and never sent to Anthill.",
      "Last updated 19 November 2026",
    ]) {
      expect(page).toContain(said);
    }
    expect(page).not.toContain("no selling or sharing your data");
  });
});
