// The guided tour: it survives its steps changing under it (signing out,
// leaving, a preview ending), its pages keep only ?as= from the URL, and it
// goes only through the pages the community shows.
// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tour, type TourStep, tourSteps } from "./Tour";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let where = "";
const onClose = vi.fn();

function Harness(props: { steps: TourStep[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  where = location.pathname + location.search;
  return <Tour steps={props.steps} navigate={navigate} onClose={onClose} />;
}

// (the tour reads window.location, as in the app)
const render = (steps: TourStep[], at?: string) => {
  if (at) window.history.replaceState(null, "", at);
  return act(() =>
    root.render(
      <BrowserRouter>
        <Harness steps={steps} />
      </BrowserRouter>,
    ),
  );
};
const press = (key: string) => act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key })));
const counter = () => container.querySelector("p.text-accent-600")?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  onClose.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("tour", () => {
  it("stays within its steps when the list shrinks", async () => {
    const member = tourSteps({ member: true, signedIn: true });
    const visitor = tourSteps({ member: false, signedIn: true });
    expect(member.length).toBeGreaterThan(visitor.length);
    await render(member, "/");
    for (let i = 0; i < member.length - 2; i++) await press("ArrowRight");
    expect(counter()).toBe(`${member.length - 1} of ${member.length}`);
    // no longer a member: fewer steps than where the tour was
    await render(visitor);
    expect(counter()).toBe(`${visitor.length} of ${visitor.length}`);
    expect(onClose).not.toHaveBeenCalled();
    // and no steps at all ends it
    await render([]);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps only the preview when switching pages", async () => {
    const steps: TourStep[] = [
      { title: "One", body: "", path: "/c/demo/" },
      { title: "Two", body: "", path: "/c/demo/explore" },
    ];
    await render(steps, "/c/demo/explore?replay=1&focus=0xabc&reach=1&as=0xdef");
    expect(where).toBe("/c/demo/?as=0xdef");
    await press("ArrowRight");
    expect(where).toBe("/c/demo/explore?as=0xdef");
  });

  it("leaves a replay link's page when the step is the same page", async () => {
    await render([{ title: "Tree", body: "", path: "/c/demo/explore" }], "/c/demo/explore?replay=1");
    expect(where).toBe("/c/demo/explore");
  });

  it("leaves out the pages the community turned off", () => {
    const all = tourSteps({ member: true, signedIn: true });
    const some = tourSteps({ member: true, signedIn: true, tabs: ["home", "polls"] });
    expect(all.filter((s) => s.path === "/explore")).toHaveLength(1);
    expect(some.map((s) => s.path).filter((p) => p && p !== "/")).toEqual(["/polls"]);
    expect(some.some((s) => s.title === "Find someone")).toBe(false);
    expect(all.find((s) => s.target === "nav")?.title).toBe("Four places");
    expect(some.find((s) => s.target === "nav")?.title).toBe("Two places");
  });

  it("names every tab the nav shows, Agents and About included", async () => {
    const steps = tourSteps({
      member: true,
      signedIn: true,
      tabs: ["home", "explore", "polls", "people", "agents", "about"],
    });
    const nav = steps.find((s) => s.target === "nav")!;
    expect(nav.title).toBe("Six places");
    await render([nav], "/");
    const body = container.querySelector("h2")!.nextElementSibling!;
    expect([...body.querySelectorAll("strong")].map((b) => b.textContent)).toEqual([
      "You",
      "Explore",
      "Polls",
      "People",
      "Agents",
      "About",
    ]);
    expect(tourSteps({ member: false, signedIn: false, tabs: ["home", "people", "about"] }).find((s) => s.target === "nav")?.title).toBe(
      "Three places",
    );
  });
});
