import { expect, type Locator, type Page } from "@playwright/test";

/** Dispatch an actual touch drag, rather than Chromium's platform-dependent
 * synthetic scroll gesture. The browser still owns scrolling and snap behavior. */
export async function swipeTrack(
  page: Page,
  track: Locator,
  direction: "left" | "right",
) {
  // Trial action waits for stable geometry and scrolls the target into view.
  await track.click({ trial: true });
  const box = (await track.boundingBox())!;
  const viewport = page.viewportSize()!;
  const left = Math.max(box.x, 0) + 16;
  const right = Math.min(box.x + box.width, viewport.width) - 16;
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, viewport.height);
  expect(right - left).toBeGreaterThan(100);
  expect(bottom - top).toBeGreaterThan(40);
  const y = (top + bottom) / 2;
  const start = direction === "left" ? right : left;
  const end = direction === "left" ? left : right;
  const before = await track.evaluate((node) => node.scrollLeft);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: start, y, id: 0 }],
    });
    for (let step = 1; step <= 12; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: start + ((end - start) * step) / 12, y, id: 0 }],
      });
      // Pace touch events across frames so they form a drag, not a tap/teleport.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
  } finally {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  }
  await expect
    .poll(
      async () => {
        const after = await track.evaluate((node) => node.scrollLeft);
        return direction === "left" ? after - before : before - after;
      },
      { message: "The touch drag must actually scroll the carousel" },
    )
    .toBeGreaterThan(100);
}
