// Regression coverage for the graph interactions (desktop). Requires the full
// local stack: anvil + seeded contract, backend :5001, Vite :5173.
import { expect, test } from "@playwright/test";
import { nodeCount, ringedId, ROOT, waitForGraph } from "./util";

test.describe("graph interactions", () => {
  test("opens to a compact top-few-levels view", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const n = await nodeCount(page);
    // Default = top 3 levels only (compact), not the whole tree. Deeper branches
    // are collapsed (and expanded from the node's popover, not an on-node badge).
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(15);
    // No on-node buttons — the graph is clean (expand lives in the popover).
    expect(await page.locator(".react-flow__node button").count()).toBe(0);
  });

  test("clicking a node moves the selection ring", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await ringedId(page);
    const other = "0x0000000000000000000000000000000000000004"; // child of root
    await page
      .locator(`.react-flow__node[data-id="${other}"]`)
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2000);
    const after = await ringedId(page);
    expect(after).not.toBe(before);
    expect(after).toBe(other);
  });

  test("'+ Votes' overlays the focused node's outgoing votes on the tree", async ({
    page,
  }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`);
    await waitForGraph(page);
    // default Tree view: no vote overlay
    expect(
      await page.locator('.react-flow__edge[data-id^="vote-"]').count(),
    ).toBe(0);
    // switch to "+ Votes" (toggle is in the header on desktop)
    await page.getByRole("button", { name: "+ Votes" }).click();
    await page.waitForTimeout(1200);
    expect(
      await page.locator('.react-flow__edge[data-id^="vote-out-"]').count(),
    ).toBeGreaterThan(0);
  });
});
