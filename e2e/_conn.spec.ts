import { test } from "@playwright/test";
test("connection zoom", async ({ page }) => {
  await page.goto("/?id=0x0000000000000000000000000000000000000002");
  await page.waitForSelector(".react-flow__node", { timeout: 20000 });
  await page.waitForTimeout(3500);
  // zoom around a child node's TOP (where the curve connects) — 0x..004
  const box = await page.locator(`.react-flow__node[data-id="0x0000000000000000000000000000000000000004"]`).boundingBox();
  await page.screenshot({ path: "/tmp/conn.png", clip: { x: box!.x-20, y: box!.y-50, width: box!.width+40, height: box!.height/2+50 } });
  // also the focused node's bottom (curve out from under the glow)
  const rbox = await page.locator(`.react-flow__node[data-id="0x0000000000000000000000000000000000000002"]`).boundingBox();
  await page.screenshot({ path: "/tmp/conn_focus.png", clip: { x: rbox!.x-25, y: rbox!.y+rbox!.height/2, width: rbox!.width+50, height: rbox!.height } });
});
