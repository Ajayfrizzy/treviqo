import { expect, test } from "@playwright/test";
import { checkResponsiveActions } from "../helpers/responsive-actions";

for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
  test(`feature cards and navigation fit ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const features = page.locator(".landing-features");
    const track = features.getByRole("group", {
      name: "Working-life features",
    });
    const cards = features.locator(".feature-card");
    await expect(cards).toHaveCount(7);
    await expect(cards.first().getByRole("heading")).toHaveText(
      "Employment history",
    );
    await expect(cards.last().getByRole("heading")).toHaveText("Reminders");
    if (width < 600) {
      await expect(
        features.getByText("Swipe to explore all seven features"),
      ).toBeVisible();
      await expect(
        features.getByRole("button", { name: "Previous feature" }),
      ).toBeDisabled();
      for (let index = 1; index < 7; index++) {
        await features.getByRole("button", { name: "Next feature" }).click();
        await expect(features.getByRole("status")).toHaveText(
          `${index + 1} / 7 features`,
        );
        await expect(cards.nth(index)).toBeInViewport({ ratio: 0.8 });
      }
      await expect(
        features.getByRole("button", { name: "Next feature" }),
      ).toBeDisabled();
      await features.getByRole("button", { name: "Previous feature" }).click();
      await expect(features.getByRole("status")).toHaveText("6 / 7 features");
      await track.focus();
      await page.keyboard.press("Home");
      await expect(features.getByRole("status")).toHaveText("1 / 7 features");
      await page.keyboard.press("ArrowRight");
      await expect(features.getByRole("status")).toHaveText("2 / 7 features");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.keyboard.press("End");
      await expect(features.getByRole("status")).toHaveText("7 / 7 features");
      await page.keyboard.press("Home");
      await expect(features.getByRole("status")).toHaveText("1 / 7 features");
    } else {
      await expect(features.getByRole("button")).toHaveCount(0);
      expect(
        await track.evaluate((node) => getComputedStyle(node).display),
      ).toBe("grid");
      const boxes = await cards.evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().toJSON()),
      );
      expect(boxes[0]!.y).toBe(boxes[1]!.y);
      expect(boxes[0]!.height).toBe(boxes[1]!.height);
      expect(
        await track.evaluate((node) => node.scrollWidth <= node.clientWidth),
      ).toBe(true);
    }
    await checkResponsiveActions(page);
    await expect
      .poll(() =>
        cards.evaluateAll((nodes) =>
          nodes.every(
            (node) =>
              node.scrollWidth <= node.clientWidth &&
              node.scrollHeight <= node.clientHeight,
          ),
        ),
      )
      .toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await cards
        .first()
        .evaluate((node) => getComputedStyle(node).transitionDuration),
    ).toBe("0s");
    await page.locator('section[aria-labelledby="areas-title"]').screenshot({
      path: `test-results/features-${width}.png`,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}

test("feature pagination follows native touch scrolling", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("/");
  const features = page.locator(".landing-features");
  const track = features.locator(".feature-grid");
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  const session = await context.newCDPSession(page);
  await session.send("Input.synthesizeScrollGesture", {
    x: box.x + box.width * 0.8,
    y: box.y + 80,
    xDistance: -250,
    yDistance: 0,
    gestureSourceType: "touch",
    speed: 500,
  });
  await expect(features.getByRole("status")).not.toHaveText("1 / 7 features");
  await context.close();
});

test("all feature content remains available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto("/");
  const features = page.locator(".landing-features");
  await expect(features.locator(".feature-card")).toHaveCount(7);
  await expect(features.getByRole("button")).toHaveCount(0);
  await features.locator(".feature-grid").evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await features.locator(".feature-grid").scrollIntoViewIfNeeded();
  await expect(
    features.getByRole("heading", { name: "Reminders" }),
  ).toBeInViewport();
  await context.close();
});
