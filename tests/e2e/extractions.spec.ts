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
    await expect(
      employer.getByRole("button", { name: "Save correction" }),
    ).toBeDisabled();
    await employer.getByRole("button", { name: "Confirm proposal" }).click();
    await expect(
      employer.getByText("confirmed", { exact: true }),
    ).toBeVisible();
    const confirm = employer.getByRole("button", { name: "Confirm proposal" });
    const correction = employer.getByRole("button", {
      name: "Save correction",
    });
    const edit = employer.getByLabel("Corrected value");
    await expect(confirm).toBeDisabled();
    await expect(correction).toBeDisabled();
    await edit.fill("Harbour Workshop Ltd ");
    await expect(correction).toBeDisabled();
    await edit.fill("Updated employer");
    await expect(correction).toBeEnabled();
    await expect(confirm).toBeDisabled();
    await edit.fill("Harbour Workshop Ltd");
    await expect(correction).toBeDisabled();
    await edit.fill("");
    await expect(correction).toBeDisabled();
    await edit.fill("Updated employer");
    await correction.click();
    await expect(
      employer.getByText("corrected", { exact: true }),
    ).toBeVisible();
    await expect(correction).toBeDisabled();
    await expect(confirm).toBeDisabled();
    const role = page.getByRole("region", { name: "Role", exact: true });
    await role.getByLabel("Corrected value").fill("Senior designer");
    await expect(
      role.getByRole("button", { name: "Confirm proposal" }),
    ).toBeDisabled();
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
    await expect(correction).toBeDisabled();
    await expect(confirm).toBeDisabled();
    await expect(edit).toHaveValue("Updated employer");
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
    ["FIXTURE_MALFORMED", "could not verify enough reliable details"],
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
  await expect(
    net.getByRole("button", { name: "Save correction" }),
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
  await expect(
    net.getByRole("button", { name: "Save correction" }),
  ).toBeEnabled();
  await page.unroute(`**/api/documents/${id}/extractions`);
  await net.getByRole("button", { name: "Save correction" }).click();
  await expect(net.getByText("corrected", { exact: true })).toBeVisible();
  await expect(
    net.getByRole("button", { name: "Save correction" }),
  ).toBeDisabled();
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
      "This may take up to 90 seconds",
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
      page.getByRole("heading", { name: "Some details were extracted" }),
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

for (const width of [320, 375, 430, 1440]) {
  test(`attempt history stays secondary and a retry replaces stale failure at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    const id = await createDocument(page);
    const url = `/api/documents/${id}/extractions`;
    await page.request.post(url, {
      headers: { origin },
      data: { mode: "manual", type: "payslip" },
    });
    for (let i = 0; i < 2; i++) {
      const failed = await page.request.post(url, {
        headers: { origin },
        data: {
          mode: "ai",
          type: "employment_contract",
          text: `${contract.text}\nFIXTURE_MALFORMED`,
        },
      });
      expect((await failed.json()).extraction.status).toBe("failed");
    }
    await page.goto(`/documents/${id}/review`);
    const current = page.getByRole("region", {
      name: "Current attempt",
      exact: true,
    });
    const history = page.getByRole("region", { name: "Attempt history" });
    await expect(current).toHaveCount(0);
    await expect(
      page.getByText("Current attempt · Failed", { exact: false }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Extraction failed" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Ready for a new attempt" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh review" }),
    ).toHaveCount(0);
    const disclosure = history.locator("details");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(history.getByRole("button", { name: /^Failed/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByLabel("Review attempt", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByText("Scanned file or image? Add text from the document", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Document text (optional)")
      .fill(`${contract.text}\nFIXTURE_SALVAGE`);
    await page
      .getByLabel("Document type", { exact: true })
      .selectOption("employment_contract");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let starts = 0;
    await page.route(`**${url}`, async (route) => {
      if (route.request().method() === "POST") {
        starts++;
        await gate;
      }
      await route.continue();
    });
    try {
      await page
        .getByRole("button", { name: "Extract details", exact: true })
        .click();
      await expect(
        current.getByRole("heading", { name: "Extracting details…" }),
      ).toBeVisible();
      await expect(current).toContainText("This may take up to 90 seconds");
      await expect(
        page.getByRole("heading", { name: "Extraction failed" }),
      ).toHaveCount(0);
      await expect(disclosure).not.toHaveAttribute("open", "");
      await expect(
        page.getByRole("button", { name: "Extract details", exact: true }),
      ).toBeDisabled();
      expect(starts).toBe(1);
      await page.screenshot({
        path: `test-results/extraction-retry-${width}.png`,
      });
    } finally {
      release();
    }
    await expect(
      current.getByRole("heading", { name: "Some details were extracted" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Employer", exact: true }),
    ).toContainText("Harbour Workshop Ltd");
    expect(starts).toBe(1);
    await page.unroute(`**${url}`);
    await history.getByText("View previous attempts", { exact: true }).click();
    await expect(history.getByRole("button", { name: /^Failed/ })).toHaveCount(
      2,
    );
    await history
      .getByRole("button", { name: /^Failed/ })
      .first()
      .click();
    const previous = page.getByRole("region", {
      name: "Previous attempt",
      exact: true,
    });
    await expect(
      previous.getByRole("heading", { name: "Extraction failed" }),
    ).toBeVisible();
    await expect(history).not.toContainText("Current attempt");
    await history.getByRole("button", { name: "Back to latest" }).click();
    await expect(
      current.getByRole("heading", { name: "Some details were extracted" }),
    ).toBeVisible();
    await history
      .getByRole("button", { name: /^Ready for review/ })
      .last()
      .click();
    await expect(previous).toContainText("Details entered manually");
    await expect(
      page.getByRole("region", { name: "Net pay", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/extraction-history-${width}.png`,
    });
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Latest result", exact: true })
        .getByRole("heading", { name: "Some details were extracted" }),
    ).toBeVisible();
    await expect(disclosure).not.toHaveAttribute("open", "");
  });
}

test("an uncertain retry outcome does not restore the previous failure as the new attempt", async ({
  page,
}) => {
  const id = await createDocument(page);
  const url = `/api/documents/${id}/extractions`;
  await page.request.post(url, {
    headers: { origin },
    data: {
      mode: "ai",
      type: "employment_contract",
      text: `${contract.text}\nFIXTURE_MALFORMED`,
    },
  });
  await page.goto(`/documents/${id}/review`);
  await page.route(`**${url}`, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Extraction is temporarily unavailable.",
          }),
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check the latest attempt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Extraction failed" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("View previous attempts", { exact: true }),
  ).toBeVisible();
  await page.getByText("View previous attempts", { exact: true }).click();
  await page
    .getByRole("region", { name: "Attempt history" })
    .getByRole("button", { name: /^Failed/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Previous attempt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Check the latest attempt" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to latest" }).click();
  await expect(
    page.getByRole("heading", { name: "Check the latest attempt" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Refresh review" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for a new attempt" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Extraction failed" }),
  ).toHaveCount(0);
  await page.unroute(`**${url}`);
  await page
    .getByLabel("Document type", { exact: true })
    .selectOption("payslip");
  await page.getByRole("button", { name: "Enter details manually" }).click();
  await expect(
    page.getByRole("region", { name: "Net pay", exact: true }),
  ).toBeVisible();
});

test("history loading is separate, cached, and cannot overwrite a new failed result", async ({
  page,
}) => {
  const id = await createDocument(page);
  const url = `/api/documents/${id}/extractions`;
  const failures: string[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post(url, {
      headers: { origin },
      data: {
        mode: "ai",
        type: "employment_contract",
        text: `${contract.text}\nFIXTURE_MALFORMED`,
      },
    });
    failures.push((await response.json()).extraction.id);
  }
  await page.goto(`/documents/${id}/review`);
  await page.getByText("View previous attempts", { exact: true }).click();
  const history = page.getByRole("region", { name: "Attempt history" });
  const older = history.getByRole("button", { name: /^Failed/ }).last();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route(`**${url}?runId=${failures[0]}`, async (route) => {
    reads++;
    await gate;
    await route.continue();
  });
  try {
    await older.click();
    await expect(page.getByRole("status")).toHaveText(
      "Loading previous attempt…",
    );
    await expect(
      page.getByRole("heading", { name: "Extracting details…" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Extract details", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Enter details manually" }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Document type", { exact: true }),
    ).toBeEnabled();
  } finally {
    release();
  }
  const previous = page.getByRole("region", {
    name: "Previous attempt",
    exact: true,
  });
  await expect(
    previous.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh review" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to latest" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for a new attempt" }),
  ).toBeVisible();
  await older.click();
  await expect(
    previous.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  expect(reads).toBe(1);
  await page.getByRole("button", { name: "Back to latest" }).click();
  await page
    .getByText("Scanned file or image? Add text from the document", {
      exact: true,
    })
    .click();
  await page
    .getByLabel("Document type", { exact: true })
    .selectOption("employment_contract");
  await page
    .getByLabel("Document text (optional)")
    .fill(`${contract.text}\nFIXTURE_MALFORMED`);
  let finish!: () => void;
  const starting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route(`**${url}`, async (route) => {
    if (route.request().method() === "POST") await starting;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", { name: "Extract details", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Extracting details…" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Extraction failed" }),
    ).toHaveCount(0);
  } finally {
    finish();
  }
  const active = page.getByRole("region", {
    name: "Current attempt",
    exact: true,
  });
  await expect(
    active.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  await history.getByText("View previous attempts", { exact: true }).click();
  await older.click();
  await expect(
    previous.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to latest" }).click();
  await expect(
    active.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Extraction failed" }),
  ).toHaveCount(0);
});

test("a late history response cannot replace manual entry started while it loads", async ({
  page,
}) => {
  const id = await createDocument(page);
  const url = `/api/documents/${id}/extractions`;
  const old = await page.request.post(url, {
    headers: { origin },
    data: { mode: "manual", type: "termination_letter" },
  });
  const oldId = (await old.json()).extraction.id;
  await page.request.post(url, {
    headers: { origin },
    data: { mode: "manual", type: "payslip" },
  });
  await page.goto(`/documents/${id}/review`);
  await page.getByText("View previous attempts", { exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${url}?runId=${oldId}`, async (route) => {
    await gate;
    await route.continue();
  });
  const response = page.waitForResponse((r) =>
    r.url().includes(`runId=${oldId}`),
  );
  try {
    await page
      .getByRole("region", { name: "Attempt history" })
      .getByRole("button", { name: /^Ready for review/ })
      .last()
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Loading previous attempt…",
    );
    await page
      .getByLabel("Document type", { exact: true })
      .selectOption("employment_contract");
    await page.getByRole("button", { name: "Enter details manually" }).click();
    await expect(
      page.getByRole("region", { name: "Employer", exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await response;
  await expect(
    page.getByRole("region", { name: "Previous attempt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Employer", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Effective date", exact: true }),
  ).toHaveCount(0);
});

test("an already-processing attempt can be refreshed without presenting old failures as active", async ({
  page,
}) => {
  const id = await createDocument(page);
  const doc = await db.employmentDocument.findUniqueOrThrow({ where: { id } });
  const run = await db.documentExtraction.create({
    data: {
      documentId: id,
      userId: doc.userId,
      sourceKind: "pdf_text",
      model: "fixture",
      promptVersion: "fixture",
      schemaVersion: "fixture",
    },
  });
  await page.goto(`/documents/${id}/review`);
  const active = page.getByRole("region", {
    name: "Current attempt",
    exact: true,
  });
  await expect(
    active.getByRole("heading", { name: "Extracting details…" }),
  ).toBeVisible();
  await db.documentExtraction.update({
    where: { id: run.id },
    data: { status: "failed", errorCode: "malformed" },
  });
  await page.getByRole("button", { name: "Refresh review" }).click();
  await expect(
    active.getByRole("heading", { name: "Extraction failed" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Extraction failed" }),
  ).toHaveCount(0);
});

test("saving an older manual review updates its cache without replacing the latest context", async ({
  page,
}) => {
  const id = await createDocument(page);
  const url = `/api/documents/${id}/extractions`;
  const old = await page.request.post(url, {
    headers: { origin },
    data: { mode: "manual", type: "termination_letter" },
  });
  const oldId = (await old.json()).extraction.id;
  await page.request.post(url, {
    headers: { origin },
    data: { mode: "manual", type: "payslip" },
  });
  await page.goto(`/documents/${id}/review`);
  let reads = 0;
  page.on("request", (request) => {
    if (request.url().includes(`runId=${oldId}`)) reads++;
  });
  await page.getByText("View previous attempts", { exact: true }).click();
  const entry = page
    .getByRole("region", { name: "Attempt history" })
    .getByRole("button", { name: /^Ready for review/ })
    .last();
  await entry.click();
  const field = page.getByRole("region", {
    name: "Effective date",
    exact: true,
  });
  await field.getByLabel("Corrected value").fill("8 October 2026");
  await field.getByRole("button", { name: "Save correction" }).click();
  await expect(field.getByText("corrected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Previous attempt", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to latest" }).click();
  await expect(
    page.getByRole("region", { name: "Latest result", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Net pay", exact: true }),
  ).toBeVisible();
  await entry.click();
  await expect(field.getByLabel("Corrected value")).toHaveValue(
    "8 October 2026",
  );
  expect(reads).toBe(1);
});

test("category confirmation and correction follow the same edit rules", async ({
  page,
}) => {
  const id = await createDocument(page);
  await page.goto(`/documents/${id}/review`);
  await page
    .getByRole("button", { name: "Extract details", exact: true })
    .click();
  const category = page.getByRole("region", {
    name: "Suggested document category",
    exact: true,
  });
  const confirm = category.getByRole("button", { name: "Confirm proposal" });
  const save = category.getByRole("button", { name: "Save correction" });
  const select = category.getByLabel("Correct category");
  await expect(confirm).toBeEnabled();
  await expect(save).toBeDisabled();
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await select.selectOption("payslip");
  await expect(save).toBeEnabled();
  await expect(confirm).toBeDisabled();
  await select.selectOption("employment_contract");
  await expect(save).toBeDisabled();
  await select.selectOption("payslip");
  await save.click();
  await expect(category.getByText("corrected", { exact: true })).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(confirm).toBeDisabled();
  // Explicitly reversing a rejected/unknown decision remains possible.
  await category.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(category.getByText("rejected", { exact: true })).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(category.getByText("confirmed", { exact: true })).toBeVisible();
});
