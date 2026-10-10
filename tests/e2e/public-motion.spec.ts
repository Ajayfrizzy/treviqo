import { expect, test } from "@playwright/test";
import { checkResponsiveActions } from "../helpers/responsive-actions";

for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
  test(`landing examples respond to touch and keyboard at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const choices = page.getByRole("group", {
      name: "Explore example chapters",
    });
    const preview = page.locator(".record-preview");
    await expect(preview).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const initialHeight = (await preview.boundingBox())!.height;
    for (const [label, title] of [
      ["Documents", "Your evidence. Within reach."],
      ["Next chapter", "A clearer way forward."],
      ["Employment", "Every chapter. One place."],
    ]) {
      const button = choices.getByRole("button", { name: label, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(preview.getByRole("heading", { name: title })).toBeVisible();
      expect((await preview.boundingBox())!.height).toBeCloseTo(
        initialHeight,
        0,
      );
      await checkResponsiveActions(page);
    }
    await choices
      .getByRole("button", { name: "Documents", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      preview.getByRole("heading", { name: "Your evidence. Within reach." }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(
      choices.getByRole("button", { name: "Next chapter" }),
    ).toBeFocused();
    await page.keyboard.press("Space");
    await expect(
      preview.getByRole("heading", { name: "A clearer way forward." }),
    ).toBeVisible();
    const journey = page.locator("#how-it-works");
    const labels = [
      "Add employment",
      "Save important evidence",
      "Review extracted details",
      "Manage an exit",
      "Keep your history",
    ];
    await expect(journey.getByRole("tabpanel")).toHaveAccessibleName(
      "Add employment",
    );
    await expect(journey.getByRole("tabpanel")).toContainText(
      "Example Company",
    );
    await expect(
      journey.locator("[aria-expanded], .journey-toggle, .interactive-journey"),
    ).toHaveCount(0);
    for (const label of labels) {
      const tab = journey.getByRole("tab", { name: label, exact: true });
      await expect(tab).toBeVisible();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(journey.getByRole("tabpanel")).toHaveCount(1);
      await expect(journey.getByRole("tabpanel")).toHaveAccessibleName(label);
      await expect(journey.getByRole("tabpanel")).toContainText(
        "Illustrative example",
      );
      await checkResponsiveActions(page);
      if (width === 375 || width === 1440) {
        await journey.screenshot({
          path: `test-results/story-${width}-${labels.indexOf(label) + 1}.png`,
          animations: "disabled",
        });
      }
    }
    await expect(
      journey.getByRole("link", { name: "Create your account" }),
    ).toHaveAttribute("href", "/register");
    await journey.getByRole("tab").last().focus();
    await page.keyboard.press("Home");
    await expect(journey.getByRole("tab").first()).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(journey.getByRole("tab").nth(1)).toBeFocused();
    await expect(journey.getByRole("tab").nth(1)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(journey.getByRole("tab").first()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(journey.getByRole("tab").nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(journey.getByRole("tab").first()).toBeFocused();
    await page.keyboard.press("End");
    await expect(journey.getByRole("tab").last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(journey.getByRole("tabpanel")).toBeFocused();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await choices
      .getByRole("button", { name: "Documents", exact: true })
      .click();
    expect(
      await page
        .locator('.chapter-panel[data-active="true"]')
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    expect(
      await journey
        .locator(".story-panel:not([hidden]) .story-copy")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await journey.getByRole("tab").first().click();
    await journey.screenshot({
      path: `test-results/story-journey-${width}.png`,
      animations: "disabled",
    });
    await page.screenshot({
      path: `test-results/landing-motion-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await journey.getByRole("tab").last().click();
    await journey.getByRole("link", { name: "Create your account" }).click();
    await expect(page).toHaveURL("/register");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Create your account",
    );
    await page
      .getByRole("link", { name: "Already have an account? Sign in" })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome back",
    );
    expect(errors).toEqual([]);
  });
}

test("journey stories are readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 375, height: 900 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const journey = page.locator("#how-it-works");
  await expect(journey.locator(".story-panel:visible")).toHaveCount(5);
  await expect(journey.getByRole("tablist")).toHaveCount(0);
  await expect(
    journey.getByRole("link", { name: "Create your account" }),
  ).toHaveAttribute("href", "/register");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
