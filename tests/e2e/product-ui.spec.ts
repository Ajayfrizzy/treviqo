import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkResponsiveActions } from "../helpers/responsive-actions";

const db = new PrismaClient();
const origin = "http://127.0.0.1:3100";
const email = `product-ui-${randomUUID()}@example.test`;
let page: Page;
let activeId: string;
let closedId: string;
let exitId: string;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto("/register");
  await page.getByLabel("First name", { exact: true }).fill("Amina");
  await page.getByLabel("Last name", { exact: true }).fill("Bello");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic UI fixture 7!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL("/home");
  for (const closed of [false, true]) {
    const response = await page.request.post("/api/employments", {
      headers: { origin },
      data: {
        employerName: closed
          ? "Harbour Workshop Ltd"
          : "Northbridge Systems Nigeria Ltd",
        roleTitle: closed ? "Product Designer" : "Frontend Engineer",
        startDate: "2020-02-01",
        ...(closed ? { status: "closed", endDate: "2024-09-30" } : {}),
      },
    });
    expect(response.status()).toBe(201);
    const id = (await response.json()).employment.id;
    if (closed) closedId = id;
    else activeId = id;
    const created = await page.request.post("/api/exits", {
      headers: { origin },
      data: {
        employmentId: id,
        answers: {
          exitType: "resignation",
          lastWorkingDate: "2024-09-30",
          noticeDate: "2024-09-01",
          noticeApplicable: "no",
          leave: "pending",
          reimbursements: "none",
          pension: "yes",
          assets: "scheduled",
        },
      },
    });
    expect(created.status()).toBe(201);
    if (!closed) exitId = (await created.json()).exitCase.id;
  }
  for (const type of [
    "employment_contract",
    "payslip",
    "resignation_letter",
    "termination_letter",
    "exit_letter",
    "final_settlement",
    "pension_statement",
    "benefit_document",
  ]) {
    const response = await page.request.post(
      `/api/documents?employmentId=${activeId}&documentType=${type}`,
      {
        headers: {
          origin,
          "content-type": "application/pdf",
          "x-file-name": `${type}.pdf`,
        },
        data: readFileSync(`tests/fixtures/intelligence/${type}.pdf`),
      },
    );
    expect(response.status()).toBe(201);
  }
  // Existing worker fixture path, isolated to the disposable browser-test database.
  await db.backgroundJob.updateMany({ data: { dueAt: new Date(0) } });
  for (let n = 0; n < 3; n++)
    execFileSync(
      process.execPath,
      ["--conditions=react-server", "dist-worker/worker/main.js", "--once"],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          APP_URL: origin,
          NEXTAUTH_URL: origin,
        },
        stdio: "pipe",
      },
    );
});
test.afterAll(async () => {
  await page?.close();
  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    await db.auditEvent.deleteMany({ where: { userId: user.id } });
    await db.employmentDocument.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});
for (const width of [320, 375, 430, 768, 1024, 1280, 1440]) {
  test(`semantic product screens fit and remain usable at ${width}px`, async () => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    for (const [name, url] of [
      ["home", "/home"],
      ["exit-list", "/exit"],
      ["wizard", `/exit/${exitId}/edit`],
      ["checklist", `/exit/${exitId}`],
      ["reminders", "/reminders"],
      ["passport-list", "/passport"],
      ["passport-detail", `/passport/${closedId}`],
      ["documents", "/documents"],
      ["profile", "/profile"],
    ]) {
      await page.goto(url!);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const nav = page.getByRole("navigation", { name: "Primary" });
      await expect(nav.getByRole("link")).toHaveCount(width < 600 ? 4 : 6);
      for (const link of await nav.getByRole("link").all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(48);
      }
      if (name === "home")
        await expect(page.locator(".dashboard-card")).toHaveCount(4);
      if (name === "reminders") {
        await expect(
          nav.getByRole("link", { name: "Reminders", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(
          nav.getByRole("link", { name: "Home", exact: true }),
        ).not.toHaveAttribute("aria-current", "page");
        await expect(page.locator(".reminder-card").first()).toBeVisible();
      }
      if (name === "wizard") {
        await expect(
          page.locator('.step-progress [aria-current="step"]'),
        ).toContainText("Exit details");
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(
          page.locator('.step-progress [aria-current="step"]'),
        ).toContainText("Notice");
      }
      if (name === "checklist")
        await expect(page.getByRole("progressbar")).toBeVisible();
      await checkResponsiveActions(page);
      await page.screenshot({
        path: `test-results/product-${name}-${width}.png`,
        fullPage: true,
      });
      if (name === "passport-detail") {
        const benefit = page.getByRole("article", { name: "HMO", exact: true });
        await expect(benefit.locator(".benefit-basis")).toBeVisible();
        await expect(benefit.locator(".benefit-basis")).toContainText(
          "does not establish coverage or portability",
        );
        await benefit
          .getByRole("button", { name: "Assess benefit", exact: true })
          .click();
        await expect(benefit.getByLabel("Supporting document")).toBeVisible();
        await checkResponsiveActions(page);
        await page.screenshot({
          path: `test-results/product-benefit-form-${width}.png`,
          fullPage: true,
        });
        await benefit
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/home");
    await expect(page.locator(".dashboard-card").first()).toBeVisible();
    expect(
      await page
        .locator(".dashboard-card")
        .first()
        .evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  });
}
