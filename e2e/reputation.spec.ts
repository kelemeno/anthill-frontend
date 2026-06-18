// Regression coverage for the Reputation (dag-vote) view: a flat 3-row vote
// neighbourhood, not a tree with collapse. Requires the full local stack.
import { expect, test } from "@playwright/test";
import { waitForGraph } from "./util";

test.describe("reputation view", () => {
  test("renders a 3-row vote view with no tree-collapse badges", async ({
    page,
  }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`);
    await waitForGraph(page);
    // switch to Reputation mode
    await page.locator('label[for="checkbox"]').click({ force: true });
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => {
      const ns = Array.from(document.querySelectorAll(".react-flow__node"));
      // cluster node centers into y-bands
      const ys = ns.map((n) => {
        const r = n.getBoundingClientRect();
        return Math.round((r.y + r.height / 2) / 40);
      });
      const widths = Array.from(
        document.querySelectorAll(".react-flow__edge path"),
      ).map((p) => Number((p as SVGElement).getAttribute("stroke-width") || 0));
      return {
        count: ns.length,
        bands: new Set(ys).size,
        badges: document.querySelectorAll(".react-flow__node button").length,
        edges: widths.length,
      };
    });

    expect(info.count).toBeGreaterThan(1);
    // person + (some above) + (some below) → up to 3 bands, never tree-deep
    expect(info.bands).toBeLessThanOrEqual(3);
    // no +N collapse badges in the dag view
    expect(info.badges).toBe(0);
    // edges to/from the centre
    expect(info.edges).toBeGreaterThan(0);
  });
});
