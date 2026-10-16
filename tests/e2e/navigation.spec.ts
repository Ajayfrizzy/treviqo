import { navigateTo } from "../helpers/navigation";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { observePrefetch } from "../helpers/prefetch-observer";

const db = new PrismaClient();
const emails: string[] = [];
test.afterAll(async () => {
  await db.auditEvent.deleteMany({
    where: { user: { email: { in: emails } } },
  });
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});

for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`tab navigation preserves fresh records at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const content: Record<string, string> = {
      "/exit": "No exit cases yet",
      "/passport": "No closed employments yet",
      "/documents": "Add an employment first",
      "/profile": "Email verification is not available yet",
    };
    const prefetch =
      process.env.NAVIGATION_PRODUCTION === "1"
        ? await observePrefetch(page, content)
        : undefined;
    const email = `navigation-${randomUUID()}@example.test`;
    emails.push(email);
    await page.goto("/register");
    await page.getByLabel("First name", { exact: true }).fill("Fixture");
    await page.getByLabel("Last name", { exact: true }).fill("Worker");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic test password 7!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page).toHaveURL("/home");
    if (prefetch) {
      if (width < 600)
        await page.getByRole("button", { name: "More", exact: true }).click();
      try {
        await expect
          .poll(prefetch.missing, {
            timeout: 15_000,
            message: "Destinations still missing fully prefetched page content",
          })
          .toEqual([]);
      } finally {
        await testInfo.attach("prefetch-diagnostics", {
          body: JSON.stringify(prefetch.diagnostics(), null, 2),
          contentType: "application/json",
        });
        await prefetch.dispose();
        if (width < 600) await page.keyboard.press("Escape");
      }
    }
    const nav = page.getByRole("navigation", { name: "Primary" });
    const more = nav.getByRole("button", { name: "More", exact: true });
    if (width < 600) {
      await expect(nav.getByRole("link")).toHaveCount(4);
      await expect(nav.getByRole("button")).toHaveCount(1);
      await expect(nav.getByRole("link", { name: "Documents" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Profile" })).toHaveCount(0);
      const boxes = await nav
        .locator("a:visible, button:visible")
        .evaluateAll((items) =>
          items.map((item) => {
            const { x, y, width, height } = item.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
      expect(new Set(boxes.map(({ y }) => y)).size).toBe(1);
      for (const box of boxes) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      await more.click();
      const sheet = page.getByRole("dialog", { name: "More", exact: true });
      await expect(sheet).toBeVisible();
      await expect(more).toHaveAttribute("aria-expanded", "true");
      await expect(sheet.getByRole("link")).toHaveCount(2);
      await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(sheet.getByRole("link", { name: "Profile" })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(sheet.getByRole("button", { name: "Close" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(sheet).not.toBeVisible();
      await expect(more).toBeFocused();
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.click();
      await page.screenshot({
        path: `test-results/navigation-sheet-${width}.png`,
      });
      await page.mouse.click(4, 100);
      await expect(sheet).not.toBeVisible();
      await expect(more).toBeFocused();
      await more.click();
      await sheet.getByRole("button", { name: "Close" }).click();
      await expect(sheet).not.toBeVisible();
      await more.click();
      await page.setViewportSize({ width: 800, height: 850 });
      await expect(sheet).not.toBeVisible();
      await page.setViewportSize({ width, height: 850 });
    } else {
      await expect(nav.getByRole("link")).toHaveCount(6);
      await expect(more).not.toBeVisible();
    }
    if (width < 800) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const last = page.getByRole("main").getByRole("link").last();
      const lastBox = await last.boundingBox();
      const navBox = await nav.boundingBox();
      expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(navBox!.y);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await page.screenshot({ path: `test-results/navigation-bar-${width}.png` });
    const timings: Record<string, number> = {};
    for (const [label, heading] of [
      ["Exit", "Job Exit Checker"],
      ["Reminders", "Your reminders"],
      ["Passport", "Benefit Passport"],
      ["Documents", "Documents"],
      ["Profile", "Profile"],
      ["Home", "Welcome to Treviqo, Fixture"],
    ] as const) {
      const start = performance.now();
      await navigateTo(page, label);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        heading!,
      );
      if (width < 600 && ["Documents", "Profile"].includes(label)) {
        await expect(more).toHaveAttribute("aria-current", "location");
        await more.click();
        await expect(
          page
            .getByRole("dialog")
            .getByRole("link", { name: label, exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await page.keyboard.press("Escape");
      }
      timings[label!] = Math.round(performance.now() - start);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await testInfo.attach("tab-timings-ms", {
      body: JSON.stringify(timings),
      contentType: "application/json",
    });
    await page.getByRole("link", { name: "Add your first employment" }).click();
    await page.getByLabel("Employer name").fill("Navigation Fixture");
    await page.getByLabel("Role or title").fill("Designer");
    await page.getByLabel("Start date", { exact: true }).fill("2024-01-01");
    await page
      .getByRole("button", { name: "Save employment", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Employment added.");
    await page
      .getByRole("link", { name: "Edit employment", exact: true })
      .click();
    await page.getByLabel("Employment status").selectOption("closed");
    await page.getByLabel("End date", { exact: false }).fill("2025-01-01");
    await page
      .getByRole("button", { name: "Save employment", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Employment updated.");
    await nav.getByRole("link", { name: "Passport", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Navigation Fixture" }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Previous employment" }),
    ).toContainText("Navigation Fixture");
    await navigateTo(page, "Documents");
    await expect(
      page.getByRole("link", { name: "Upload document", exact: true }),
    ).toBeVisible();
    await navigateTo(page, "Profile");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/passport");
    await expect(page).toHaveURL(/\/sign-in/);
  });
}
