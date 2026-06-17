import { expect, test } from "@playwright/test";

// End-to-end of the read/navigate workflow through a real browser:
// the app boots, asks the backend for a random leaf, navigates to /?id=0x...,
// and the React Flow graph renders nodes. (The on-chain *join* write is
// wallet-gated, so it is covered by the Vitest on-chain integration test.)
//
// Requires the full local stack up: anvil + seeded contract, backend :5001,
// Vite :5173 (Playwright starts/reuses Vite; anvil + backend must be running).

test.describe("graph read/navigate flow", () => {
  test("boots, fetches a random leaf, and renders the graph", async ({
    page,
  }) => {
    await page.goto("/");

    // On mount the app requests a random leaf from the backend and navigates to it.
    await expect(page).toHaveURL(/\?id=0x[0-9a-fA-F]+/, { timeout: 15_000 });

    // The graph is drawn with React Flow (nodes are .react-flow__node).
    await expect(page.locator(".react-flow").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() => page.locator(".react-flow__node").count(), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // The wallet entry point (gate for joining) is present.
    await expect(
      page.getByRole("button", { name: /connect wallet/i }),
    ).toBeVisible();
  });

  test("opening a known node id renders that node's neighbourhood", async ({
    page,
  }) => {
    // The root node from the deploy/seed script.
    await page.goto("/?id=0x0000000000000000000000000000000000000002");

    await expect(page.locator(".react-flow").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect
      .poll(() => page.locator(".react-flow__node").count(), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0);

    // The id we navigated to stays in the URL (it exists in the seeded graph).
    await expect(page).toHaveURL(/id=0x0+2\b/);
  });
});
