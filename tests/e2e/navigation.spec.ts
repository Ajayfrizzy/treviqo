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

for (const width of [375, 1440]) {
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
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic test password 7!");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your account is ready",
    );
    await page.getByRole("link", { name: "Sign in to Treviqo" }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Synthetic test password 7!");
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/");
    if (prefetch) {
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
      }
    }
    const nav = page.getByRole("navigation", { name: "Primary" });
    const timings: Record<string, number> = {};
    for (const [label, heading] of [
      ["Exit", "Job Exit Checker"],
      ["Passport", "Benefit Passport"],
      ["Documents", "Documents"],
      ["Profile", "Profile"],
      ["Home", "Your working life."],
    ]) {
      const start = performance.now();
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        heading!,
      );
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
    await nav.getByRole("link", { name: "Documents", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Upload document", exact: true }),
    ).toBeVisible();
    await nav.getByRole("link", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/passport");
    await expect(page).toHaveURL(/\/sign-in/);
  });
}
