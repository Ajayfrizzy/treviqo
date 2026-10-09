import { expect, type Page } from "@playwright/test";

/** Check visible action targets in the actual rendered screen, including below the fold. */
export async function checkResponsiveActions(page: Page) {
  const problems = await page
    .locator("button, .button-link")
    .evaluateAll((actions) =>
      actions.flatMap((action) => {
        const box = action.getBoundingClientRect();
        if (!box.width || !box.height) return [];
        const label = action.textContent?.trim();
        const errors: string[] = [];
        const minimum = action.classList.contains("password-toggle") ? 44 : 48;
        if (box.height < minimum || box.width < 44)
          errors.push(
            `${label}: undersized target ${box.width} × ${box.height}`,
          );
        if (
          box.left < -1 ||
          box.right > innerWidth + 1 ||
          action.scrollWidth > action.clientWidth + 1
        )
          errors.push(`${label}: clipped or overflowing action`);
        if (
          innerWidth >= 768 &&
          action.matches(
            ".auth-form > button, .employment-form fieldset > button, .passport-flow article > button, .delete-confirm > button",
          )
        ) {
          const parent = action.parentElement!.getBoundingClientRect();
          if (parent.width > 400 && box.width >= parent.width - 2)
            errors.push(`${label}: unnecessarily stretched desktop action`);
        }
        return errors;
      }),
    );
  expect(problems).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
