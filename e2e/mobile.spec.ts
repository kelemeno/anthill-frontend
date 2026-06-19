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
    const before = await nodeCount(page);
    const ids = await page.$$eval(".react-flow__node", (els) =>
      els.map((e) => e.getAttribute("data-id")),
    );
    // find a visible node whose tap reveals more (i.e. had collapsed children)
    // far-left, mid-height: empty pane (nodes are centred; avoids the top-left
    // zoom Controls).
    const tapEmpty = () => page.mouse.click(5, 420);
    let revealedId: string | null = null;
    for (const id of ids) {
      await page.locator(`.react-flow__node[data-id="${id}"]`).tap();
      await page.waitForTimeout(400);
      if ((await nodeCount(page)) > before) {
        revealedId = id;
        break;
      }
      await tapEmpty(); // collapse peek + dismiss popover
      await page.waitForTimeout(200);
    }
    expect(revealedId).not.toBeNull();

    // tapping empty space collapses the peek again
    await tapEmpty();
    await page.waitForTimeout(600);
    expect(await nodeCount(page)).toBe(before);
  });
});
