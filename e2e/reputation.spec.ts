// Regression coverage for the three-way view toggle (Tree / + Votes /
// Reputation). All three share the tree layout; the toggle only changes which
// dag-vote overlay the focused node shows. Requires the full local stack.
import { expect, test } from "@playwright/test";
import { waitForGraph } from "./util";

const NODE = "0x0000000000000000000000000000000000000008";
const outCount = (page: import("@playwright/test").Page) =>
  page.locator('.react-flow__edge[data-id^="vote-out-"]').count();
const inCount = (page: import("@playwright/test").Page) =>
  page.locator('.react-flow__edge[data-id^="vote-in-"]').count();

test.describe("view toggle", () => {
  test("Tree shows no vote overlay", async ({ page }) => {
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);
    expect(await outCount(page)).toBe(0);
    expect(await inCount(page)).toBe(0);
  });

  test("Reputation shows incoming votes (blue) and no outgoing", async ({
    page,
  }) => {
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);
    await page.getByRole("button", { name: "Reputation" }).click();
    await page.waitForTimeout(1500);
    // reputation view: incoming dag votes, never outgoing
    expect(await outCount(page)).toBe(0);
    expect(await inCount(page)).toBeGreaterThan(0);
  });

  test("switching the toggle swaps the overlay direction", async ({ page }) => {
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);
    await page.getByRole("button", { name: "+ Votes" }).click();
    await page.waitForTimeout(1200);
    expect(await outCount(page)).toBeGreaterThan(0);
    expect(await inCount(page)).toBe(0);

    await page.getByRole("button", { name: "Reputation" }).click();
    await page.waitForTimeout(1200);
    expect(await outCount(page)).toBe(0);
  });
});
