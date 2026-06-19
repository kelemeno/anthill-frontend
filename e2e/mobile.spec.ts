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
  // type, not a hover media-query — some phones mis-report that). The popover
  // carries the info, actions AND the expand control.
  test("tapping a node opens the popover", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    await page.locator(".react-flow__node").first().tap();
    await page.waitForTimeout(1000);
    await expect(page.locator("#mouse-over-popover")).toHaveCount(1);
  });

  test("the popover collapses then re-expands a branch (locked layout)", async ({
    page,
  }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const full = await nodeCount(page);
    // world position of the focus — it stays visible and must not move
    const rootT = () =>
      page
        .locator(`.react-flow__node[data-id="${ROOT}"]`)
        .evaluate((el) => (el as HTMLElement).style.transform);
    const t0 = await rootT();

    // The focus (root) has children → its popover offers "Hide children".
    await page.locator(`.react-flow__node[data-id="${ROOT}"]`).tap();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Hide children/ }).first().tap();
    await page.waitForTimeout(700);
    // collapsed: fewer nodes, but the focus itself is still shown
    expect(await nodeCount(page)).toBeLessThan(full);
    expect(
      await page.locator(`.react-flow__node[data-id="${ROOT}"]`).count(),
    ).toBe(1);

    // re-expand → back to full, and the focus didn't move (locked layout)
    await page.locator(`.react-flow__node[data-id="${ROOT}"]`).tap();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Show children/ }).first().tap();
    await page.waitForTimeout(700);
    expect(await nodeCount(page)).toBe(full);
    expect(await rootT()).toBe(t0);
  });
});
