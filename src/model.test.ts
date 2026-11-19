// The numbers the screens show: reputation sources, shares, rank and how two
// people relate in the tree.
import { describe, expect, it } from "vitest";

import type { Graph, Person } from "./api";
import {
  colorOf,
  darkColorOf,
  endorsementsIn,
  endorsementsOut,
  initials,
  markBackground,
  rankedWithRank,
  rankOf,
  relation,
  rep,
  whiteContrast,
} from "./model";

const E18 = 10n ** 18n;
const r = (n: number) => (BigInt(Math.round(n * 100)) * E18 / 100n).toString();

function person(id: string, depth: number, parent: string, children: string[], over: Partial<Person> = {}): Person {
  return {
    id,
    name: id.toUpperCase(),
    currentRep: r(1),
    totalWeight: "0",
    depth,
    sentTreeVote: parent,
    recTreeVotes: children,
    sentDagVotes: [],
    recDagVotes: [],
    ...over,
  };
}

// root a; b and c under a; d and e under b
const vote = (id: string) => ({ id, weight: "1", dist: 0, posInOther: 0 });
const graph: Graph = {
  version: 1,
  rootId: "a",
  maxRelRootDepth: 6,
  community: {
    id: "commons",
    name: "Commons",
    description: "",
    visibility: "public",
    joinPolicy: "open",
    createdAt: "",
    founder: null,
    members: 5,
    rootName: "a",
    isFounder: false,
    you: null,
  },
  nodes: {
    "0x0000000000000000000000000000000000000001": person("0x0000000000000000000000000000000000000001", -1, "", ["a"]),
    a: person("a", 0, "0x0000000000000000000000000000000000000001", ["b", "c"], {
      currentRep: r(3),
      recDagVotes: [vote("d"), vote("e")],
    }),
    b: person("b", 1, "a", ["d", "e"], { currentRep: r(2), recDagVotes: [vote("d")] }),
    c: person("c", 1, "a", []),
    // d endorses a and b, so each gets half of d's reputation
    d: person("d", 2, "b", [], { totalWeight: "2", sentDagVotes: [vote("a"), vote("b")] }),
    e: person("e", 2, "b", [], { totalWeight: "1", sentDagVotes: [vote("a")] }),
  },
};

describe("model", () => {
  it("splits an endorser's reputation between everyone they endorse", () => {
    const into = endorsementsIn(graph, graph.nodes.a);
    expect(into.map((x) => [x.from.id, x.adds])).toEqual([
      ["e", 1],
      ["d", 0.5],
    ]);
    const out = endorsementsOut(graph, graph.nodes.d);
    expect(out.map((x) => [x.to.id, x.share])).toEqual([
      ["a", 0.5],
      ["b", 0.5],
    ]);
  });

  it("ranks by reputation, skipping the sentinel", () => {
    expect(rankOf(graph, "a")).toEqual({ rank: 1, of: 5 });
    expect(rankOf(graph, "b").rank).toBe(2);
    expect(rep(graph.nodes.b)).toBe(2);
    expect(rankOf(graph, "0x0000000000000000000000000000000000000001").rank).toBe(0);
  });

  it("gives ties the same rank, as the server does", () => {
    // c, d and e all have 1: each is #3 (two people have more)
    expect(["c", "d", "e"].map((id) => rankOf(graph, id).rank)).toEqual([3, 3, 3]);
    expect(rankedWithRank(graph).map(({ p, rank }) => [p.id, rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 3],
      ["e", 3],
    ]);
  });

  it("takes initials by character, not UTF-16 unit", () => {
    expect(initials("🐜 Ant")).toBe("🐜A");
    expect(initials("🐜")).toBe("🐜");
    expect(initials("ada lovelace")).toBe("AL");
  });

  it("describes how two people relate", () => {
    const { a, b, c, d, e } = graph.nodes;
    expect(relation(graph, d, b)).toBe("Your parent");
    expect(relation(graph, b, d)).toBe("Under you");
    expect(relation(graph, d, e)).toBe("Next to you");
    expect(relation(graph, d, a)).toBe("2 levels above you, on your branch");
    expect(relation(graph, d, c)).toBe("1 level above you");
    expect(relation(graph, d, d)).toBeUndefined();
  });

  it("gives ids that differ only at the end clearly different colours", () => {
    const hues = ["0x00000000000000000000000000000000000000aa", "0x00000000000000000000000000000000000000ab"].map(
      (id) => Number(colorOf(id).match(/hsl\((\d+)/)?.[1]),
    );
    expect(Math.abs(hues[0] - hues[1])).toBeGreaterThan(10);
  });

  it("gives everyone a colour in each scheme their white initials pass WCAG AA on, with the same hue", () => {
    expect(whiteContrast(0, 0, 100)).toBeCloseTo(1);
    expect(whiteContrast(0, 0, 0)).toBeCloseTo(21);
    const hsl = (c: string) => c.match(/hsl\((\d+) (\d+)% (\d+)%\)/)!.slice(1).map(Number);
    for (let i = 0; i < 2000; i++) {
      const id = `0x${i.toString(16).padStart(40, "0")}`;
      const light = hsl(colorOf(id));
      const dark = hsl(darkColorOf(id));
      expect(dark[0]).toBe(light[0]);
      for (const [h, s, l] of [light, dark]) {
        expect(whiteContrast(h, s, l)).toBeGreaterThanOrEqual(4.5);
        expect(l).toBeGreaterThan(20);
      }
    }
    // the light colours from before stay where they already passed
    const blue = Array.from({ length: 2000 }, (_, i) => hsl(colorOf(`0x${i.toString(16).padStart(40, "0")}`))).find(
      ([h]) => h >= 230 && h <= 260,
    );
    expect(blue?.[2]).toBe(52);
  });

  it("gives every community's mark a tile its white initial passes WCAG AA on, at both ends", () => {
    const hues = new Set<number>();
    for (const id of ["commons", "demo", ...Array.from({ length: 200 }, (_, i) => `club-${i}`)]) {
      const stops = [...markBackground(id).matchAll(/hsl\((\d+) (\d+)% (\d+)%\)/g)].map((m) => m.slice(1).map(Number));
      expect(stops, id).toHaveLength(2);
      for (const [h, s, l] of stops) expect(whiteContrast(h, s, l), `${id} ${h}`).toBeGreaterThanOrEqual(4.5);
      hues.add(stops[0][0]);
    }
    // every hue (greens and cyans included, the ones that were under 2:1)
    expect(hues.size).toBe(8);
  });
});
