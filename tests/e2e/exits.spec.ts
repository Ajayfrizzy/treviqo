import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
const emails: string[] = [];
const origin = "http://127.0.0.1:3100";
async function account(page: Page) {
  const email = `exit-${randomUUID()}@example.test`;
  emails.push(email);
  const password = "Synthetic exit checker passphrase 7!";
  await page.goto("/register");
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
  await expect(page).toHaveURL("/");
}
async function employment(page: Page) {
  const response = await page.request.post("/api/employments", {
    headers: { origin },
    data: {
      employerName: "Exit fixture employer",
      roleTitle: "Designer",
      startDate: "2024-01-01",
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).employment.id as string;
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test.afterAll(async () => {
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const ids = users.map((user) => user.id);
  await db.auditEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
for (const width of [320, 375, 430, 768, 1440])
  test(`mobile exit steps and checklist at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await account(page);
    await employment(page);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Exit", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "No exit cases yet" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Start an exit checklist" }).click();
    await page
      .getByRole("link", { name: "Choose employment", exact: true })
      .click();
    await page
      .getByLabel("How is this employment ending?")
      .selectOption(
        width === 320
          ? "resignation"
          : width === 375
            ? "termination"
            : "retirement",
      );
    await page
      .getByLabel("Planned or actual last working date")
      .fill("2026-10-31");
    await page
      .getByLabel("Notice / decision communicated on (optional)")
      .fill("2026-10-01");
    await fits(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByLabel("Does a notice-period comparison apply?")
      .selectOption("yes");
    await page
      .getByLabel("Notice wording (optional)", { exact: true })
      .fill("30 days");
    await fits(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Unused leave follow-up").selectOption("pending");
    await page.getByLabel("Reimbursement follow-up").selectOption("none");
    await page
      .getByLabel("Did you participate in a pension scheme through this job?")
      .selectOption("yes");
    await fits(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page
      .getByLabel("Company asset return", { exact: true })
      .selectOption("scheduled");
    await page
      .getByLabel("Reference / employment evidence", { exact: true })
      .selectOption("requested");
    await fits(page);
    await page.getByRole("button", { name: "Save and view checklist" }).click();
    await expect(page.getByRole("status")).toContainText("Exit details saved");
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(
      page.getByRole("region", { name: "Notice and dates", exact: true }),
    ).toContainText("Complete");
    await expect(
      page.getByRole("region", { name: "Unused leave", exact: true }),
    ).toContainText("Pending");
    await expect(
      page.getByRole("region", { name: "Pension records", exact: true }),
    ).toContainText("Missing");
    await expect(
      page.getByRole("region", { name: "Reimbursements", exact: true }),
    ).toContainText("Not applicable");
    await expect(
      page.getByRole("region", {
        name: "Employer-linked benefits",
        exact: true,
      }),
    ).toContainText("Needs clarification");
    await fits(page);
    await page
      .getByRole("region", { name: "Notice and dates", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/exit-${width}.png` });
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: "Exit", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.getByRole("link", { name: "Update answers" }).click();
    await page
      .getByLabel("Notice / decision communicated on (optional)")
      .fill("2026-10-02");
    await page.getByRole("button", { name: "Save and view checklist" }).click();
    await expect(
      page.getByRole("region", { name: "Notice and dates", exact: true }),
    ).toContainText("Needs clarification");
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Notice and dates", exact: true }),
    ).toContainText("Needs clarification");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your exit checklists" }),
    ).toBeVisible();
    await page.goto(`/exit/${id}/edit`);
    await page.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(page).toHaveURL(`/exit/${id}`);
  });
test("empty employment, required date, save failure and retry preserve answers", async ({
  page,
}) => {
  await account(page);
  await page.goto("/exit/new");
  await expect(
    page.getByRole("heading", { name: "Add an employment first" }),
  ).toBeVisible();
  const job = await employment(page);
  await page.goto(`/exit/new?employmentId=${job}`);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Check the highlighted details",
  );
  await page
    .getByLabel("Planned or actual last working date")
    .fill("2026-10-31");
  await page.route("**/api/exits", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Temporarily unavailable. Retry." },
    }),
  );
  await page.getByRole("button", { name: "Save and view checklist" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Temporarily unavailable",
  );
  await expect(
    page.getByLabel("Planned or actual last working date"),
  ).toHaveValue("2026-10-31");
  await page.unroute("**/api/exits");
  await page.getByRole("button", { name: "Save and view checklist" }).click();
  await expect(page.getByRole("status")).toContainText("Exit details saved");
});
test("all types, owner isolation, CSRF, validation, duplicate and stale edits", async ({
  page,
  browser,
}) => {
  await account(page);
  let id = "";
  let job = "";
  const answers = { exitType: "resignation", lastWorkingDate: "2026-10-31" };
  for (const exitType of [
    "resignation",
    "termination",
    "redundancy",
    "contract_completion",
    "retirement",
  ]) {
    job = await employment(page);
    const response = await page.request.post("/api/exits", {
      headers: { origin },
      data: { employmentId: job, answers: { ...answers, exitType } },
    });
    expect(response.status()).toBe(201);
    id = (await response.json()).exitCase.id;
  }
  expect(
    (
      await page.request.post("/api/exits", {
        headers: { origin },
        data: { employmentId: job, answers },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.put(`/api/exits/${id}`, {
        headers: { origin: "https://attacker.test" },
        data: { version: 0, answers },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.put(`/api/exits/${id}`, {
        headers: { origin },
        data: { version: 0, answers, userId: "injected" },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.put(`/api/exits/${id}`, {
        headers: { origin },
        data: { version: 0, answers },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.put(`/api/exits/${id}`, {
        headers: { origin },
        data: { version: 0, answers },
      })
    ).status(),
  ).toBe(409);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const otherPage = await other.newPage();
    await account(otherPage);
    expect(
      (await (await other.request.get("/api/exits")).json()).exitCases,
    ).toEqual([]);
    expect((await other.request.get(`/api/exits/${id}`)).status()).toBe(404);
    expect(
      (
        await other.request.put(`/api/exits/${id}`, {
          headers: { origin },
          data: { version: 1, answers },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.get(`/api/exits/evidence?employmentId=${job}`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.post("/api/exits", {
          headers: { origin },
          data: { employmentId: job, answers },
        })
      ).status(),
    ).toBe(404);
    await otherPage.goto(`/exit/${id}/edit`);
    await expect(
      otherPage.getByRole("heading", { name: "Exit case not found" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});
test("exit pages and every API operation require authentication", async ({
  page,
  request,
}) => {
  for (const path of [
    "/exit",
    "/exit/new",
    "/exit/missing",
    "/exit/missing/edit",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in$/);
  }
  for (const path of [
    "/api/exits",
    "/api/exits/missing",
    "/api/exits/evidence?employmentId=missing",
  ])
    expect((await request.get(path)).status()).toBe(401);
  expect((await request.post("/api/exits", { data: {} })).status()).toBe(401);
  expect((await request.put("/api/exits/missing", { data: {} })).status()).toBe(
    401,
  );
});
