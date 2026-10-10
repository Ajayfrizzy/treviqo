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
    const journey = page.locator(".interactive-journey");
    for (const button of await journey.getByRole("button").all()) {
      if ((await button.getAttribute("aria-expanded")) === "true")
        await button.click();
      await button.click();
      await expect(button).toHaveAttribute("aria-expanded", "true");
      await expect(journey.locator(".journey-detail:visible")).toHaveCount(1);
      await checkResponsiveActions(page);
    }
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
        .locator(".journey-detail:visible")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.screenshot({
      path: `test-results/landing-motion-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}
