import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
const emails: string[] = [];
test.afterAll(async () => {
  await db.user.deleteMany({ where: { email: { in: emails } } });
  await db.$disconnect();
});
for (const width of [320, 375, 430, 768, 1440]) {
  test(`polished auth, first-use screens and profile at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const email = `polish-${randomUUID()}@example.test`;
    emails.push(email);
    await page.goto("/register");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Abcdef1!");
    await expect(
      page.locator(".password-requirements li[data-met=true]"),
    ).toHaveCount(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/polish-register-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Your account is ready",
    );
    await page.getByRole("link", { name: "Sign in to Treviqo" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Abcdef1!");
    await page.screenshot({
      path: `test-results/polish-sign-in-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const label of ["Home", "Exit", "Passport", "Documents", "Profile"]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(
        page.getByRole("main").getByRole("heading", { level: 1 }),
      ).toHaveText(
        (
          {
            Home: "Your working life.",
            Exit: "Job Exit Checker",
            Passport: "Benefit Passport",
            Documents: "Documents",
            Profile: "Profile",
          } as Record<string, string>
        )[label]!,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/polish-${label.toLowerCase()}-${width}.png`,
        fullPage: true,
      });
    }
    await expect(page.getByRole("main")).toContainText(email);
    await expect(page.getByRole("main")).toContainText(
      "Email verification is not available yet",
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}
