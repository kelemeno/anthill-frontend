// Regression coverage for the graph interactions (desktop). Requires the full
// local stack: anvil + seeded contract, backend :5001, Vite :5173.
import { expect, test } from "@playwright/test";
import {
  collapseBadges,
  nodeCount,
  ringedId,
  ROOT,
  viewportTransform,
  waitForGraph,
} from "./util";

test.describe("graph interactions", () => {
  test("opens to the top few levels with collapse badges", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const n = await nodeCount(page);
    // Default = top 3 levels only (compact), not the whole tree.
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(15);
    // Deeper branches are folded into +N badges.
    expect(await collapseBadges(page).count()).toBeGreaterThan(0);
  });

  test("a node's badge expands then collapses its branch", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await nodeCount(page);

    // The node carrying the first +N badge — toggle THAT node both ways.
    const badgeNode = page
      .locator(".react-flow__node", {
        has: page.locator("button", { hasText: "+" }),
      })
      .first();
    const id = await badgeNode.getAttribute("data-id");

    await badgeNode.locator("button").click();
    await page.waitForTimeout(700);
    const expanded = await nodeCount(page);
    expect(expanded).toBeGreaterThan(before);

    await page.locator(`.react-flow__node[data-id="${id}"] button`).click();
    // Move off the node so the hover-peek closes, then it returns to `before`.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1800);
    expect(await nodeCount(page)).toBe(before);
  });

  test("clicking a node moves the selection ring", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await ringedId(page);
    const other =
      "0x0000000000000000000000000000000000000004"; // a child of the root
    await page
      .locator(`.react-flow__node[data-id="${other}"]`)
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2000);
    const after = await ringedId(page);
    expect(after).not.toBe(before);
    expect(after).toBe(other);
  });

  test("a node drilled-to via hover stays visible after you click it", async ({
    page,
  }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    // hover a collapsed branch open, then click a node it reveals
    const parent = page
      .locator(".react-flow__node", {
        has: page.locator("button", { hasText: "+" }),
      })
      .first();
    const pid = await parent.getAttribute("data-id");
    await parent.hover();
    await page.waitForTimeout(700);
    const child = await page.evaluate((pid) => {
      const top3 = [
        "0x0000000000000000000000000000000000000002",
        "0x0000000000000000000000000000000000000004",
        "0x0000000000000000000000000000000000000005",
      ];
      return (
        Array.from(document.querySelectorAll(".react-flow__node"))
          .map((n) => n.getAttribute("data-id"))
          .find((id) => id && id !== pid && !top3.includes(id)) ?? null
      );
    }, pid);
    await page
      .locator(`.react-flow__node[data-id="${child}"]`)
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    // move away and wait past the 1500ms hover-peek close — it must NOT vanish
    await page.mouse.move(3, 3);
    await page.waitForTimeout(2200);
    expect(
      await page.locator(`.react-flow__node[data-id="${child}"]`).count(),
    ).toBe(1);
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
    // switch to "+ Votes": outgoing (green) vote edges appear
    await page.getByRole("button", { name: "+ Votes" }).click();
    await page.waitForTimeout(1200);
    expect(
      await page.locator('.react-flow__edge[data-id^="vote-out-"]').count(),
    ).toBeGreaterThan(0);
  });

  test("layout stays put when expanding (no viewport jump)", async ({
    page,
  }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const beforeNodes = await nodeCount(page);
    const beforeTransform = await viewportTransform(page);
    await collapseBadges(page).first().click();
    await page.waitForTimeout(700);
    // the expand actually happened...
    expect(await nodeCount(page)).toBeGreaterThan(beforeNodes);
    // ...and the viewport did not jump.
    expect(await viewportTransform(page)).toBe(beforeTransform);
  });
});
