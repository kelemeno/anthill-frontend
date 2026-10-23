// The numbers the screens show: reputation sources, shares, rank and how two
// people relate in the tree.
import { describe, expect, it } from "vitest";

import type { Graph, Person } from "./api";
import { colorOf, endorsementsIn, endorsementsOut, rankOf, relation, rep } from "./model";

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
});
