import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { checkResponsiveActions } from "../helpers/responsive-actions";
const db = new PrismaClient();
const emails: string[] = [];
const origin = "http://127.0.0.1:3100";
const password = "Synthetic Onboarding 7!";
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await db.auditEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.employmentDocument.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
  test(`public journey, onboarding and profile at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your working life.Yours to keep.",
    );
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );
    for (const title of [
      "Employment history",
      "Secure documents",
      "AI-assisted document review",
      "Job Exit Checker",
      "Settlement and pension review",
      "Benefit Passport",
      "Reminders",
    ])
      await expect(
        page.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    await checkResponsiveActions(page);
    await page.screenshot({
      path: `test-results/public-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page
        .locator(".hero-copy")
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(
      await page
        .locator(".feature-card")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page
      .getByRole("link", { name: "Create your account", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL("/register");
    await expect(page.getByLabel("Country or territory")).toHaveValue("");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByLabel("First name", { exact: true })).toBeFocused();
    await expect(page.locator("#firstName-error")).toContainText(
      "Enter a name",
    );
    const email = `onboarding-${randomUUID()}@example.test`;
    emails.push(email);
    await page.getByLabel("First name", { exact: true }).fill("Adé");
    await page.getByLabel("Last name", { exact: true }).fill("Okafor");
    await page.getByLabel("Preferred name").fill("Dee");
    await page.getByLabel("Country or territory").selectOption("NG");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await checkResponsiveActions(page);
    await page.screenshot({
      path: `test-results/auth-personal-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Welcome to Treviqo, Dee",
    );
    await page.getByRole("link", { name: "Sign in to Treviqo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome back",
    );
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page).toHaveURL("/home");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome to Treviqo, Dee",
    );
    await expect(
      page.getByRole("region", { name: "Working-life overview" }),
    ).toHaveCount(0);
    await expect(page.locator(".onboarding-progress")).toContainText(
      "Create account — complete",
    );
    await page.getByRole("link", { name: "Explore Treviqo first" }).click();
    await expect(
      page.getByRole("heading", { name: "Explore your personal space" }),
    ).toBeVisible();
    await checkResponsiveActions(page);
    await page.screenshot({
      path: `test-results/onboarding-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Add your first employment", exact: true })
      .click();
    await expect(page).toHaveURL("/employments/new");
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL("/home");
    const response = await page.request.post("/api/employments", {
      headers: { origin },
      data: {
        employerName: "Fixture Company",
        roleTitle: "Designer",
        startDate: "2024-01-01",
      },
    });
    expect(response.status()).toBe(201);
    const employmentId = (await response.json()).employment.id;
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome back, Dee",
    );
    await expect(page.locator(".onboarding-progress")).toContainText(
      "Add employment — complete",
    );
    await expect(
      page.getByRole("link", { name: "Add your first document", exact: true }),
    ).toHaveAttribute("href", "/documents/upload");
    expect(
      (
        await page.request.post(
          `/api/documents?employmentId=${employmentId}&documentType=employment_contract`,
          {
            headers: {
              origin,
              "content-type": "application/pdf",
              "x-file-name": "fixture.pdf",
            },
            data: readFileSync("tests/fixtures/document.pdf"),
          },
        )
      ).status(),
    ).toBe(201);
    await page.reload();
    await expect(page.locator(".onboarding-card")).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Working-life overview" }),
    ).toContainText("Documents to review");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Profile", exact: true })
      .click();
    await expect(page.getByRole("main")).toContainText("Nigeria");
    await expect(page.getByRole("main")).toContainText("Okafor");
    const edit = page.getByRole("region", { name: "Edit personal details" });
    await edit.getByLabel("Preferred name").fill("");
    await edit.getByRole("button", { name: "Save profile" }).click();
    await expect(edit.getByRole("status")).toHaveText("Profile saved.");
    await checkResponsiveActions(page);
    await page.screenshot({
      path: `test-results/profile-personal-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Welcome back, Adé",
    );
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await page
      .getByRole("link", { name: "Sign in", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL("/home");
    expect(browserErrors).toEqual([]);
  });
}
test("legacy accounts have a generic greeting and profile edits retain input after failure", async ({
  page,
}) => {
  const { hash } = await import("argon2");
  const email = `legacy-ui-${randomUUID()}@example.test`;
  emails.push(email);
  await db.user.create({ data: { email, passwordHash: await hash(password) } });
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Welcome to Treviqo",
  );
  await page.goto("/profile");
  const edit = page.getByRole("region", { name: "Edit personal details" });
  await expect(edit.getByLabel("First name")).toHaveValue("");
  await edit.getByLabel("First name").fill("New name");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  await page.route("**/api/profile", async (route) => {
    saves++;
    await gate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic unavailable" }),
    });
  });
  try {
    await edit.getByRole("button", { name: "Save profile" }).click();
    const saving = edit.getByRole("button", { name: "Saving…" });
    await expect(saving).toBeDisabled();
    await expect.poll(() => saves).toBe(1);
    await saving.evaluate((button: HTMLButtonElement) => button.click());
    expect(saves).toBe(1);
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
  await expect(edit.getByRole("alert")).toHaveText("Synthetic unavailable");
  await expect(edit.getByLabel("First name")).toHaveValue("New name");
  await expect(
    edit.getByRole("button", { name: "Save profile" }),
  ).toBeEnabled();
  await page.unroute("**/api/profile");
  await edit.getByRole("button", { name: "Save profile" }).click();
  await expect(edit.getByRole("status")).toHaveText("Profile saved.");
});
