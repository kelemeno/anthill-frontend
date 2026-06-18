// Regression coverage for the phone experience (touch + small viewport).
// Requires the full local stack.
import { expect, test } from "@playwright/test";
import { collapseBadges, nodeCount, ringedId, ROOT, waitForGraph } from "./util";

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the scrubber bar is within the viewport", async ({ page }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`);
    await waitForGraph(page);
    const box = await page.locator('input[type=range]').boundingBox();
    expect(box).not.toBeNull();
    // bar pinned to the bottom of the 844px-tall viewport, not below it
    expect((box as { y: number }).y).toBeLessThan(844);
  });

  test("tapping a node selects it", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await ringedId(page);
    const other = "0x0000000000000000000000000000000000000005";
    await page
      .locator(`.react-flow__node[data-id="${other}"]`)
      .tap({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2000);
    expect(await ringedId(page)).toBe(other);
    expect(other).not.toBe(before);
  });

  test("tapping a collapse badge expands the branch", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await nodeCount(page);
    await collapseBadges(page).first().tap();
    await page.waitForTimeout(800);
    expect(await nodeCount(page)).toBeGreaterThan(before);
  });

  test("tapping a node opens the popover", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    await page.locator(".react-flow__node").first().tap();
    await page.waitForTimeout(1000);
    await expect(page.locator("#mouse-over-popover")).toHaveCount(1);
  });
});
