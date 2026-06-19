// Regression coverage for node drag-wiggle, curve-following, the curve/node
// connection (no gap), and edge-gradient integrity (the curve-flicker fix).
// Requires the full local stack: anvil + backend :5001 + Vite :5173.
import { expect, test } from "@playwright/test";
import { ringedId, ROOT, waitForGraph } from "./util";

const CHILD = "0x0000000000000000000000000000000000000004";

const nodeTransform = (page, id: string) =>
  page
    .locator(`.react-flow__node[data-id="${id}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

const edgePathD = (page, targetId: string) =>
  page
    .locator(`.react-flow__edge[data-id$="->${targetId}"] .react-flow__edge-path`)
    .first()
    .getAttribute("d");

const viewportTransform = (page) =>
  page
    .locator(".react-flow__viewport")
    .first()
    .evaluate((el) => getComputedStyle(el).transform);

test.describe("node drag-wiggle", () => {
  test("dragging a node moves it, the curve follows, then it springs back", async ({
    page,
  }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const ringBefore = await ringedId(page);
    const nodeT0 = await nodeTransform(page, CHILD);
    const edge0 = await edgePathD(page, CHILD);

    const box = await page
      .locator(`.react-flow__node[data-id="${CHILD}"]`)
      .boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box!.x + box!.width / 2 + 70,
      box!.y + box!.height / 2 + 50,
      { steps: 6 },
    );
    await page.waitForTimeout(150);
    // mid-drag: the node moved AND its curve re-routed with it
    expect(await nodeTransform(page, CHILD)).not.toBe(nodeT0);
    expect(await edgePathD(page, CHILD)).not.toBe(edge0);

    await page.mouse.up();
    await page.waitForTimeout(700);
    // springs back to (essentially) its locked position — i.e. nowhere near the
    // dragged offset — and a drag never selects.
    const parse = (t: string) => {
      const m = t.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
      return m ? { x: +m[1], y: +m[2] } : { x: 0, y: 0 };
    };
    const a = parse(await nodeTransform(page, CHILD));
    const o = parse(nodeT0);
    expect(Math.hypot(a.x - o.x, a.y - o.y)).toBeLessThan(12);
    expect(await ringedId(page)).toBe(ringBefore);
  });

  test("the empty background is still pannable", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const v0 = await viewportTransform(page);
    await page.mouse.move(160, 230);
    await page.mouse.down();
    await page.mouse.move(300, 320, { steps: 5 });
    await page.waitForTimeout(60);
    const vPan = await viewportTransform(page);
    await page.mouse.up();
    expect(vPan).not.toBe(v0);
  });

  test("curves connect flush to nodes (no gap)", async ({ page }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const gap = await page.evaluate((child) => {
      const node = document.querySelector(
        `.react-flow__node[data-id="${child}"]`,
      ) as HTMLElement;
      const path = document.querySelector(
        `.react-flow__edge[data-id$="->${child}"] .react-flow__edge-path`,
      ) as SVGPathElement;
      // the curve must reach (overlap) the node top, not stop short of it
      return path.getBoundingClientRect().bottom - node.getBoundingClientRect().top;
    }, CHILD);
    expect(gap).toBeGreaterThanOrEqual(0);
  });

  test("every edge gradient reference resolves (no flicker)", async ({
    page,
  }) => {
    await page.goto(`/?id=${ROOT}`);
    await waitForGraph(page);
    const allResolve = await page.evaluate(() => {
      const paths = Array.from(
        document.querySelectorAll(".react-flow__edge-path"),
      );
      return paths.every((p) => {
        const m = getComputedStyle(p as SVGElement).stroke.match(
          /url\(["']?#([^"')]+)/,
        );
        return m ? !!document.getElementById(m[1]) : false;
      });
    });
    expect(allResolve).toBe(true);
  });
});
