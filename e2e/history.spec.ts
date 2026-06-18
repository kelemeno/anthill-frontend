// Regression coverage for the history scrubber (scoped to the displayed graph).
// Requires the full local stack (anvil + backend /history + Vite).
import { expect, test } from "@playwright/test";
import { nodeCount, waitForGraph } from "./util";

const NODE = "0x0000000000000000000000000000000000000008";

test.describe("history scrubber", () => {
  test("appears at the bottom and scrubs the displayed graph's evolution", async ({
    page,
  }) => {
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);

    const slider = page.locator('input[type=range]');
    await expect(slider).toBeVisible();

    const max = Number(await slider.getAttribute("max"));
    expect(max).toBeGreaterThan(0);

    // Latest (right end) vs the very first step: the displayed set is smaller
    // earlier, since fewer of the visible nodes existed yet.
    await slider.fill(String(max));
    await page.waitForTimeout(700);
    const latest = await nodeCount(page);

    await slider.fill("0");
    await page.waitForTimeout(700);
    const earliest = await nodeCount(page);

    expect(earliest).toBeLessThan(latest);
    expect(earliest).toBeGreaterThan(0);
  });

  test("tree-mode playback shows no dag votes, just joins/aggregates", async ({
    page,
  }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000002`); // root, tree mode
    await waitForGraph(page);
    const slider = page.locator("input[type=range]");
    const max = Number(await slider.getAttribute("max"));
    const labels: string[] = [];
    for (let i = 0; i <= max; i++) {
      await slider.fill(String(i));
      await page.waitForTimeout(80);
      const d = await page
        .locator("div span", { hasText: /joined|voted|grew|removed/ })
        .last()
        .textContent()
        .catch(() => "");
      if (d) labels.push(d.trim());
    }
    const uniq = [...new Set(labels)];
    // Tree view: no reputation-vote steps...
    expect(uniq.filter((l) => /voted for/.test(l)).length).toBe(0);
    // ...and hidden children fold into an aggregate "grew" step.
    expect(uniq.some((l) => /grew to/.test(l))).toBe(true);
  });

  test("Live button returns to the current state", async ({ page }) => {
    await page.goto(`/?id=${NODE}`);
    await waitForGraph(page);
    const live = await nodeCount(page);

    await page.locator('input[type=range]').fill("0");
    await page.waitForTimeout(600);
    expect(await nodeCount(page)).toBeLessThan(live);

    await page.getByRole("button", { name: "Live" }).click();
    await page.waitForTimeout(600);
    expect(await nodeCount(page)).toBe(live);
  });
});
