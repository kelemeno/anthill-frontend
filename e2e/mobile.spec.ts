// Regression coverage for the phone experience (touch + small viewport).
// Requires the full local stack.
import { expect, test } from "@playwright/test";
import { nodeCount, ROOT, waitForGraph } from "./util";

const WITH_CHILDREN = "0x0000000000000000000000000000000000000008";

test.describe("mobile", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("the scrubber bar is within the viewport", async ({ page }) => {
    await page.goto(`/?id=${WITH_CHILDREN}`);
    await waitForGraph(page);
    const box = await page.locator("input[type=range]").boundingBox();
    expect(box).not.toBeNull();
    // bottom bar is in-flow at the foot of the 844px viewport, not below it
    expect((box as { y: number }).y).toBeLessThan(844);
  });

  // On touch a tap opens the popover via a real pointerup handler (the pointer
  // type, not a hover media-query — some phones mis-report that).
  test("tapping a node opens the popover", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    await page.locator(".react-flow__node").first().tap();
    await page.waitForTimeout(1000);
    await expect(page.locator("#mouse-over-popover")).toHaveCount(1);
  });

  // No hover on a phone, so a tap peeks the node's collapsed children open (the
  // mobile equivalent of desktop hover) — and tapping empty space collapses it.
  test("tapping a node peeks its children open", async ({ page }) => {
    await page.goto(`/?id=${WITH_CHILDREN}`); // deeper neighbourhood (has collapse)
    await waitForGraph(page);
    await page.waitForTimeout(1500); // let the staged neighbourhood mostly load
    const ids = await page.$$eval(".react-flow__node", (els) =>
      els.map((e) => e.getAttribute("data-id")),
    );
    // empty pane click (top-left; nodes are centred) collapses the peek.
    const tapEmpty = () =>
      page
        .locator(".react-flow__pane")
        .click({ position: { x: 3, y: 3 } })
        .catch(() => {});
    // Compare counts immediately before/after each tap (the load changes in
    // >1s steps, so a tight window isolates the peek from background loading).
    let peeked = 0;
    let revealedId: string | null = null;
    for (const id of ids) {
      const c0 = await nodeCount(page);
      await page.locator(`.react-flow__node[data-id="${id}"]`).tap();
      await page.waitForTimeout(450);
      const c1 = await nodeCount(page);
      if (c1 > c0) {
        revealedId = id;
        peeked = c1;
        break;
      }
      await tapEmpty();
      await page.waitForTimeout(250);
    }
    // a tap peeked a collapsed branch open
    expect(revealedId).not.toBeNull();

    // tapping empty space collapses the peeked children back
    await tapEmpty();
    await page.waitForTimeout(700);
    expect(await nodeCount(page)).toBeLessThan(peeked);
  });
});
