import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
const emails: string[] = [];
async function account(page: Page) {
  const email = `employment-${randomUUID()}@example.test`; emails.push(email);
  const password = "Synthetic employment test password";
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Create account", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Your account is ready");
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in securely" }).click(); await expect(page).toHaveURL("/");
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function create(page: Page) {
  await page.getByRole("link", { name: "Add your first employment" }).click();
  await page.getByLabel("Employer name").fill("Treviqo Fixture Company"); await page.getByLabel("Role or title").fill("Product designer"); await page.getByLabel("Start date", { exact: true }).fill("2024-02-29");
  await noOverflow(page); await page.getByRole("button", { name: "Save employment" }).click(); await expect(page.getByRole("status")).toHaveText("Employment added.");
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
test.afterAll(async () => { await db.auditEvent.deleteMany({ where: { user: { email: { in: emails } } } }); await db.user.deleteMany({ where: { email: { in: emails } } }); await db.$disconnect(); });
for (const width of [320, 375, 430, 1280]) {
  test(`employment creation, editing and history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 }); await account(page); await noOverflow(page);
    await expect(page.getByRole("heading", { name: "No active exit process" })).toBeVisible();
    const id = await create(page); await noOverflow(page);
    await page.getByRole("link", { name: "Edit employment", exact: true }).click();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Home", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByLabel("Role or title").fill("Senior designer"); await page.getByLabel("Employment status").selectOption("closed"); await page.getByLabel("End date", { exact: false }).fill("2025-03-01"); await noOverflow(page);
    await page.getByRole("button", { name: "Save employment" }).click(); await expect(page.getByRole("status")).toHaveText("Employment updated.");
    await page.getByRole("navigation").getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.getByRole("region", { name: "Previous employment" })).toContainText("Senior designer"); await expect(page.getByText("No current employment recorded.", { exact: false })).toBeVisible(); await noOverflow(page);
    await page.screenshot({ path: `test-results/employments-${width}.png`, fullPage: true });
    await page.goto(`/employments/${id}/edit`); await page.getByLabel("Role or title").fill("Unsaved change"); await page.getByRole("link", { name: "Cancel", exact: true }).click(); await expect(page.getByRole("heading", { level: 1 })).toHaveText("Senior designer");
  });
}
test("retains form input after validation and server failure, then retries", async ({ page }) => {
  await account(page); await create(page); await page.getByRole("link", { name: "Edit employment", exact: true }).click();
  await page.getByLabel("Employment status").selectOption("closed"); await page.getByLabel("End date", { exact: false }).fill("2020-01-01"); await page.getByRole("button", { name: "Save employment" }).click();
  await expect(page.getByText("End date cannot be before the start date.")).toBeVisible();
  await page.getByLabel("End date", { exact: false }).fill("2025-01-01");
  await page.route("**/api/employments/*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Employment records are temporarily unavailable. Please try again." }) }));
  await page.getByRole("button", { name: "Save employment" }).click(); await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible(); await expect(page.getByLabel("Role or title")).toHaveValue("Product designer");
  await page.unroute("**/api/employments/*"); await page.getByRole("button", { name: "Save employment" }).click(); await expect(page.getByRole("status")).toHaveText("Employment updated.");
});
test("enforces ownership at API and page boundaries", async ({ page, context, browser }) => {
  await account(page); const id = await create(page);
  const details = { employerName: "Attack", roleTitle: "Changed", startDate: "2024-01-01" };
  const second: BrowserContext = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const otherPage = await second.newPage(); await account(otherPage);
    expect((await second.request.get(`/api/employments/${id}`)).status()).toBe(404);
    expect((await second.request.get("/api/employments")).status()).toBe(200);
    expect((await (await second.request.get("/api/employments")).json()).employments).toEqual([]);
    expect((await second.request.put(`/api/employments/${id}`, { headers: { origin: "http://127.0.0.1:3100" }, data: details })).status()).toBe(404);
    await otherPage.goto(`/employments/${id}/edit`); await expect(otherPage.getByRole("heading", { name: "Employment record not found" })).toBeVisible(); await expect(otherPage.getByText("Treviqo Fixture Company")).toHaveCount(0);
    expect((await context.request.put(`/api/employments/${id}`, { headers: { origin: "http://127.0.0.1:3100" }, data: { ...details, userId: "other" } })).status()).toBe(422);
    expect((await context.request.put(`/api/employments/${id}`, { headers: { origin: "https://attacker.test" }, data: details })).status()).toBe(403);
    const record = (await (await context.request.get(`/api/employments/${id}`)).json()).employment; expect(record.roleTitle).toBe("Product designer"); expect(record).not.toHaveProperty("userId");
  } finally { await second.close(); }
});
test("employment pages and APIs reject unauthenticated access", async ({ page, request }) => {
  for (const path of ["/employments/new", "/employments/missing", "/employments/missing/edit"]) { await page.goto(path); await expect(page).toHaveURL(/\/sign-in$/); }
  expect((await request.get("/api/employments")).status()).toBe(401);
  expect((await request.post("/api/employments", { data: {} })).status()).toBe(401);
  expect((await request.put("/api/employments/missing", { data: {} })).status()).toBe(401);
});
