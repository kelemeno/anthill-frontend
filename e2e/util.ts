// Shared helpers for the graph e2e specs.
import type { Page } from "@playwright/test";

export const ROOT = "0x0000000000000000000000000000000000000002";

// Wait until the graph has rendered and the initial fit/layout has settled.
export async function waitForGraph(page: Page): Promise<void> {
  await page.waitForSelector(".react-flow__node", { timeout: 20000 });
  await page.waitForTimeout(3000);
}

export const nodeCount = (page: Page) =>
  page.locator(".react-flow__node").count();

// id of the currently selected (ringed) node — the one whose circle has the
// selection box-shadow.
export function ringedId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    for (const n of Array.from(
      document.querySelectorAll(".react-flow__node"),
    )) {
      for (const d of Array.from(n.querySelectorAll("div"))) {
        if (getComputedStyle(d).boxShadow !== "none") {
          return n.getAttribute("data-id");
        }
      }
    }
    return null;
  });
}

export const viewportTransform = (page: Page) =>
  page
    .locator(".react-flow__viewport")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
