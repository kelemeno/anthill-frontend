// App state against a fake server: the graph shown is always the URL's
// community's, as seen by whoever is signed in; nothing one account loaded is
// shown to the next, or kept with the recovery code; a starting server is
// asked again; the websocket catches up after reconnecting and coalesces
// bursts; a rejected session signs out; Start a community resumes after
// signing up; and an invite's recovery code shows even when joining fails.
// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { act as postAction, type Graph } from "./api";
import { HomePage } from "./pages/Home";
import { InvitePage } from "./pages/Invite";
import { AppProvider, useApp } from "./state";

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(async () => ({})),
  startAuthentication: vi.fn(async () => ({})),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//// a fake server

type Reply = { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>;
type Route = [RegExp, (init: RequestInit) => Reply];
let routes: Route[] = [];
const calls: { path: string; init: RequestInit }[] = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\//, "");
  calls.push({ path, init });
  const route = routes.find(([re]) => re.test(path));
  const reply = await (route ? route[1](init) : { status: 404, body: { error: "Not found" } });
  return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
});
const callsTo = (re: RegExp) => calls.filter((c) => re.test(c.path)).length;
const authOf = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    FakeSocket.all.push(this);
  }
  close() {}
}
const socket = () => FakeSocket.all.at(-1)!;

const pending = () => new Promise<never>(() => {});
const graphOf = (id: string, extra: Partial<Graph["community"]> = {}, more: Partial<Graph> = {}): Graph =>
  ({
    version: 1,
    rootId: `${id}-root`,
    maxRelRootDepth: 0,
    nodes: {},
    community: { id, name: id.toUpperCase(), description: "", visibility: "public", isFounder: false, you: null, ...extra },
    ...more,
  }) as Graph;
const signedIn = { token: "tok-ann", user: { id: "0xann", name: "Ann" } };
const cache = (key: string, value: unknown, at = Date.now()) =>
  localStorage.setItem(`anthill.cache.v3.${key}`, JSON.stringify({ at, value }));

//// rendering

let root: Root | undefined;
let app: ReturnType<typeof useApp>;
let go: (path: string) => void;
const renders: string[] = [];

function Probe() {
  app = useApp();
  renders.push(`${app.cid}:${app.graph?.community.id}`);
  go = useNavigate();
  return null;
}

function Shell(props: { children?: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname}>
      <Probe />
      {props.children}
    </div>
  );
}

async function show(path: string, page?: ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <AppProvider>
          <Shell>
            <Routes>
              <Route path="/invite/:code" element={page} />
              <Route path="/" element={page} />
              <Route path="*" element={null} />
            </Routes>
          </Shell>
        </AppProvider>
      </MemoryRouter>,
    );
  });
}

const tick = (ms = 20) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await tick();
  }
}
const text = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;
function typeInto(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const click = (b: HTMLElement) => act(async () => b.click());

beforeEach(() => {
  localStorage.clear();
  routes = [];
  calls.length = 0;
  renders.length = 0;
  FakeSocket.all = [];
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

describe("app state", () => {
  it("never shows one community's graph at another's address", async () => {
    cache("graph.anyone.a1", graphOf("a1"));
    cache("graph.anyone.b1", graphOf("b1"));
    routes = [[/graph$/, pending]];
    await show("/c/a1/explore");
    expect(app.graph?.community.id).toBe("a1");
    await act(async () => go("/c/b1/explore"));
    expect(app.graph?.community.id).toBe("b1");
    expect(renders).not.toContain("b1:a1");
  });

  it("forgets a private tree when signing out, and keeps no private data on the device", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    routes = [
      [/c\/secret\/graph$/, (init) => (authOf(init) ? { body: graphOf("secret", { visibility: "private" }) } : pending())],
      [
        /^communities$/,
        (init) =>
          authOf(init)
            ? { body: { communities: [graphOf("secret", { visibility: "private" }).community, graphOf("pub").community] } }
            : pending(),
      ],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/c/secret");
    await until(() => app.graph?.community.id === "secret");
    await until(() => app.communities?.length === 2);
    const stored = Object.keys(localStorage).filter((k) => k.startsWith("anthill.cache"));
    expect(stored.some((k) => k.includes("secret"))).toBe(false);
    expect(localStorage.getItem("anthill.cache.v3.communities.0xann")).not.toContain("secret");

    await act(async () => app.setSession(undefined));
    expect(app.graph).toBeUndefined();
    expect(app.communities?.some((c) => c.id === "secret")).not.toBe(true);
    expect(localStorage.getItem("anthill.cache.v3.communities.0xann")).toBeNull();
  });

  it("drops an answer asked for with the previous session", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    let answer!: (g: { body: Graph }) => void;
    routes = [
      [/c\/club\/graph$/, (init) => (authOf(init) ? new Promise((r) => (answer = r)) : { status: 404, body: { error: "Not found" } })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/c/club");
    await act(async () => app.setSession(undefined));
    await until(() => app.notFound);
    await act(async () => answer({ body: graphOf("club", { visibility: "private" }) }));
    await tick();
    expect(app.notFound).toBe(true);
    expect(app.graph).toBeUndefined();
  });

  it("remembers a community only once it has loaded", async () => {
    routes = [
      [/c\/real\/graph$/, () => ({ body: graphOf("real") })],
      [/c\/typo\/graph$/, () => ({ status: 404, body: { error: "Not found" } })],
    ];
    await show("/c/real");
    await until(() => localStorage.getItem("anthill.community") === "real");
    await act(async () => go("/c/typo"));
    await until(() => app.notFound);
    expect(localStorage.getItem("anthill.community")).toBe("real");
    expect(app.homeCid).toBe("real");
  });

  it("waits for a starting server instead of calling the community missing", async () => {
    cache("graph.anyone.slow", graphOf("slow"));
    let starting = true;
    routes = [[/c\/slow\/graph$/, () => (starting ? { status: 503, body: { error: "starting" } } : { body: graphOf("slow", { name: "Fresh" }) })]];
    await show("/c/slow");
    await until(() => callsTo(/slow\/graph/) >= 1);
    await tick(50);
    expect(app.notFound).toBe(false);
    expect(app.error).toBeUndefined();
    expect(app.graph?.community.id).toBe("slow");
    expect(localStorage.getItem("anthill.cache.v3.graph.anyone.slow")).not.toBeNull();
    starting = false;
    await until(() => app.graph?.community.name === "Fresh");
  });

  it("clears the server-error banner when leaving the community", async () => {
    routes = [[/c\/flaky\/graph$/, () => ({ status: 502, body: { error: "bad gateway" } })]];
    await show("/c/flaky");
    await until(() => app.error === "bad gateway");
    await act(async () => go("/"));
    expect(app.error).toBeUndefined();
  });

  it("says why the communities didn't load", async () => {
    routes = [[/^communities$/, () => ({ status: 500, body: { error: "internal error" } })]];
    await show("/");
    await until(() => app.communitiesError === "internal error");
  });

  it("catches up after reconnecting, coalesces bursts, and follows the graph's update key", async () => {
    routes = [
      [/c\/live\/graph$/, () => ({ body: graphOf("live", {}, { updateKey: "k9" }) })],
      [/^communities$/, () => ({ body: { communities: [] } })],
    ];
    await show("/c/live");
    await until(() => app.graph?.updateKey === "k9");
    await act(async () => socket().onopen?.());
    await tick(200);
    const before = callsTo(/live\/graph/);
    expect(before).toBe(1);

    // a burst is one reload
    await act(async () => {
      for (let i = 0; i < 5; i++) socket().onmessage?.({ data: "update" });
    });
    await tick(250);
    expect(callsTo(/live\/graph/)).toBe(before + 1);

    // another community's update leaves this graph alone; its update key doesn't
    await act(async () => socket().onmessage?.({ data: "update:elsewhere" }));
    await tick(250);
    expect(callsTo(/live\/graph/)).toBe(before + 1);
    await act(async () => socket().onmessage?.({ data: "update:k9" }));
    await tick(250);
    expect(callsTo(/live\/graph/)).toBe(before + 2);

    // after a drop, the new socket's open fetches what was missed
    const first = socket();
    await act(async () => first.onclose?.());
    await until(() => socket() !== first, 2000);
    await act(async () => socket().onopen?.());
    await tick(250);
    expect(callsTo(/live\/graph/)).toBe(before + 3);
  });

  it("signs out with a message when the server rejects the session", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    routes = [
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
      [/action$/, () => ({ status: 401, body: { error: "session expired" } })],
    ];
    await show("/");
    await act(async () => {
      await postAction(app.session!, "club", { fn: "leaveTree", args: {} }).catch(() => {});
    });
    expect(app.session).toBeUndefined();
    expect(localStorage.getItem("anthill.session")).toBeNull();
    expect(text()).toContain("session has expired");
  });

  it("picks up a rename made on another device", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    routes = [[/auth\/me$/, () => ({ body: { user: { id: "0xann", name: "Ann K" } } })]];
    await show("/");
    await until(() => app.session?.user.name === "Ann K");
    expect(JSON.parse(localStorage.getItem("anthill.session")!).user.name).toBe("Ann K");
  });

  it("keeps a public tree on screen while signing in and out", async () => {
    const ann = { id: "0xann", name: "Ann" } as Graph["nodes"][string];
    routes = [
      [/c\/pub\/graph$/, (init) => (authOf(init) ? new Promise(() => {}) : { body: graphOf("pub", {}, { nodes: { "0xann": ann } }) })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/c/pub/explore");
    await until(() => app.graph?.community.id === "pub");
    renders.length = 0;
    await act(async () => app.setSession(signedIn));
    expect(app.graph?.community.id).toBe("pub");
    expect(app.viewer?.id).toBe("0xann");
    expect(renders).not.toContain("pub:undefined");

    // and back: what the signed-in viewer saw (but not their standing)
    routes[0] = [/c\/pub\/graph$/, (init) => (authOf(init) ? { body: graphOf("pub", { isFounder: true, you: { reputation: "1", rank: 1 } }) } : pending())];
    await act(async () => app.reload());
    await until(() => app.graph?.community.isFounder === true);
    renders.length = 0;
    await act(async () => app.setSession(undefined));
    expect(app.graph?.community.id).toBe("pub");
    expect(app.graph?.community.isFounder).toBe(false);
    expect(app.graph?.community.you).toBeNull();
    expect(renders).not.toContain("pub:undefined");
  });

  it("keeps the tree updating when updates come faster than answers", async () => {
    let version = 0;
    routes = [
      [/c\/busy\/graph$/, () => {
        const g = graphOf("busy", {}, { version: ++version });
        return new Promise((r) => setTimeout(() => r({ body: g }), 400));
      }],
      [/^communities$/, () => ({ body: { communities: [] } })],
    ];
    await show("/c/busy");
    await until(() => app.graph?.version === 1);
    for (let i = 0; i < 8; i++) {
      await act(async () => socket().onmessage?.({ data: "update" }));
      await tick(160);
    }
    expect(app.graph!.version).toBeGreaterThan(2);
  });

  it("doesn't lead to a private community after leaving it or signing out", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    let member = true;
    const secret = graphOf("secret", { visibility: "private" });
    routes = [
      [/c\/secret\/graph$/, () => (member ? { body: secret } : { status: 404, body: { error: "Not found" } })],
      [/^communities$/, () => ({ body: { communities: member ? [secret.community] : [] } })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/c/secret");
    await until(() => app.graph?.community.id === "secret");
    await act(async () => go("/"));
    expect(app.homeCid).toBe("secret");

    // leaving: the reload's 404 lands after the page changed
    await act(async () => go("/c/secret"));
    member = false;
    await act(async () => {
      app.reload();
      go("/");
    });
    await until(() => localStorage.getItem("anthill.community") === null);
    expect(app.homeCid).toBe("commons");

    // signing out forgets a private last community
    member = true;
    await act(async () => go("/c/secret"));
    await until(() => localStorage.getItem("anthill.community") === "secret");
    await act(async () => go("/"));
    await act(async () => app.setSession(undefined));
    expect(app.homeCid).toBe("commons");
    expect(localStorage.getItem("anthill.community")).toBeNull();
  });

  it("doesn't take the device's public-only list for your communities", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    cache("communities.0xann", [graphOf("pub").community]);
    routes = [
      [/^communities$/, () => ({ status: 502, body: { error: "bad gateway" } })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/", <HomePage />);
    expect(app.communities?.length).toBe(1);
    expect(app.communitiesFresh).toBe(false);
    expect(text()).not.toContain("not in any community");
    await until(() => text().includes("Couldn't load the communities"));
  });

  it("ignores what the device kept a long time ago", async () => {
    cache("graph.anyone.old", graphOf("old"), Date.now() - 30 * 24 * 3600 * 1000);
    routes = [[/graph$/, pending]];
    await show("/c/old");
    expect(app.graph).toBeUndefined();
  });

  it("closes a community's settings when the community changes", async () => {
    localStorage.setItem("anthill.session", JSON.stringify(signedIn));
    routes = [
      [/c\/(mine|other)\/graph$/, () => ({ body: graphOf("mine", { isFounder: true }) })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/c/mine");
    await until(() => app.graph !== undefined);
    await act(async () => app.editCommunity());
    expect(text()).toContain("Community settings");
    await act(async () => go("/c/other"));
    expect(text()).not.toContain("Community settings");
  });
});

describe("signing up", () => {
  const newAccount = { ...signedIn, recoveryCode: "AAAA-BBBB" };

  it("starts one passkey sheet for Enter pressed twice, keeps no recovery code, and resumes Start a community", async () => {
    routes = [
      [/auth\/register\/options$/, () => ({ body: { flowId: "f", options: {} } })],
      [/auth\/register\/verify$/, () => ({ body: newAccount })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
    ];
    await show("/");
    await act(async () => app.createCommunity());
    expect(text()).toContain("Create your account");
    const input = document.querySelector("input") as HTMLInputElement;
    await act(async () => typeInto(input, "Ann"));
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await until(() => text().includes("Save your recovery code"));
    expect(callsTo(/register\/options/)).toBe(1);
    expect(localStorage.getItem("anthill.session")).not.toContain("AAAA");
    expect(app.session).toEqual(signedIn);
    expect(text()).not.toContain("Start a community");

    await click(button("I've saved it"));
    expect(text()).toContain("Start a community");
  });

  it("shows an invite's recovery code even when joining fails", async () => {
    const invite = { community: graphOf("club").community, inviter: { id: "0xbob", name: "Bob" }, expires: "" };
    routes = [
      [/invites\/x1$/, () => ({ body: invite })],
      [/auth\/register\/options$/, () => ({ body: { flowId: "f", options: {} } })],
      [/auth\/register\/verify$/, () => ({ body: newAccount })],
      [/auth\/me$/, () => ({ body: { user: signedIn.user } })],
      [/c\/club\/action$/, () => ({ status: 400, body: { error: "This invite has already been used." } })],
    ];
    await show("/invite/x1", <InvitePage />);
    await until(() => text().includes("Bob invited you"));
    await act(async () => typeInto(document.querySelector("input") as HTMLInputElement, "Ann"));
    await click(button("Create passkey and join"));
    await until(() => text().includes("already been used"));
    expect(text()).toContain("Save your recovery code");
    expect(text()).toContain("AAAA-BBBB");
  });
});
