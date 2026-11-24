// The replay's steps: turning a history snapshot into a drawable graph, and
// saying what happened in words.
import { describe, expect, it } from "vitest";

import type { Graph, HistoryNode, HistoryStep } from "./api";
import { actors, caption, compact, graphAt, joinedAt, storyOf, windowOf, worldOf } from "./replay";

const SENTINEL = "0x0000000000000000000000000000000000000001";
const node = (id: string, name: string, parent: string, kids: string[] = [], dagVotes: string[] = []): HistoryNode => ({
  id,
  name,
  currentRep: "1000000000000000000",
  depth: parent === SENTINEL ? 0 : 1,
  sentTreeVote: parent,
  recTreeVotes: kids,
  dagVotes,
});
const step = (index: number, eventName: string, voter: string, recipient: string, nodes: HistoryNode[], name = ""): HistoryStep => ({
  index,
  eventName,
  voter,
  recipient,
  name,
  weight: "1",
  nodes,
});

const ada = node("a", "Ada", SENTINEL, ["b"]);
const joined = step(0, "JoinTreeEvent", "b", "a", [ada, node("b", "Bo", "a")], "Bo");
const endorsed = step(1, "AddDagVoteEvent", "b", "a", [ada, node("b", "Bo", "a", [], ["a"])]);
const live = { version: 9, rootId: "a", maxRelRootDepth: 6, nodes: {} } as unknown as Graph;

describe("replay", () => {
  it("draws a step as a graph, with endorsements both ways", () => {
    const g = graphAt(endorsed, live);
    expect(g.rootId).toBe("a");
    expect(g.nodes.b.sentDagVotes.map((v) => v.id)).toEqual(["a"]);
    expect(g.nodes.a.recDagVotes.map((v) => v.id)).toEqual(["b"]);
  });

  it("says what happened", () => {
    expect(caption(joined, undefined)).toBe("Bo joined under Ada");
    expect(caption(endorsed, joined)).toBe("Bo endorsed Ada");
    const left = step(2, "LeaveTreeEvent", "b", "", [node("a", "Ada", SENTINEL)]);
    expect(caption(left, endorsed)).toBe("Bo left");
    const climbed = step(2, "SwitchPositionWithParentEvent", "b", "", [node("b", "Bo", SENTINEL, ["a"]), node("a", "Ada", "b")]);
    expect(caption(climbed, endorsed)).toBe("Bo climbed above Ada");
    expect(caption(step(0, "joinTreeAsRoot", "a", "", [ada], "Ada"), undefined)).toBe("Ada started the tree");
  });

  it("shares unchanged people between steps", () => {
    // as parsed from JSON: equal, but separate objects
    const parsed = JSON.parse(JSON.stringify([joined, endorsed])) as HistoryStep[];
    const [a, b] = compact(parsed);
    expect(b.nodes[0]).toBe(a.nodes[0]); // Ada didn't change
    expect(b.nodes[1]).not.toBe(a.nodes[1]); // Bo endorsed her
    expect(b.nodes[1].dagVotes).toEqual(["a"]);
    expect(compact(parsed)).toEqual(parsed);
  });

  it("highlights who acted and who it was aimed at", () => {
    expect(actors(endorsed)).toEqual({ voter: "b", recipient: "a", endorsement: true });
    expect(actors(step(2, "LeaveTreeEvent", "b", "", []))).toEqual({ voter: "b", recipient: undefined, endorsement: false });
  });
});

describe("replay pacing", () => {
  it("lingers on climbs, moves, departures and withdrawn endorsements", async () => {
    const { dwell } = await import("./replay");
    expect(dwell(joined)).toBe(1);
    expect(dwell(step(5, "SwitchPositionWithParentEvent", "b", "", []))).toBeGreaterThan(1);
    expect(dwell(undefined)).toBe(1);
  });
});

describe("joinedAt", () => {
  const started = step(0, "joinTreeAsRoot", "a", "", [node("a", "Ada", SENTINEL)], "Ada");
  const steps = [started, step(1, "JoinTreeEvent", "b", "a", [ada, node("b", "Bo", "a")], "Bo"), endorsed];
  it("is the step where someone joins", () => {
    expect(joinedAt(steps, "a")).toBe(0);
    expect(joinedAt(steps, "b")).toBe(1);
  });
  it("is the start for nobody, or someone who never joins", () => {
    expect(joinedAt(steps, undefined)).toBe(0);
    expect(joinedAt(steps, "z")).toBe(0);
  });
});

describe("following someone", () => {
  // Ada at the root, Bo and Cy under her; Cy joins, then Bo endorses Ada,
  // then Cy endorses Bo
  const a2 = node("a", "Ada", SENTINEL, ["b", "c"]);
  const steps = compact([
    step(0, "JoinTreeEvent", "b", "a", [ada, node("b", "Bo", "a")], "Bo"),
    step(1, "JoinTreeEvent", "c", "a", [a2, node("b", "Bo", "a"), node("c", "Cy", "a")], "Cy"),
    step(2, "AddDagVoteEvent", "b", "a", [a2, node("b", "Bo", "a", [], ["a"]), node("c", "Cy", "a")]),
    step(3, "AddDagVoteEvent", "c", "b", [a2, node("b", "Bo", "a", [], ["a"]), node("c", "Cy", "a", [], ["b"])]),
  ]);
  it("plays only the steps of their story, from where they join", () => {
    expect(storyOf(steps, "c")).toEqual([1, 3]);
    expect(storyOf(steps, "b")).toEqual([0, 2, 3]);
    expect(storyOf(steps, undefined)).toEqual([0, 1, 2, 3]);
  });
  it("draws only their part of the tree", () => {
    const g = graphAt(steps[2], live);
    expect(Object.keys(worldOf(g, "c").nodes).sort()).toEqual(["a", "c"]);
    expect(worldOf(g, "c").nodes.a.recTreeVotes).toEqual(["c"]);
    // whoever they endorse, with their line up to the root
    expect(Object.keys(worldOf(graphAt(steps[3], live), "c").nodes).sort()).toEqual(["a", "b", "c"]);
    expect(worldOf(g, undefined)).toBe(g);
  });
});

describe("five layers at a time", () => {
  // a line of seven, a to g, each under the one before, and x beside b
  const names = ["a", "b", "c", "d", "e", "f", "g"];
  const chain = names.map((id, i) =>
    node(id, id.toUpperCase(), i === 0 ? SENTINEL : names[i - 1], [names[i + 1], ...(id === "a" ? ["x"] : [])].filter(Boolean) as string[]),
  );
  const g = graphAt(step(0, "JoinTreeEvent", "g", "f", [...chain, node("x", "X", "a")]), live);
  const ids = (graph: Graph) => Object.keys(graph.nodes).sort();
  it("shows the top five with nobody selected", () => {
    expect(ids(windowOf(g, undefined))).toEqual(["a", "b", "c", "d", "e", "x"]);
  });
  it("shows the three above someone and the one below", () => {
    const w = windowOf(g, "f");
    expect(ids(w)).toEqual(["c", "d", "e", "f", "g"]);
    expect(w.rootId).toBe("c");
  });
  it("shows more below near the top", () => {
    expect(ids(windowOf(g, "b"))).toEqual(["a", "b", "c", "d", "e", "x"]);
  });
});
