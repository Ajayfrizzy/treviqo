import type { Page } from "@playwright/test";

export function primaryDestination(page: Page, label: string) {
  const secondary = ["Documents", "Profile"].includes(label);
  const mobile = (page.viewportSize()?.width ?? 1440) < 600;
  return page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole(secondary && mobile ? "button" : "link", {
      name: secondary && mobile ? "More" : label,
      exact: true,
    });
}

export async function navigateTo(page: Page, label: string) {
  const target = primaryDestination(page, label);
  await target.click();
  if (
    ["Documents", "Profile"].includes(label) &&
    (page.viewportSize()?.width ?? 1440) < 600
  ) {
    await page
      .getByRole("dialog", { name: "More", exact: true })
      .getByRole("link", { name: label, exact: true })
      .click();
  }
}
