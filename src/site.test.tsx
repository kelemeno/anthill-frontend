// A community's site against a fake server: the nav and the phone's tab bar
// show only the pages it shows (Agents only with a commons, About only when
// there is one), a page it turned off says so with the way home, its accent is
// on <html> (and gone outside it), its About renders on the About tab and for
// visitors on its front page, and Customise (for whoever may change its
// settings) loads the site, toggles pages, picks a colour with a preview,
// edits the About with a preview, and saves all of it, saying plainly when
// the server refuses. Also the summaries' defaults for older servers, the
// palette in index.css matching the names, and the System / Light / Dark
// choice.
// @vitest-environment jsdom
// (vitest runs on Node, but the app's tsconfig has no Node types; and a
// ?raw import of a .css file is empty under vitest)
// @ts-expect-error
import { readdirSync, readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { Graph, Person } from "./api";
import { forgetMemories } from "./cache";
import { ACCENTS, DEFAULT_ACCENT, navPages, pagesOf, siteOf } from "./site";
import { AppProvider } from "./state";
import { setTheme, storedTheme } from "./theme";
import { FIELD_FOCUS } from "./ui";

declare const process: { cwd(): string };
const source = (path: string): string => readFileSync(`${process.cwd()}/${path}`, "utf8");

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
  const answer = route ? await route(init) : { status: 404, body: { error: "Not found" } };
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
});
const posts = (path: string) => calls.filter((c) => c.path === path && c.init.method === "POST");
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
const allOn = { explore: true, polls: true, people: true, agents: true };
type SiteState = { pages: typeof allOn; accent: string; about: string };
// what the server holds for Club (and Builders, which has a commons)
let sites: Record<string, SiteState>;
let canChange: boolean;

const summary = (id: string) => {
  const site = sites[id];
  return {
    id,
    name: id === "builders" ? "Builders" : "Club",
    description: "",
    visibility: "public",
    joinPolicy: "open",
    createdAt: "2026-11-01T00:00:00Z",
    founder: canChange ? { id: "0xada", name: "Ada" } : null,
    members: 2,
    rootName: "Bo",
    isFounder: canChange,
    canChangeSettings: canChange,
    you: null,
    commons: id === "builders" ? commons : null,
    site: { pages: site.pages, accent: site.accent, hasAbout: site.about !== "" },
  };
};
const graphOf = (id: string): Graph =>
  ({
    version: 1,
    rootId: "0xbo",
    maxRelRootDepth: 0,
    nodes: { "0xbo": node("0xbo", "Bo"), "0xada": node("0xada", "Ada") },
    community: summary(id),
  }) as Graph;

function server() {
  routes = { communities: () => ({ body: { communities: [summary("club"), summary("builders")] } }) };
  for (const id of ["club", "builders"]) {
    routes[`c/${id}/graph`] = () => ({ body: graphOf(id) });
    routes[`c/${id}/site`] = (init) => {
      if (init.method !== "POST") return { body: { site: sites[id] } };
      const body = bodyOf(init);
      if (body.accent === "plaid") return { status: 400, body: { error: "Choose an accent colour from the palette." } };
      sites[id] = body;
      return { body: { community: summary(id) } };
    };
  }
  routes["auth/me"] = () => ({ body: { user: ada.user } });
  routes["c/club/polls"] = () => ({ body: { polls: [] } });
  routes["c/builders/commons/agents"] = () => ({ body: { agents: [] } });
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
const text = () => document.body.textContent ?? "";
async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out; page says: ${text().slice(0, 500)}`);
    await tick();
  }
}
const button = (label: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`no button "${label}"; page says: ${text().slice(0, 500)}`);
  return found as HTMLButtonElement;
};
const byRole = (role: string, name: string) => {
  const found = [...document.querySelectorAll<HTMLElement>(`[role="${role}"]`)].find(
    (el) => (el.getAttribute("aria-label") ?? el.textContent?.trim())?.startsWith(name),
  );
  if (!found) throw new Error(`no ${role} "${name}"; page says: ${text().slice(0, 500)}`);
  return found;
};
const click = (el: HTMLElement) => act(async () => el.click());
// a key pressed with the focus on `el` (React and the window both hear it)
const press = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })));
const customiseOpen = () => document.querySelector('[role="switch"]') !== null;
const editor = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="About, in Markdown"]')!;
function typeInto(el: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
// the header's nav (desktop) and the tab bar (phones)
const navs = () => [...document.querySelectorAll("nav")];
const tabsOf = (nav: Element) => [...nav.querySelectorAll("a")].map((a) => a.textContent?.trim());

async function openCustomise() {
  await until(() => text().includes("Club") && document.querySelector('[data-tour="communities"]') !== null);
  await click(document.querySelector<HTMLElement>('[data-tour="communities"]')!);
  await click(button("Customise Club"));
  await until(() => document.querySelector('[role="switch"]') !== null);
}

beforeEach(() => {
  localStorage.clear();
  forgetMemories();
  localStorage.setItem("anthill.tourSeen", "1");
  sites = {
    club: { pages: { ...allOn, agents: false }, accent: "indigo", about: "" },
    builders: { pages: allOn, accent: "indigo", about: "" },
  };
  canChange = false;
  server();
  calls.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeSocket);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("data-theme");
});

describe("a community's pages", () => {
  it("shows every page by default, Agents only with a commons", async () => {
    await show("/c/club");
    await until(() => tabsOf(navs()[0]).includes("People"));
    for (const nav of navs()) expect(tabsOf(nav)).toEqual(["You", "Explore", "Polls", "People"]);
    await act(async () => root!.unmount());

    await show("/c/builders");
    await until(() => tabsOf(navs()[0]).includes("Agents"));
    expect(tabsOf(navs()[0])).toEqual(["You", "Explore", "Polls", "People", "Agents"]);
  });

  it("leaves out the pages it turned off, in the header and the phone's tab bar", async () => {
    sites.club.pages = { explore: false, polls: false, people: true, agents: false };
    sites.builders.pages = { ...allOn, agents: false };
    await show("/c/club");
    await until(() => tabsOf(navs()[0]).includes("People"));
    expect(navs()).toHaveLength(2);
    for (const nav of navs()) expect(tabsOf(nav)).toEqual(["You", "People"]);
    await act(async () => root!.unmount());

    await show("/c/builders");
    await until(() => tabsOf(navs()[0]).includes("People"));
    expect(tabsOf(navs()[0])).not.toContain("Agents");
  });

  it("says a page it turned off isn't used, with the way home", async () => {
    sites.club.pages = { ...allOn, polls: false, agents: false };
    await show("/c/club/polls");
    await until(() => text().includes("This community doesn't use Polls"));
    const home = [...document.querySelectorAll("main a")].find((a) => a.textContent?.includes("Back to Club"));
    expect(home?.getAttribute("href")).toBe("/c/club");
    // nobody here may change it, so no Customise
    expect(text()).not.toContain("turn it back on");
  });

  it("says the Agents page is off where the commons is, and that there are none where it isn't", async () => {
    sites.builders.pages = { ...allOn, agents: false };
    await show("/c/builders/agents");
    await until(() => text().includes("This community doesn't use Agents"));
    await act(async () => root!.unmount());
    await show("/c/club/agents");
    await until(() => text().includes("doesn't have an agent commons"));
  });

  it("offers whoever may change it the way back on", async () => {
    signedInAs(ada);
    canChange = true;
    sites.club.pages = { ...allOn, explore: false, agents: false };
    await show("/c/club/explore");
    await until(() => text().includes("This community doesn't use Explore"));
    expect(text()).toContain("You can turn it back on in Customise");
    await click(button("Customise"));
    await until(() => document.querySelector('[role="switch"]') !== null);
    expect(byRole("switch", "Explore").getAttribute("aria-checked")).toBe("false");
  });
});

describe("the header's tabs", () => {
  it("are only icons below lg when there are more than four, named for screen readers", async () => {
    sites.builders.about = "Hello.";
    await show("/c/builders");
    await until(() => tabsOf(navs()[0]).includes("About"));
    const links = [...navs()[0].querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["You", "Explore", "Polls", "People", "Agents", "About"]);
    for (const a of links) expect(a.querySelector("span")?.className).toBe("hidden lg:inline");
    await act(async () => root!.unmount());

    // four keep their words at every width
    await show("/c/club");
    await until(() => tabsOf(navs()[0]).includes("People"));
    for (const a of navs()[0].querySelectorAll("a")) {
      expect(a.hasAttribute("aria-label")).toBe(false);
      expect(a.querySelector("span")).toBeNull();
    }
  });
});

describe("the tree", () => {
  it("keeps its colours whatever the accent, so endorsing and being endorsed never look alike", async () => {
    // green's accent is all but emerald, the colour of "endorses them"
    sites.club.accent = "green";
    const vote = (id: string) => ({ id, weight: "1", dist: 1, posInOther: 0 });
    routes["c/club/graph"] = () => {
      const graph = graphOf("club");
      graph.nodes["0xbo"] = { ...graph.nodes["0xbo"], recTreeVotes: ["0xada"], recDagVotes: [vote("0xada")], sentDagVotes: [vote("0xada")] };
      graph.nodes["0xada"] = { ...graph.nodes["0xada"], sentTreeVote: "0xbo", depth: 1 };
      return { body: graph };
    };
    // (d3-zoom measures the tree's svg, which jsdom doesn't lay out)
    const size = { configurable: true, get: () => ({ baseVal: { value: 800 } }) };
    Object.defineProperties(SVGSVGElement.prototype, { width: size, height: size });
    await show("/c/club/explore?focus=0xbo");
    await until(() => document.querySelector('path[marker-end="url(#arrow-out)"]') !== null);
    delete (SVGSVGElement.prototype as { width?: unknown }).width;
    delete (SVGSVGElement.prototype as { height?: unknown }).height;
    const arc = (kind: string) => document.querySelector(`path[marker-end="url(#arrow-${kind})"]`)!.getAttribute("class");
    expect(arc("in")).toContain("emerald");
    expect(arc("out")).not.toContain("emerald");
    const tree = document.querySelector('[data-tour="explore-tree"]')!;
    expect([...tree.querySelectorAll("[class]")].filter((el) => el.getAttribute("class")!.includes("accent-"))).toEqual([]);
    // and the legend says the same
    const legend = [...document.querySelectorAll("div")].filter((el) => el.textContent?.includes("Endorses them")).at(-1)!;
    expect(legend.textContent).toContain("They endorse");
    expect(legend.innerHTML).not.toContain("accent-");
  });
});

describe("the accent", () => {
  it("puts the community's colour on <html>, and takes it off outside it", async () => {
    sites.club.accent = "teal";
    await show("/c/club");
    await until(() => document.documentElement.dataset.accent === "teal");
    await act(async () => root!.unmount());
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);

    await show("/");
    await tick(100);
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);
  });

  it("leaves the default, and a name it doesn't know, as the default look", async () => {
    sites.club.accent = "plaid";
    await show("/c/club");
    await until(() => tabsOf(navs()[0]).includes("People"));
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);
  });
});

describe("About", () => {
  it("is a tab only when there is one, and renders it safely", async () => {
    await show("/c/club");
    await until(() => tabsOf(navs()[0]).includes("People"));
    expect(tabsOf(navs()[0])).not.toContain("About");
    await act(async () => root!.unmount());

    sites.club.about = "# Welcome\n\nWe read **books**. <script>alert(1)</script> [Join](https://club.example)";
    await show("/c/club/about");
    await until(() => text().includes("We read"));
    expect(tabsOf(navs()[0]).at(-1)).toBe("About");
    const main = document.querySelector("main")!;
    expect(main.querySelector("h2")?.textContent).toBe("Welcome");
    expect(main.querySelector("strong")?.textContent).toBe("books");
    expect(main.querySelector("script")).toBeNull();
    expect(main.textContent).toContain("<script>alert(1)</script>");
    const link = [...main.querySelectorAll("a")].find((a) => a.textContent === "Join")!;
    expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc");
  });

  it("shows on the front page to visitors who aren't members", async () => {
    sites.club.about = "Founded in a library.";
    await show("/c/club");
    await until(() => text().includes("Founded in a library."));
    expect(text()).toContain("About Club");
  });

  it("says when there's none yet", async () => {
    await show("/c/club/about");
    await until(() => text().includes("hasn't written anything about itself yet"));
  });

  it("shows the About just saved at once, before the server's next answer", async () => {
    signedInAs(ada);
    canChange = true;
    sites.club.about = "Old words.";
    await show("/c/club/about");
    await until(() => text().includes("Old words."));
    // the tree's next answer, after which the About is asked again, is slow
    routes["c/club/graph"] = () => new Promise(() => {});
    await click(button("Edit in Customise"));
    await until(customiseOpen);
    await act(async () => typeInto(editor(), "New words."));
    await click(button("Save"));
    await until(() => !customiseOpen());
    const main = document.querySelector("main")!;
    expect(main.textContent).toContain("New words.");
    expect(main.textContent).not.toContain("Old words.");
  });
});

describe("Customise", () => {
  beforeEach(() => {
    signedInAs(ada);
    canChange = true;
  });

  it("is in the community menu only for whoever may change its settings", async () => {
    canChange = false;
    await show("/c/club");
    await until(() => text().includes("Club") && document.querySelector('[data-tour="communities"]') !== null);
    await click(document.querySelector<HTMLElement>('[data-tour="communities"]')!);
    expect(text()).not.toContain("Customise Club");
  });

  it("loads the site, and saves the pages, colour and About it was given", async () => {
    sites.club.about = "Old words.";
    await show("/c/club");
    await openCustomise();
    expect(text()).toContain("nothing in it is deleted and no rule changes");
    // no commons, so no Agents toggle
    expect([...document.querySelectorAll('[role="switch"]')].map((s) => s.textContent)).toEqual([
      expect.stringContaining("Explore"),
      expect.stringContaining("Polls"),
      expect.stringContaining("People"),
    ]);
    await click(byRole("switch", "Polls"));
    expect(byRole("switch", "Polls").getAttribute("aria-checked")).toBe("false");

    // the colour, previewed at once
    await click(byRole("radio", "Rose"));
    expect(byRole("radio", "Rose").getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('[data-testid="accent-preview"]')?.getAttribute("data-accent")).toBe("rose");
    // (the page keeps its own colour until it's saved)
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);

    // the About, as it was, then edited and previewed
    const editor = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="About, in Markdown"]')!;
    expect(editor.value).toBe("Old words.");
    await act(async () => typeInto(editor, "## Hello\n\n*New* words."));
    expect(text()).toContain("22 / 10,000");
    await click(byRole("tab", "Preview"));
    const panel = document.querySelector('[role="tabpanel"]')!;
    expect(panel.querySelector("h3")?.textContent).toBe("Hello");
    expect(panel.querySelector("em")?.textContent).toBe("New");

    await click(button("Save"));
    await until(() => posts("c/club/site").length === 1);
    expect(bodyOf(posts("c/club/site")[0].init)).toEqual({
      pages: { explore: true, polls: false, people: true, agents: false },
      accent: "rose",
      about: "## Hello\n\n*New* words.",
    });
    expect(posts("c/club/site")[0].init.headers).toMatchObject({ Authorization: "Bearer tok-ada" });
    await until(() => document.querySelector('[role="switch"]') === null);
    // the page follows: Polls gone, the colour on, the About tab there
    await until(() => document.documentElement.dataset.accent === "rose");
    await until(() => !tabsOf(navs()[0]).includes("Polls") && tabsOf(navs()[0]).includes("About"));
  });

  it("offers the Agents page where there's a commons", async () => {
    sites.builders.pages = { ...allOn, agents: false };
    await show("/c/builders");
    await until(() => text().includes("Builders") && document.querySelector('[data-tour="communities"]') !== null);
    await click(document.querySelector<HTMLElement>('[data-tour="communities"]')!);
    await click(button("Customise Builders"));
    await until(() => document.querySelector('[role="switch"]') !== null);
    expect(byRole("switch", "Agents").getAttribute("aria-checked")).toBe("false");
    await click(byRole("switch", "Agents"));
    await click(button("Save"));
    await until(() => posts("c/builders/site").length === 1);
    expect(bodyOf(posts("c/builders/site")[0].init).pages).toEqual(allOn);
  });

  it("says plainly when the server refuses, and keeps what was written", async () => {
    sites.club.accent = "plaid";
    await show("/c/club");
    await openCustomise();
    // an unknown name shows as the default; force the refusal through the server
    routes["c/club/site"] = (init) =>
      init.method === "POST"
        ? { status: 400, body: { error: "The About can be at most 10,000 characters." } }
        : { body: { site: sites.club } };
    expect(byRole("radio", "Indigo").getAttribute("aria-checked")).toBe("true");
    await click(button("Save"));
    await until(() => text().includes("The About can be at most 10,000 characters."));
    expect(document.querySelector('[role="switch"]')).not.toBeNull();
    // (announced, as the focus stays on Save)
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("The About can be at most 10,000 characters.");
  });

  it("won't save over a site it couldn't load", async () => {
    routes["c/club/site"] = () => ({ status: 500, body: { error: "Something went wrong" } });
    await show("/c/club");
    await until(() => text().includes("Club") && document.querySelector('[data-tour="communities"]') !== null);
    await click(document.querySelector<HTMLElement>('[data-tour="communities"]')!);
    await click(button("Customise Club"));
    await until(() => text().includes("Couldn't load this community's site"));
    expect(button("Save").disabled).toBe(true);
  });

  it("won't send an About over the limit, and says why to screen readers too", async () => {
    await show("/c/club");
    await openCustomise();
    expect(editor().getAttribute("aria-invalid")).toBe("false");
    await act(async () => typeInto(editor(), "x".repeat(10_001)));
    expect(button("Save").disabled).toBe(true);
    expect(editor().getAttribute("aria-invalid")).toBe("true");
    const help = document.getElementById(editor().getAttribute("aria-describedby")!);
    expect(help?.textContent).toContain("Too long by 1 character: 10,001 / 10,000");
    expect(help?.textContent).toContain("No images or HTML");
  });

  it("counts the About as the server does", async () => {
    await show("/c/club");
    await openCustomise();
    // (NFC turns each of these into two characters; the server counts 12,000)
    await act(async () => typeInto(editor(), "\u0958".repeat(6000)));
    expect(button("Save").disabled).toBe(true);
    expect(document.getElementById(editor().getAttribute("aria-describedby")!)?.textContent).toContain(
      "Too long by 2,000 characters: 12,000 / 10,000",
    );
    // trailing space, and text with nothing visible, count for nothing
    await act(async () => typeInto(editor(), "Hi   \n\n"));
    expect(text()).toContain("2 / 10,000");
    await act(async () => typeInto(editor(), "\u200b\u2060"));
    expect(text()).toContain("0 / 10,000");
  });

  it("asks before throwing away changes, however it's closed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await show("/c/club");
    await openCustomise();
    // nothing changed: Escape just closes it
    await press(document.body, "Escape");
    expect(customiseOpen()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();

    await openCustomise();
    await act(async () => typeInto(editor(), "Pages and pages."));
    // an Escape that ends typing in another script isn't a close
    await press(editor(), "Escape", { isComposing: true });
    expect(confirm).not.toHaveBeenCalled();
    // Escape, a click beside it, its X and Cancel all ask; no keeps it all
    await press(editor(), "Escape");
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => void dialog.parentElement!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
    await click(document.querySelector<HTMLElement>('button[aria-label="Close"]')!);
    await click(button("Cancel"));
    expect(confirm).toHaveBeenCalledTimes(4);
    expect(confirm).toHaveBeenLastCalledWith("Discard your changes?");
    expect(editor().value).toBe("Pages and pages.");
    // yes lets it go
    confirm.mockReturnValue(true);
    await click(button("Cancel"));
    expect(customiseOpen()).toBe(false);

    // a change undone is no change
    confirm.mockClear();
    await openCustomise();
    await click(byRole("switch", "Polls"));
    await click(byRole("switch", "Polls"));
    await click(button("Cancel"));
    expect(customiseOpen()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("moves the colour, and Write and Preview, with the arrow keys, each one Tab stop", async () => {
    await show("/c/club");
    await openCustomise();
    const radios = [...document.querySelectorAll<HTMLElement>('[role="radiogroup"] [role="radio"]')];
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([byRole("radio", "Indigo")]);
    await press(byRole("radio", "Indigo"), "ArrowRight");
    expect(byRole("radio", "Blue").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(byRole("radio", "Blue"));
    expect(byRole("radio", "Blue").tabIndex).toBe(0);
    await press(byRole("radio", "Blue"), "ArrowLeft");
    await press(byRole("radio", "Indigo"), "ArrowUp");
    // (round to the last)
    expect(byRole("radio", "Violet").getAttribute("aria-checked")).toBe("true");
    await press(byRole("radio", "Violet"), "Home");
    expect(byRole("radio", "Indigo").getAttribute("aria-checked")).toBe("true");
    expect(document.querySelector('[data-testid="accent-preview"]')?.getAttribute("data-accent")).toBe("indigo");

    expect(byRole("tab", "Preview").tabIndex).toBe(-1);
    await press(byRole("tab", "Write"), "ArrowRight");
    expect(byRole("tab", "Preview").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(byRole("tab", "Preview"));
    expect(document.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(byRole("tab", "Preview").id);
  });

  it("opens before the community's tree has loaded", async () => {
    sites.club.pages = { ...allOn, explore: false, agents: false };
    routes["c/club/graph"] = () => new Promise(() => {});
    await show("/c/club/explore");
    await until(() => text().includes("This community doesn't use Explore"));
    await click(button("Customise"));
    await until(customiseOpen);
    expect(byRole("switch", "Explore").getAttribute("aria-checked")).toBe("false");
  });
});

describe("summaries", () => {
  it("shows everything, in the default colour, for an older server's summary", () => {
    expect(siteOf(undefined)).toEqual({
      pages: { explore: true, polls: true, people: true, agents: false },
      accent: DEFAULT_ACCENT,
      hasAbout: false,
    });
    expect(siteOf({ commons: commons })).toMatchObject({ pages: allOn });
    expect(navPages({ commons: null })).toEqual(["home", "explore", "polls", "people"]);
  });

  it("reads pages as booleans or as a list of the pages shown, Agents only with a commons", () => {
    expect(pagesOf({ explore: false, polls: true }, true)).toEqual({ explore: false, polls: true, people: true, agents: true });
    expect(pagesOf(["people", "agents"], true)).toEqual({ explore: false, polls: false, people: true, agents: true });
    expect(pagesOf(["people", "agents"], false)).toMatchObject({ agents: false });
    expect(pagesOf({ explore: "no" }, false)).toMatchObject({ explore: true });
    expect(
      navPages({ commons, site: { pages: { explore: false, polls: true, people: false, agents: true }, accent: "teal", hasAbout: true } }),
    ).toEqual(["home", "polls", "agents", "about"]);
  });

  it("has light and dark colours in index.css for every accent", () => {
    const css = source("src/index.css");
    for (const accent of ACCENTS) {
      const block = css.match(new RegExp(`\\[data-accent="${accent}"\\] \\{([\\s\\S]*?)\\n\\}`))?.[1];
      expect(block, accent).toBeDefined();
      for (const token of ["50", "100", "200", "300", "400", "500", "600", "700", "solid", "solid-hover"]) {
        // once for light, once in its dark variant
        expect(block!.match(new RegExp(`--color-accent-${token}:`, "g")), `${accent} ${token}`).toHaveLength(2);
      }
      expect(block).toContain("@variant dark");
    }
  });
});

// WCAG contrast between two oklch() colours (L as a fraction)
type Oklch = [number, number, number];
function luminance([L, C, H]: Oklch): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [r, g, bl] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((x) => Math.min(1, Math.max(0, x)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const contrast = (x: Oklch, y: Oklch) => {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
};
const oklch = (css: string): Oklch => {
  const [L, C, H] = css.match(/oklch\(([\d.]+)% ([\d.]+) ([\d.]+)\)/)!.slice(1).map(Number);
  return [L / 100, C, H];
};

describe("text fields", () => {
  it("show the focus at 3:1 or more against the surface, for every accent in both schemes", () => {
    const css = source("src/index.css");
    const token = FIELD_FOCUS.match(/focus:border-accent-(\d+)/)![1];
    const white: Oklch = [1, 0, 0];
    const darkSurface = oklch(css.match(/--color-surface: (oklch\([^)]*\))/)![1]);
    for (const accent of ACCENTS) {
      const block = css.match(new RegExp(`\\[data-accent="${accent}"\\] \\{([\\s\\S]*?)\\n\\}`))![1];
      const [light, dark] = [...block.matchAll(new RegExp(`--color-accent-${token}: (oklch\\([^)]*\\))`, "g"))].map((m) => oklch(m[1]));
      expect(contrast(light, white), `${accent} light`).toBeGreaterThanOrEqual(3);
      expect(contrast(dark, darkSurface), `${accent} dark`).toBeGreaterThanOrEqual(3);
    }
    // and every field uses it
    for (const dir of ["src", "src/pages", "src/components"]) {
      for (const file of readdirSync(`${process.cwd()}/${dir}`) as string[]) {
        if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
        const code = source(`${dir}/${file}`);
        expect(code.match(/focus:border-[a-z]+-\d+/g)?.filter((c) => !FIELD_FOCUS.includes(c)) ?? [], file).toEqual([]);
      }
    }
  });
});

describe("the home page", () => {
  it("links to the demo's replay only when the demo shows Explore", async () => {
    const demo = (explore: boolean) => {
      const graph = graphOf("club");
      graph.community = { ...graph.community, id: "demo", name: "Demo", site: { pages: { ...allOn, explore, agents: false }, accent: "indigo", hasAbout: false } };
      return { body: graph };
    };
    routes["c/demo/graph"] = () => demo(false);
    await show("/");
    await until(() => text().includes("The top of the demo community"));
    expect(text()).not.toContain("watch it grow");
    await act(async () => root!.unmount());

    localStorage.clear();
    localStorage.setItem("anthill.tourSeen", "1");
    routes["c/demo/graph"] = () => demo(true);
    await show("/");
    await until(() => text().includes("watch it grow"));
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent === "watch it grow");
    expect(link?.getAttribute("href")).toBe("/c/demo/explore?replay=1");
  });
});

describe("light and dark", () => {
  it("follows the system unless this browser chose, and says so to the browser's bars", () => {
    document.head.innerHTML =
      '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">' +
      '<meta name="theme-color" content="#0f172b" media="(prefers-color-scheme: dark)">';
    const metas = () => [...document.querySelectorAll("meta")].map((m) => m.content);
    expect(storedTheme()).toBe("system");
    setTheme("dark");
    expect(storedTheme()).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(metas()).toEqual(["#0f172b", "#0f172b"]);
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(metas()).toEqual(["#ffffff", "#ffffff"]);
    setTheme("system");
    expect(storedTheme()).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("anthill.theme")).toBeNull();
    expect(metas()).toEqual(["#ffffff", "#0f172b"]);
  });

  it("applies a stored choice before the page paints (public/theme.js)", () => {
    const script = source("public/theme.js");
    localStorage.setItem("anthill.theme", "dark");
    new Function(script)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("anthill.theme", "<b>");
    new Function(script)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("is chosen in the account menu", async () => {
    signedInAs(ada);
    await show("/");
    await until(() => document.querySelector('[data-tour="account"]') !== null);
    await click(document.querySelector<HTMLElement>('[data-tour="account"]')!);
    expect(byRole("radio", "System").getAttribute("aria-checked")).toBe("true");
    await click(byRole("radio", "Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("anthill.theme")).toBe("dark");
    expect(byRole("radio", "Dark").getAttribute("aria-checked")).toBe("true");
    await click(byRole("radio", "System"));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    // the arrow keys move the choice, a radio group being one Tab stop
    expect(byRole("radio", "Light").tabIndex).toBe(-1);
    await press(byRole("radio", "System"), "ArrowRight");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.activeElement).toBe(byRole("radio", "Light"));
    await click(byRole("radio", "System"));
  });

  it("follows a choice made in another tab", async () => {
    signedInAs(ada);
    await show("/");
    await until(() => document.querySelector('[data-tour="account"]') !== null);
    await click(document.querySelector<HTMLElement>('[data-tour="account"]')!);
    const otherTab = (value: string | null) =>
      act(async () => {
        if (value) localStorage.setItem("anthill.theme", value);
        else localStorage.removeItem("anthill.theme");
        window.dispatchEvent(new StorageEvent("storage", { key: "anthill.theme", newValue: value }));
      });
    await otherTab("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(byRole("radio", "Dark").getAttribute("aria-checked")).toBe("true");
    await otherTab(null);
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(byRole("radio", "System").getAttribute("aria-checked")).toBe("true");
  });

  it("gives an installed app the light header's colour, as index.html does (a manifest can't follow the scheme)", () => {
    const manifest = JSON.parse(source("public/manifest.json"));
    const light = source("index.html").match(/<meta name="theme-color" content="(#[0-9a-f]+)" media="\(prefers-color-scheme: light\)"/)![1];
    expect(manifest.theme_color).toBe(light);
  });
});
