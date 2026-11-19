// The Agents page's Proposals against a fake server: nothing where the
// server doesn't run the commons (a 404); visitors and members see the list
// read-only (open, approved and waiting, tasks; evidence and who proposed
// it); the steward approves one as a task (ring, size, acceptance tests, the
// spec author, you by default) after the form is checked, a refusal says
// why, and declines a pending approval; the ring starts at the lowest ring
// of the evidence's files under the commons' rules, and a higher one is
// warned about; without them it must be chosen; a steward without an agent
// picks the spec author; the list is asked for again while an approval
// waits, until it's a task, and no longer than a few minutes; an approval
// the commons won't take says why and isn't asked about; a failure to load
// can be tried again; and the server's problem with its approvals is shown.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { Graph, Person, Proposal } from "./api";
import { forgetMemories } from "./cache";
import { PROPOSALS_POLL_LIMIT, PROPOSALS_POLL_MS, parseTestPaths, pendingProblem, testPathProblem } from "./components/Proposals";
import { normalizeRepoPath, ringOf, ringsOf } from "./rings";
import { AppProvider } from "./state";

vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: vi.fn(async () => ({})),
  startAuthentication: vi.fn(async () => ({})),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//// a fake server

type Reply = { status?: number; body: unknown };
let routes: Record<string, (init: RequestInit) => Reply> = {};
const calls: { path: string; init: RequestInit }[] = [];
const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
  const path = String(url).replace(/^https?:\/\/[^/]+\//, "");
  calls.push({ path, init });
  const route = routes[path];
  const answer = route ? route(init ?? {}) : { status: 404, body: { error: "Not found" } };
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
});
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

const commons = { coordinator: "https://anthill.example/commons/builders", site: "https://anthill.example/commons/builders/" };
const community = {
  id: "builders",
  name: "Builders",
  description: "",
  visibility: "public",
  joinPolicy: "open",
  createdAt: "2026-11-01T00:00:00Z",
  founder: null,
  members: 2,
  rootName: "Ada",
  isFounder: false,
  you: null,
  commons,
};
const graph = (): Graph =>
  ({
    version: 1,
    rootId: "0xada",
    maxRelRootDepth: 0,
    nodes: { "0xada": node("0xada", "Ada"), "0xbo": node("0xbo", "Bo") },
    community,
  }) as Graph;

const PROPOSALS = "c/builders/commons/proposals";
const approvePath = (id: string) => `${PROPOSALS}/${id}/approve`;
const declinePath = (id: string) => `${PROPOSALS}/${id}/decline`;

const proposal = (id: string, title: string, extra: Partial<Proposal> = {}): Proposal => ({
  id,
  title,
  proposedAt: "2026-11-18T10:00:00.000Z",
  evidence: [
    { kind: "failingTest", text: "login fails: npm test -- login" },
    { kind: "location", text: "src/auth.ts:12: races the timer" },
  ],
  author: { agent: "k1", modelFamily: "claude", owner: { id: "0xbo", name: "Bo" } },
  task: null,
  ...extra,
});
const taskOf = (status: "pending" | "created", extra: object = {}) => ({
  status,
  id: "t-1",
  ring: 1,
  sizeEstimate: 60,
  acceptanceTestPaths: ["test/login.test.ts"],
  specAuthor: { id: "0xada", name: "Ada" },
  ...extra,
});
const owners = [
  { id: "0xada", name: "Ada" },
  { id: "0xbo", name: "Bo" },
];

function server(proposals?: object) {
  routes = {
    communities: () => ({ body: { communities: [community] } }),
    "c/builders/graph": () => ({ body: graph() }),
    "auth/me": () => ({ body: { user: ada.user } }),
    "c/builders/commons/agents": () => ({ body: { agents: [] } }),
    ...(proposals ? { [PROPOSALS]: () => ({ body: proposals }) } : {}),
  };
}

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
    if (Date.now() > end) throw new Error(`timed out; page says: ${text().slice(0, 600)}`);
    await tick();
  }
}
const later = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const text = () => document.body.textContent ?? "";
const section = () => document.querySelector<HTMLElement>('section[aria-labelledby="proposals-title"]');
const buttons = (label: string) => [...document.querySelectorAll("button")].filter((b) => b.textContent?.trim() === label);
const button = (label: string) => {
  const found = buttons(label)[0];
  if (!found) throw new Error(`no button "${label}"; page says: ${text().slice(0, 600)}`);
  return found as HTMLButtonElement;
};
const click = (b: HTMLElement) => act(async () => b.click());
const controlLabelled = (label: string) => {
  const l = [...document.querySelectorAll("label")].find((x) => x.textContent?.trim() === label);
  if (!l) throw new Error(`no field "${label}"`);
  return document.getElementById(l.htmlFor) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};
async function fill(label: string, value: string) {
  const el = controlLabelled(label);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
const groupText = (title: string) => document.querySelector(`section[aria-label="${title}"]`)?.textContent ?? "";
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
  localStorage.clear();
  forgetMemories();
  localStorage.setItem("anthill.tourSeen", "1");
  server();
  calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("test paths", () => {
  it("are held to the commons' rule", () => {
    expect(testPathProblem("test/a.test.ts")).toBeUndefined();
    expect(testPathProblem("a b/c")).toBeUndefined();
    for (const bad of ["/abs", "../a", "a/./b", "a//b", "a/", "a\\b", "a\tb", "x".repeat(513)]) {
      expect(testPathProblem(bad), bad).toBeDefined();
    }
    expect(parseTestPaths(" test/a.ts \n\n test/b.ts\n")).toEqual({ paths: ["test/a.ts", "test/b.ts"] });
    expect(parseTestPaths("  \n")).toHaveProperty("error");
    expect(parseTestPaths("a\na")).toEqual({ error: "a is there twice." });
    expect(parseTestPaths(Array.from({ length: 101 }, (_, i) => `t${i}`).join("\n"))).toHaveProperty("error");
  });
});

// the builders target's rules, in part: nearly all code is ring 0
const RULES = [
  { glob: "src/types.ts", ring: 0 },
  { glob: "src/cli.ts", ring: 0 },
  { glob: "src/gates/**", ring: 0 },
  { glob: "scripts/**", ring: 0 },
  { glob: "*.yml", ring: 0 },
  { glob: "web/**", ring: 2 },
] as const;
const rules = RULES.map((r) => ({ ...r }));

describe("rings", () => {
  it("classify a file as the commons does", () => {
    expect(ringOf("src/cli.ts", rules)).toBe(0);
    expect(ringOf("src/gates/rings.ts", rules)).toBe(0);
    expect(ringOf("src/gates/deep/x.ts", rules)).toBe(0);
    expect(ringOf("ci.yml", rules)).toBe(0);
    expect(ringOf(".github/ci.yml", rules)).toBe(1);
    expect(ringOf("web/app.tsx", rules)).toBe(2);
    // unmatched: ring 1; first match wins
    expect(ringOf("src/client.ts", rules)).toBe(1);
    expect(ringOf("web/x.ts", [{ glob: "web/*.ts", ring: 1 }, { glob: "web/**", ring: 2 }])).toBe(1);
    // another spelling is never a higher ring; a path outside the repo is 0
    expect(ringOf("Src/CLI.ts", rules)).toBe(0);
    expect(ringOf("web/../src/cli.ts", rules)).toBe(0);
    expect(ringOf("./src//cli.ts", rules)).toBe(0);
    expect(ringOf("../x.ts", rules)).toBe(0);
    expect(ringOf("/etc/passwd", rules)).toBe(0);
    expect(normalizeRepoPath("a/b/../c/")).toBe("a/c");
    expect(normalizeRepoPath("a/..")).toBeNull();
    // `**/` is zero or more whole folders
    expect(ringOf("README.md", [{ glob: "**/README.md", ring: 2 }])).toBe(2);
    expect(ringOf("docs/README.md", [{ glob: "**/README.md", ring: 2 }])).toBe(2);
    expect(ringsOf(["web/a.ts", "src/cli.ts", "src/x.ts", "src/cli.ts"], rules)).toEqual([
      { file: "src/cli.ts", ring: 0 },
      { file: "src/x.ts", ring: 1 },
      { file: "web/a.ts", ring: 2 },
    ]);
  });
});

describe("a pending approval's problem", () => {
  it("is the server's, or what's plainly missing", () => {
    const pending = taskOf("pending") as Parameters<typeof pendingProblem>[0];
    expect(pendingProblem(pending)).toBeUndefined();
    expect(pendingProblem({ ...pending, problem: "The ledger refuses it: unknown field note." })).toBe("The ledger refuses it: unknown field note.");
    expect(pendingProblem({ ...pending, ring: -1, acceptanceTestPaths: [], specAuthor: { id: "", name: "" } })).toBe(
      "It has no ring, acceptance tests and spec author, so the commons can't make it a task.",
    );
    expect(pendingProblem({ ...(taskOf("created") as typeof pending), problem: "x" })).toBeUndefined();
  });
});

describe("the Proposals section", () => {
  it("doesn't show where the server doesn't run the commons", async () => {
    await show("/c/builders/agents");
    await until(() => callsTo(PROPOSALS).length === 1 && text().includes("Sign in to connect an agent"));
    await tick();
    expect(section()).toBeNull();
    expect(text()).not.toContain("Proposals");
  });

  it("shows visitors the list read-only: open, waiting, tasks", async () => {
    server({
      proposals: [
        proposal("p-3", "Add a greeting"),
        proposal("p-2", "Lint warning", { task: taskOf("pending", { id: "t-2", ring: 2, sizeEstimate: 1 }) }),
        proposal("p-1", "Fix the login test", { task: taskOf("created", { state: "open" }) }),
      ],
      total: 3,
      canApprove: false,
    });
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    expect(callsTo(PROPOSALS)[0].init.headers).toEqual({});
    expect(groupText("Open")).toContain("Add a greeting");
    expect(groupText("Open")).toContain("Failing test: login fails: npm test -- login");
    expect(groupText("Open")).toContain("Location: src/auth.ts:12: races the timer");
    expect(groupText("Open")).toContain("Bo's agent (claude)");
    expect(groupText("Approved, waiting for the commons")).toContain("Lint warning");
    expect(groupText("Approved, waiting for the commons")).toContain("Pending");
    expect(groupText("Approved, waiting for the commons")).toContain("Ring 2: interface · about 1 changed line ·");
    expect(groupText("Tasks")).toContain("Fix the login test");
    expect(groupText("Tasks")).toContain("Task: open");
    expect(groupText("Tasks")).toContain("Ring 1: logic · about 60 changed lines · acceptance tests test/login.test.ts, written by Ada's agent");
    expect(groupText("Approved, waiting for the commons")).toContain(
      "The commons makes it a task within a minute. Next, Ada's agent writes the acceptance tests at those paths; then an agent can implement it.",
    );
    expect(section()!.textContent).toContain("The community's founder decides which become tasks");
    expect(buttons("Approve as task")).toHaveLength(0);
    expect(buttons("Decline")).toHaveLength(0);
  });

  it("shows a member who isn't the steward the list read-only", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-3", "Add a greeting"), proposal("p-2", "Lint", { task: taskOf("pending") })], total: 2, canApprove: false });
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    expect(callsTo(PROPOSALS)[0].init.headers).toMatchObject({ Authorization: "Bearer tok-ada" });
    expect(buttons("Approve as task")).toHaveLength(0);
    expect(buttons("Decline")).toHaveLength(0);
  });

  it("lets the steward approve a proposal as a task", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-3", "Add a greeting")], total: 1, canApprove: true, owners, youAreOwner: true });
    let sent: unknown;
    routes[approvePath("p-3")] = (init) => {
      sent = bodyOf(init);
      return { body: { added: true, proposal: proposal("p-3", "Add a greeting", { task: taskOf("pending", { ring: 2, acceptanceTestPaths: ["test/a.test.ts", "test/b.test.ts"] }) }) } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    expect(section()!.textContent).toContain("Approve the ones worth doing as tasks");
    await click(button("Approve as task"));
    // the rings, as the repository's rules classify files; without the
    // rules, none to start with
    expect(text()).toContain("Ring 0: kernel");
    expect(text()).toContain("as this repository's .commons/rules.json classifies it");
    expect(text()).not.toContain("Plain logic, most code changes.");
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ring-p-3"]')];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    // you, by default, and what the spec author and the tests are
    expect((controlLabelled("Spec author") as HTMLSelectElement).value).toBe("0xada");
    expect(text()).toContain("Whose agent writes the acceptance tests (the definition of done)");
    expect(text()).toContain("The agent that implements the task may not change them.");
    expect(text()).toContain("Paths the spec author's agent will write the tests at");
    expect(text()).not.toContain("Who wrote what the task asks for");
    expect([...(controlLabelled("Spec author") as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(["Ada (you)", "Bo"]);

    await click(radios[2]);
    await fill("Size estimate", "60");
    await fill("Acceptance tests", " test/a.test.ts\n\ntest/b.test.ts ");
    await click(button("Approve as task"));
    await until(() => text().includes("Approved: the commons makes it a task within a minute. Next, Ada's agent writes the acceptance tests."));
    expect(sent).toEqual({ ring: 2, sizeEstimate: 60, acceptanceTests: ["test/a.test.ts", "test/b.test.ts"] });
    expect(callsTo(approvePath("p-3"))[0].init.headers).toMatchObject({ Authorization: "Bearer tok-ada" });
    expect(groupText("Approved, waiting for the commons")).toContain("Add a greeting");
    expect(groupText("Approved, waiting for the commons")).toContain("The commons makes it a task within a minute");
    expect(groupText("Open")).toContain("None open");
    expect(button("Decline")).toBeTruthy();
  });

  it("checks the form before sending, and says why the server refused", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-3", "Add a greeting")], total: 1, canApprove: true, owners, youAreOwner: true });
    routes[approvePath("p-3")] = () => ({ status: 400, body: { error: "That proposal is already a task.", code: "already-a-task" } });
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    await click(button("Approve as task"));
    await click(button("Approve as task"));
    expect(text()).toContain("How many lines it should change");
    expect(text()).toContain("Name at least one path for the acceptance tests");
    expect(text()).toContain("Choose the ring of the files the change will touch.");
    await fill("Size estimate", "1.5");
    await fill("Acceptance tests", "../escape.ts");
    await click(button("Approve as task"));
    expect(text()).toContain("How many lines it should change");
    expect(text()).toContain("../escape.ts has an empty, . or .. part.");
    await fill("Size estimate", "100001");
    await fill("Acceptance tests", "/abs/a.ts");
    await click(button("Approve as task"));
    expect(text()).toContain("How many lines it should change");
    expect(text()).toContain("starts with /");
    expect(callsTo(approvePath("p-3"))).toHaveLength(0);

    await fill("Size estimate", "0");
    await fill("Acceptance tests", "test/a.ts");
    await click(button("Approve as task"));
    expect(callsTo(approvePath("p-3"))).toHaveLength(0);
    await click(document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ring-p-3"]')[1]!);
    expect(text()).not.toContain("Choose the ring");
    await click(button("Approve as task"));
    await until(() => text().includes("Couldn't approve it: That proposal is already a task."));
    expect(callsTo(approvePath("p-3"))).toHaveLength(1);
    // the form stays, to change or cancel
    await click(button("Cancel"));
    expect(button("Approve as task")).toBeTruthy();
    expect(text()).not.toContain("Size estimate");
  });

  it("has a steward without an agent pick the spec author", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-3", "Add a greeting")], total: 1, canApprove: true, owners: [{ id: "0xbo", name: "Bo" }], youAreOwner: false });
    let sent: any;
    routes[approvePath("p-3")] = (init) => {
      sent = bodyOf(init);
      return { body: { added: true, proposal: proposal("p-3", "Add a greeting", { task: taskOf("pending", { specAuthor: { id: "0xbo", name: "Bo" } }) }) } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    await click(button("Approve as task"));
    expect((controlLabelled("Spec author") as HTMLSelectElement).value).toBe("");
    expect(text()).toContain("you have none yet");
    await fill("Size estimate", "5");
    await fill("Acceptance tests", "test/a.ts");
    await click(document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ring-p-3"]')[1]!);
    await click(button("Approve as task"));
    expect(text()).toContain("Choose whose agent writes the acceptance tests.");
    expect(callsTo(approvePath("p-3"))).toHaveLength(0);
    await fill("Spec author", "0xbo");
    await click(button("Approve as task"));
    await until(() => text().includes("written by Bo's agent"));
    expect(sent).toEqual({ ring: 1, sizeEstimate: 5, acceptanceTests: ["test/a.ts"], specAuthor: "0xbo" });
  });

  it("can't approve before anyone has an agent", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-3", "Add a greeting")], total: 1, canApprove: true, owners: [], youAreOwner: false });
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    await click(button("Approve as task"));
    expect(text()).toContain("Nobody has an agent connected here yet");
    expect(button("Approve as task").disabled).toBe(true);
  });

  it("lets the steward decline a pending approval", async () => {
    signedInAs(ada);
    server({ proposals: [proposal("p-2", "Lint", { task: taskOf("pending") })], total: 1, canApprove: true, owners, youAreOwner: true });
    routes[declinePath("p-2")] = () => ({ body: { removed: true, proposal: proposal("p-2", "Lint") } });
    await show("/c/builders/agents");
    await until(() => text().includes("Lint"));
    expect(groupText("Approved, waiting for the commons")).toContain("Lint");
    await click(button("Decline"));
    await until(() => text().includes("Approval taken back: it's open again."));
    expect(callsTo(declinePath("p-2"))).toHaveLength(1);
    expect(groupText("Open")).toContain("Lint");
    expect(button("Approve as task")).toBeTruthy();
  });

  it("asks again while an approval waits, until it's a task", async () => {
    server({ proposals: [proposal("p-2", "Lint", { task: taskOf("pending") })], total: 1, canApprove: false });
    await show("/c/builders/agents");
    await until(() => text().includes("Pending"));
    expect(callsTo(PROPOSALS)).toHaveLength(1);
    // hidden: not asked
    visibility = "hidden";
    await later(PROPOSALS_POLL_MS);
    expect(callsTo(PROPOSALS)).toHaveLength(1);
    visibility = "visible";
    routes[PROPOSALS] = () => ({ body: { proposals: [proposal("p-2", "Lint", { task: taskOf("created", { state: "open" }) })], total: 1, canApprove: false } });
    await later(PROPOSALS_POLL_MS);
    await until(() => text().includes("Task: open"));
    expect(callsTo(PROPOSALS)).toHaveLength(2);
    // and no more once nothing waits
    await later(PROPOSALS_POLL_MS * 3);
    expect(callsTo(PROPOSALS)).toHaveLength(2);
  });

  it("starts the ring at the lowest ring of the evidence's files, and warns of a higher one", async () => {
    signedInAs(ada);
    const p = proposal("p-3", "Fix the CLI's flag parsing", {
      evidence: [
        { kind: "location", text: "src/client.ts:4: the flag", file: "src/client.ts" },
        { kind: "diagnostic", text: "tsc at src/cli.ts:12: no overload", file: "src/cli.ts" },
      ],
    });
    server({ proposals: [p], total: 1, canApprove: true, owners, youAreOwner: true, rings: rules });
    let sent: any;
    routes[approvePath("p-3")] = (init) => {
      sent = bodyOf(init);
      return { body: { added: true, proposal: { ...p, task: taskOf("pending", { ring: 0 }) } } };
    };
    await show("/c/builders/agents");
    await until(() => text().includes("Fix the CLI's flag parsing"));
    await click(button("Approve as task"));
    expect(text()).toContain("The evidence points at src/cli.ts (ring 0) and src/client.ts (ring 1).");
    expect(text()).toContain("The rules put src/types.ts, src/cli.ts, src/gates/**, scripts/** and 1 more here.");
    expect(text()).toContain("The rules put web/** here.");
    const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ring-p-3"]')];
    expect(radios().map((r) => r.checked)).toEqual([true, false, false]);
    expect(text()).not.toContain("fails the rings gate if");
    await click(radios()[1]!);
    expect(text()).toContain("src/cli.ts is ring 0 in this repository's rules. A task at ring 1 fails the rings gate if its change touches it.");
    await click(radios()[2]!);
    expect(text()).toContain("src/cli.ts and src/client.ts are ring 0 in this repository's rules.");
    await click(radios()[0]!);
    expect(text()).not.toContain("fails the rings gate if");
    await fill("Size estimate", "30");
    await fill("Acceptance tests", "test/cli-flags.test.ts");
    await click(button("Approve as task"));
    await until(() => sent !== undefined);
    expect(sent).toEqual({ ring: 0, sizeEstimate: 30, acceptanceTests: ["test/cli-flags.test.ts"] });
  });

  it("says what an approval the commons won't take lacks, and doesn't keep asking", async () => {
    signedInAs(ada);
    server({
      proposals: [
        proposal("p-2", "Lint", { task: taskOf("pending", { problem: "The ledger refuses it: the spec author 0xbo isn't an owner." }) }),
        proposal("p-1", "By hand", { task: taskOf("pending", { id: "t-hand", ring: -1, sizeEstimate: 0 }) }),
      ],
      total: 2,
      canApprove: true,
      owners,
      youAreOwner: true,
    });
    await show("/c/builders/agents");
    await until(() => text().includes("By hand"));
    const waiting = groupText("Approved, waiting for the commons");
    expect(waiting).toContain("Needs attention");
    expect(waiting).not.toContain("Pending");
    expect(waiting).not.toContain("within a minute");
    expect(waiting).toContain("The ledger refuses it: the spec author 0xbo isn't an owner. Decline it to take it back");
    expect(waiting).toContain("No ring · about 0 changed lines");
    expect(waiting).toContain("It has no ring, so the commons can't make it a task.");
    expect(buttons("Decline")).toHaveLength(2);
    await later(PROPOSALS_POLL_MS * 4);
    expect(callsTo(PROPOSALS)).toHaveLength(1);
  });

  it("stops asking after a few minutes, and says the approval may be stuck", async () => {
    server({ proposals: [proposal("p-2", "Lint", { task: taskOf("pending") })], total: 1, canApprove: false });
    await show("/c/builders/agents");
    await until(() => text().includes("Pending"));
    for (let i = 1; i <= PROPOSALS_POLL_LIMIT; i++) {
      await later(PROPOSALS_POLL_MS);
      await until(() => callsTo(PROPOSALS).length === i + 1);
    }
    await until(() => text().includes("Still not a task after a few minutes"));
    expect(groupText("Approved, waiting for the commons")).toContain("Needs attention");
    expect(groupText("Approved, waiting for the commons")).not.toContain("within a minute");
    // a visitor can't decline it
    expect(text()).not.toContain("Decline it to take it back");
    await later(PROPOSALS_POLL_MS * 4);
    expect(callsTo(PROPOSALS)).toHaveLength(PROPOSALS_POLL_LIMIT + 1);
    // asked once more by hand: it became a task after all
    routes[PROPOSALS] = () => ({ body: { proposals: [proposal("p-2", "Lint", { task: taskOf("created", { state: "open" }) })], total: 1, canApprove: false } });
    await click(button("Check again"));
    await until(() => text().includes("Task: open"));
    expect(callsTo(PROPOSALS)).toHaveLength(PROPOSALS_POLL_LIMIT + 2);
  });

  it("says when it can't load, and tries again", async () => {
    server();
    routes[PROPOSALS] = () => ({ status: 502, body: { error: "The commons' coordinator can't be reached right now." } });
    await show("/c/builders/agents");
    await until(() => text().includes("Couldn't load the proposals: The commons' coordinator can't be reached right now."));
    routes[PROPOSALS] = () => ({ body: { proposals: [], total: 0, canApprove: false } });
    await click(button("Try again"));
    await until(() => text().includes("No proposals yet."));
  });

  it("shows the server's problem with its approvals, and how many there are", async () => {
    server({
      proposals: [proposal("p-3", "Add a greeting")],
      total: 250,
      canApprove: false,
      problem: "This commons' approved-tasks.json isn't a JSON array of task bodies.",
    });
    await show("/c/builders/agents");
    await until(() => text().includes("Add a greeting"));
    expect(text()).toContain("approved-tasks.json isn't a JSON array");
    expect(text()).toContain("The newest 1 of 250 proposals.");
  });
});
