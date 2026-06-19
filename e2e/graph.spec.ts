// Regression coverage for the graph interactions (desktop). Requires the full
// local stack: anvil + seeded contract, backend :5001, Vite :5173.
import { expect, test } from "@playwright/test";
import { nodeCount, ringedId, ROOT, waitForGraph } from "./util";

test.describe("graph interactions", () => {
  test("opens to a compact top-few-levels view", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const n = await nodeCount(page);
    // Default = top 3 levels only (compact), not the whole tree. Deeper branches
    // are collapsed (and expanded from the node's popover, not an on-node badge).
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(15);
    // No on-node buttons — the graph is clean (expand lives in the popover).
    expect(await page.locator(".react-flow__node button").count()).toBe(0);
  });

  test("clicking a node moves the selection ring", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const before = await ringedId(page);
    const other = "0x0000000000000000000000000000000000000004"; // child of root
    await page
      .locator(`.react-flow__node[data-id="${other}"]`)
      .click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(2000);
    const after = await ringedId(page);
    expect(after).not.toBe(before);
    expect(after).toBe(other);
  });

  test("'+ Votes' overlays the focused node's outgoing votes on the tree", async ({
    page,
  }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`);
    await waitForGraph(page);
    // default Tree view: no vote overlay
    expect(
      await page.locator('.react-flow__edge[data-id^="vote-"]').count(),
    ).toBe(0);
    // switch to "+ Votes" (toggle is in the header on desktop)
    await page.getByRole("button", { name: "+ Votes" }).click();
    await page.waitForTimeout(1200);
    expect(
      await page.locator('.react-flow__edge[data-id^="vote-out-"]').count(),
    ).toBeGreaterThan(0);
  });

  // Hover-peeking a node must not move the node you're hovering — otherwise the
  // cursor falls off it, the peek closes, and it loops (jumps back and forth).
  test("hovering a node doesn't make it jump around", async ({ page }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`); // deep view
    await waitForGraph(page);
    await page.waitForTimeout(1500);
    const focus = "0x0000000000000000000000000000000000000008";
    const ids = (
      await page.$$eval(".react-flow__node", (els) =>
        els.map((e) => e.getAttribute("data-id")),
      )
    ).filter((i) => i !== focus);
    // find a non-focus node whose hover peeks children open (would re-layout)
    let target: string | null = null;
    for (const id of ids) {
      const box = await page
        .locator(`.react-flow__node[data-id="${id}"]`)
        .boundingBox();
      if (!box) continue;
      const c0 = await nodeCount(page);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(500);
      if ((await nodeCount(page)) > c0) {
        target = id;
        break;
      }
      await page.mouse.move(2, 2);
      await page.waitForTimeout(1700); // let the peek close
    }
    expect(target).not.toBeNull();

    // keep hovering it and sample its screen position — it must stay put
    const box = await page
      .locator(`.react-flow__node[data-id="${target}"]`)
      .boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const xs: number[] = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(300);
      const b = await page
        .locator(`.react-flow__node[data-id="${target}"]`)
        .boundingBox();
      xs.push(Math.round(b?.x ?? 0));
    }
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(10);
  });

  // The per-layer left-to-right order must be FIXED: peeking a branch open may
  // re-space nodes but must never re-shuffle their order (re-ordering is what let
  // a node jump under the cursor → the hover loop).
  test("node order is preserved when a branch peeks open", async ({ page }) => {
    await page.goto(`/?id=0x0000000000000000000000000000000000000008`);
    await waitForGraph(page);
    await page.waitForTimeout(2000);
    const focus = "0x0000000000000000000000000000000000000008";
    // ids left-to-right (grouped into rows by rounded y)
    const order = () =>
      page.$$eval(".react-flow__node", (els) => {
        const ns = els.map((e) => {
          const r = e.getBoundingClientRect();
          return {
            id: e.getAttribute("data-id") ?? "",
            x: r.x + r.width / 2,
            y: Math.round((r.y + r.height / 2) / 40),
          };
        });
        const rows = new Map<number, typeof ns>();
        for (const n of ns) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y))!.push(n);
        return [...rows.values()].flatMap((r) =>
          r.sort((a, b) => a.x - b.x).map((n) => n.id),
        );
      });
    const before = await order();
    // peek a non-focus node open
    const ids = (
      await page.$$eval(".react-flow__node", (els) =>
        els.map((e) => e.getAttribute("data-id")),
      )
    ).filter((i) => i !== focus);
    for (const id of ids) {
      const c0 = await nodeCount(page);
      const b = await page
        .locator(`.react-flow__node[data-id="${id}"]`)
        .boundingBox();
      if (!b) continue;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(500);
      if ((await nodeCount(page)) > c0) break;
      await page.mouse.move(2, 2);
      await page.waitForTimeout(1700);
    }
    const after = await order();
    // common nodes must appear in the same relative order in both
    const a = before.filter((id) => after.includes(id));
    const b = after.filter((id) => before.includes(id));
    expect(b).toEqual(a);
  });
});
