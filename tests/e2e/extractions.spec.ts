import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const db = new PrismaClient();
const emails: string[] = [];
const origin = "http://127.0.0.1:3100";
const contract = JSON.parse(
  readFileSync("tests/fixtures/intelligence/employment_contract.json", "utf8"),
);
async function account(page: Page) {
  const email = `intelligence-${randomUUID()}@example.test`;
  emails.push(email);
  const password = "Synthetic intelligence test passphrase 7!";
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
async function createDocument(page: Page) {
  await account(page);
  const created = await page.request.post("/api/employments", {
    headers: { origin },
    data: {
      employerName: "Original employer",
      roleTitle: "Worker",
      startDate: "2024-01-01",
    },
  });
  expect(created.status()).toBe(201);
  const employmentId = (await created.json()).employment.id;
  const uploaded = await page.request.post(
    `/api/documents?employmentId=${employmentId}`,
    {
      headers: {
        origin,
        "content-type": "application/pdf",
        "x-file-name": "contract.pdf",
      },
      data: readFileSync("tests/fixtures/intelligence/employment_contract.pdf"),
    },
  );
  expect(uploaded.status()).toBe(201);
  return (await uploaded.json()).document.id as string;
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
for (const width of [320, 375, 430, 768, 1440]) {
  test(`extract and review evidence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const id = await createDocument(page);
    await page.goto(`/documents/${id}`);
    await page
      .getByRole("link", { name: "Extract and review details" })
      .click();
    await expect(
      page.getByRole("heading", { name: "No extracted details yet" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Extract details", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Details are ready", {
      timeout: 20000,
    });
    const employer = page.getByRole("region", {
      name: "Employer",
      exact: true,
    });
    await expect(employer).toContainText("Harbour Workshop Ltd");
    await employer.getByRole("button", { name: "Confirm proposal" }).click();
    await expect(
      employer.getByText("confirmed", { exact: true }),
    ).toBeVisible();
    const role = page.getByRole("region", { name: "Role", exact: true });
    await role.getByLabel("Corrected value").fill("Senior designer");
    await role.getByRole("button", { name: "Save correction" }).click();
    await expect(role.getByText("corrected", { exact: true })).toBeVisible();
    const salary = page.getByRole("region", {
      name: "Salary amount and currency",
      exact: true,
    });
    await salary.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(salary.getByText("rejected", { exact: true })).toBeVisible();
    const leave = page.getByRole("region", {
      name: "Annual leave",
      exact: true,
    });
    await leave.getByRole("button", { name: "Mark unknown" }).click();
    await expect(leave.getByText("unknown", { exact: true })).toBeVisible();
    await page.reload();
    await expect(role.getByLabel("Corrected value")).toHaveValue(
      "Senior designer",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await role.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/extraction-${width}.png` });
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: "Documents", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
}
test("handles model failure, low confidence, malformed output and manual fallback", async ({
  page,
}) => {
  const id = await createDocument(page);
  await page.goto(`/documents/${id}/review`);
  await page
    .getByText("Scanned file or image? Add text from the document", {
      exact: true,
    })
    .click();
  for (const [marker, message] of [
    ["FIXTURE_UNAVAILABLE", "AI is unavailable"],
    ["FIXTURE_MALFORMED", "could not be verified"],
  ]) {
    await page
      .getByLabel("Document text (optional)")
      .fill(`${contract.text}\n${marker}`);
    await page
      .getByRole("button", { name: "Extract details", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: message! }),
    ).toBeVisible();
  }
  await page
    .getByLabel("Document text (optional)")
    .fill(`${contract.text}\nFIXTURE_LOW`);
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  const category = page.getByRole("region", {
    name: "Suggested document category",
    exact: true,
  });
  await expect(category).toContainText("Needs clarification");
  await expect(
    page.getByRole("region", { name: "Employer", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Document type", { exact: true })
    .selectOption("payslip");
  await page.getByRole("button", { name: "Enter details manually" }).click();
  const net = page.getByRole("region", { name: "Net pay", exact: true });
  await expect(
    net.getByRole("button", { name: "Confirm proposal" }),
  ).toBeDisabled();
  await net.getByLabel("Corrected value").fill("NGN 100,000");
  await page.route(`**/api/documents/${id}/extractions`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        json: { error: "Try again shortly." },
      });
    else await route.continue();
  });
  await net.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Try again" }),
  ).toBeVisible();
  await expect(net.getByLabel("Corrected value")).toHaveValue("NGN 100,000");
  await page.unroute(`**/api/documents/${id}/extractions`);
  await net.getByRole("button", { name: "Save correction" }).click();
  await expect(net.getByText("corrected", { exact: true })).toBeVisible();
});
test("protects extraction APIs/pages, cross-origin writes and stale field edits", async ({
  page,
  browser,
  request,
}) => {
  const id = await createDocument(page);
  const url = `/api/documents/${id}/extractions`;
  for (const method of ["GET", "POST", "PATCH"])
    expect(
      (
        await request.fetch(url, {
          method,
          headers: { origin },
          data: { mode: "ai" },
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await page.request.post(url, {
        headers: { origin: "https://other.test" },
        data: { mode: "ai" },
      })
    ).status(),
  ).toBe(403);
  const run = (
    await (
      await page.request.post(url, {
        headers: { origin },
        data: { mode: "manual", type: "payslip" },
      })
    ).json()
  ).extraction;
  const body = {
    fieldId: run.fields[0].id,
    version: 0,
    action: "correct",
    value: "10",
  };
  expect(
    (
      await page.request.patch(url, { headers: { origin }, data: body })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch(url, { headers: { origin }, data: body })
    ).status(),
  ).toBe(409);
  const other = await browser.newContext({ baseURL: origin });
  try {
    const otherPage = await other.newPage();
    await account(otherPage);
    expect((await other.request.get(url)).status()).toBe(404);
    expect(
      (
        await other.request.post(url, {
          headers: { origin },
          data: { mode: "ai" },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await other.request.patch(url, { headers: { origin }, data: body })
      ).status(),
    ).toBe(404);
    await otherPage.goto(`/documents/${id}/review`);
    await expect(
      otherPage.getByRole("heading", { name: "Document not found" }),
    ).toBeVisible();
  } finally {
    await other.close();
  }
});

test("review actions show local feedback, block repeated clicks, recover, and hide technical metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  const id = await createDocument(page);
  await page.goto(`/documents/${id}/review`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let starts = 0;
  await page.route(`**/api/documents/${id}/extractions`, async (route) => {
    if (route.request().method() === "POST") {
      starts++;
      await gate;
    }
    await route.continue();
  });
  const extract = page.getByRole("button", {
    name: "Extract details",
    exact: true,
  });
  try {
    await extract.click();
    await expect(extract).toHaveAttribute("aria-busy", "true");
    await expect(extract).toBeDisabled();
    await extract.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    expect(starts).toBe(1);
    await expect(page.getByRole("status")).toContainText(
      "Processing your document",
    );
  } finally {
    release();
  }
  await expect(page.getByRole("status")).toContainText("Details are ready", {
    timeout: 20000,
  });
  await page.unroute(`**/api/documents/${id}/extractions`);
  await expect(
    page.getByText("Source and extraction record", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText("Prompt:");
  await expect(page.getByRole("main")).not.toContainText("Schema:");
  const employer = page.getByRole("region", { name: "Employer", exact: true });
  await expect(
    employer.getByText("Source excerpt", { exact: true }),
  ).toBeVisible();
  let finish!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let saves = 0;
  await page.route(`**/api/documents/${id}/extractions`, async (route) => {
    saves++;
    await saveGate;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Review unavailable. Please retry." }),
    });
  });
  const confirm = employer.getByRole("button", { name: "Confirm proposal" });
  try {
    await confirm.click();
    await expect(confirm).toHaveAttribute("aria-busy", "true");
    await expect(confirm).toBeDisabled();
    await confirm.evaluate((button: HTMLButtonElement) => button.click());
    expect(saves).toBe(1);
    await page.screenshot({
      path: "test-results/review-button-pending-320.png",
    });
  } finally {
    finish();
  }
  await expect(
    page.getByRole("alert").filter({ hasText: "Review unavailable" }),
  ).toBeVisible();
  await expect(confirm).toBeEnabled();
  await page.unroute(`**/api/documents/${id}/extractions`);
  await confirm.click();
  await expect(employer.getByText("confirmed", { exact: true })).toBeVisible();
});

for (const width of [320, 1440]) {
  test(`partial extraction and ambiguous classification retain manual fallback at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const id = await createDocument(page);
    const response = await page.request.post(
      `/api/documents/${id}/extractions`,
      {
        headers: { origin },
        data: { mode: "ai", text: `${contract.text}\nFIXTURE_PARTIAL` },
      },
    );
    expect(response.status()).toBe(200);
    expect((await response.json()).extraction).toMatchObject({
      status: "ready",
      errorCode: "partial",
    });
    await page.goto(`/documents/${id}/review`);
    await expect(
      page.getByText("Some suggestions could not be verified", {
        exact: false,
      }),
    ).toBeVisible();
    const employer = page.getByRole("region", {
      name: "Employer",
      exact: true,
    });
    await expect(employer).toContainText("Harbour Workshop Ltd");
    await expect(
      employer.getByRole("button", { name: "Confirm proposal" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.request.post(`/api/documents/${id}/extractions`, {
      headers: { origin },
      data: {
        mode: "ai",
        text: `${contract.text}\nFIXTURE_CLASSIFICATION_INVALID`,
      },
    });
    await page.reload();
    await expect(
      page.getByText("Choose the correct supported document type above", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Document type", { exact: true })
      .selectOption("payslip");
    await page.getByRole("button", { name: "Enter details manually" }).click();
    await expect(
      page.getByRole("region", { name: "Net pay", exact: true }),
    ).toBeVisible();
  });
}
