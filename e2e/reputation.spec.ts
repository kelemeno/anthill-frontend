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

  test("the playbar tracks the view (outgoing vs incoming votes)", async ({
    page,
  }) => {
    const scrubLabels = async () => {
      const slider = page.locator("input[type=range]");
      if ((await slider.count()) === 0) return [] as string[];
      const max = Number(await slider.getAttribute("max"));
      const out: string[] = [];
      for (let i = 0; i <= max; i++) {
        await slider.fill(String(i));
        await page.waitForTimeout(60);
        const d = await page
          .locator("div span", { hasText: /voted|joined|grew/ })
          .last()
          .textContent()
          .catch(() => "");
        if (d) out.push(d.trim());
      }
      return [...new Set(out)];
    };
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);

    await page.getByRole("button", { name: "+ Votes" }).click();
    await page.waitForTimeout(1800);
    const votes = await scrubLabels();
    // "+ Votes": the focus is the voter
    expect(votes.some((l) => /008 voted for/.test(l))).toBe(true);

    await page.getByRole("button", { name: "Reputation" }).click();
    await page.waitForTimeout(1800);
    const rep = await scrubLabels();
    // "Reputation": the focus is the one being voted for
    expect(rep.some((l) => /voted for 0x000…008/.test(l))).toBe(true);
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
