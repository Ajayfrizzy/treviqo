import { checkResponsiveActions } from "../helpers/responsive-actions";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const db = new PrismaClient();
const emails: string[] = [];
const origin = "http://127.0.0.1:3100";
async function account(page: Page) {
  const email = `passport-${randomUUID()}@example.test`;
  emails.push(email);
  const password = "Synthetic intelligence test passphrase 7!";
  await page.goto("/register");
  await page.getByLabel("First name", { exact: true }).fill("Fixture");
  await page.getByLabel("Last name", { exact: true }).fill("Worker");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Your account is ready");
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL("/home");
}
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
async function job(page: Page) {
  const input = {
    employerName: "Harbour ID 123456789",
    roleTitle: "Designer",
    startDate: "2024-01-01",
    endDate: "2026-10-31",
    status: "closed",
  };
  const response = await page.request.post("/api/employments", {
    headers: { origin },
    data: input,
  });
  expect(response.status()).toBe(201);
  return { id: (await response.json()).employment.id as string, input };
}
async function source(page: Page, id: string) {
  const upload = await page.request.post(
    `/api/documents?employmentId=${id}&documentType=employment_contract`,
    {
      headers: {
        origin,
        "content-type": "application/pdf",
        "x-file-name": "private-123456789.pdf",
      },
      data: readFileSync("tests/fixtures/intelligence/employment_contract.pdf"),
    },
  );
  expect(upload.status()).toBe(201);
  const doc = (await upload.json()).document.id as string;
  const extraction = await page.request.post(
    `/api/documents/${doc}/extractions`,
    {
      headers: { origin },
      data: { mode: "manual", type: "employment_contract" },
    },
  );
  expect(extraction.status()).toBe(200);
  const run = (await extraction.json()).extraction;
  const field = run.fields.find(
    (field: { key: string }) => field.key === "hmo_reference",
  );
  expect(
    (
      await page.request.patch(`/api/documents/${doc}/extractions`, {
        headers: { origin },
        data: {
          fieldId: field.id,
          version: 0,
          action: "correct",
          value: "Synthetic employer HMO reference",
        },
      })
    ).status(),
  ).toBe(200);
  return { doc, fieldId: field.id };
}
for (const width of [320, 375, 430, 768, 1024, 1280, 1440])
  test(`Passport timeline and benefit assessment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await account(page);
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { name: "No closed employments yet" }),
    ).toBeVisible();
    const employment = await job(page);
    const evidence = await source(page, employment.id);
    await page.reload();
    await expect(
      page.getByRole("list", { name: "Closed employment history" }),
    ).toContainText("Harbour ID [hidden]");
    await page.getByRole("link", { name: "View Passport entry" }).click();
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: "Passport", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("region", { name: "Employment summary" }),
    ).toContainText("Worker-entered");
    await expect(
      page.getByRole("region", { name: "Pension summary" }),
    ).toContainText("Unknown");
    const hmo = page.getByRole("article", { name: "HMO", exact: true });
    await expect(hmo).toContainText("Unknown / needs confirmation");
    await expect(hmo).toContainText("Confirmed/corrected benefit wording");
    await hmo
      .getByRole("button", { name: "Assess benefit", exact: true })
      .click();
    await hmo
      .getByLabel("Your portability assessment")
      .selectOption("employer_linked");
    await hmo.getByLabel("Supporting document").selectOption(evidence.doc);
    await hmo
      .getByLabel("Reviewed field (optional)")
      .selectOption(evidence.fieldId);
    await hmo
      .getByLabel("I checked the evidence and it supports this assessment.")
      .check();
    if (width === 320) {
      await page.route(`**/api/passport/${employment.id}`, (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Temporary failure. Retry." },
        }),
      );
      await hmo.getByRole("button", { name: "Save assessment" }).click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Temporary failure",
      );
      await expect(hmo.getByLabel("Your portability assessment")).toHaveValue(
        "employer_linked",
      );
      await page.unroute(`**/api/passport/${employment.id}`);
    }
    await hmo.getByRole("button", { name: "Save assessment" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Benefit assessment saved",
    );
    await expect(hmo).toContainText("Employer-linked");
    await page.reload();
    await expect(hmo).toContainText("Worker assessment");
    await hmo.getByRole("button", { name: "Review assessment" }).click();
    await hmo
      .getByLabel("Your portability assessment")
      .selectOption("portable");
    await hmo.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(hmo.getByLabel("Your portability assessment")).toHaveCount(0);
    await expect(hmo).toContainText("Employer-linked");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await hmo.scrollIntoViewIfNeeded();
    await checkResponsiveActions(page);
    await page.screenshot({ path: `test-results/passport-${width}.png` });
    const response = await page.request.get(`/api/passport/${employment.id}`);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const json = await response.text();
    expect(json).not.toContain("123456789");
    expect(json).not.toContain("Synthetic employer HMO reference");
    expect(
      (
        await page.request.delete(`/api/documents/${evidence.doc}`, {
          headers: { origin },
        })
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "Refresh Passport" }).click();
    await expect(hmo).toContainText("no longer current");
    await expect(hmo).toContainText("Unknown / needs confirmation");
    expect(
      (
        await page.request.put(`/api/employments/${employment.id}`, {
          headers: { origin },
          data: { ...employment.input, status: "active", endDate: null },
        })
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "Refresh Passport" }).click();
    await expect(
      page.getByRole("heading", { name: "Passport entry no longer available" }),
    ).toBeVisible();
    await page.goto("/passport");
    await expect(
      page.getByRole("heading", { name: "No closed employments yet" }),
    ).toBeVisible();
  });
test("Passport API/page ownership, anonymous, Origin and input boundaries", async ({
  page,
  browser,
  request,
}) => {
  await account(page);
  const employment = await job(page);
  const url = `/api/passport/${employment.id}`;
  const dto = await (await page.request.get(url)).json();
  const input = {
    category: "pension",
    classification: "unknown",
    version: null,
    contextToken: dto.contextToken,
    documentId: null,
    fieldId: null,
    fieldVersion: null,
    evidenceAcknowledged: false,
  };
  expect((await request.get("/api/passport")).status()).toBe(401);
  expect((await request.get(url)).status()).toBe(401);
  expect(
    (await request.post(url, { data: { action: "save", input } })).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post(url, {
        headers: { origin: "https://other.test" },
        data: { action: "save", input },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(url, {
        headers: { origin },
        data: { action: "save", input: { ...input, userId: "other" } },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.post(url, {
        headers: { origin },
        data: { extra: "x".repeat(5000) },
      })
    ).status(),
  ).toBe(400);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const p = await other.newPage();
    await p.goto(`/passport/${employment.id}`);
    await expect(p).toHaveURL(/\/sign-in$/);
    await account(p);
    expect((await other.request.get(url)).status()).toBe(404);
    expect(
      (
        await other.request.post(url, {
          headers: { origin },
          data: { action: "save", input },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post(url, {
          headers: { origin },
          data: { action: "remove", category: "pension", version: 0 },
        })
      ).status(),
    ).toBe(404);
    await p.goto(`/passport/${employment.id}`);
    await expect(
      p.getByRole("heading", { name: "Passport entry not found" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
