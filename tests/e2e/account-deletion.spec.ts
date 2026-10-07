import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const db = new PrismaClient(),
  emails: string[] = [];
const origin = "http://127.0.0.1:3100",
  password = "Synthetic deletion password 7!";
async function account(page: Page) {
  const email = `delete-browser-${randomUUID()}@example.test`;
  emails.push(email);
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
  const created = await page.request.post("/api/employments", {
    headers: { origin },
    data: {
      employerName: "Synthetic employer",
      roleTitle: "Worker",
      startDate: "2026-01-01",
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
        "x-file-name": "fixture.pdf",
      },
      data: readFileSync("tests/fixtures/document.pdf"),
    },
  );
  expect(uploaded.status()).toBe(201);
  const documentId = (await uploaded.json()).document.id;
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  return { email, userId: user.id, documentId };
}
async function fillConfirmation(page: Page, value = password) {
  await page.getByLabel("Current password", { exact: true }).fill(value);
  await page
    .getByLabel("Type DELETE to confirm permanent deletion")
    .fill("DELETE");
}
test.afterAll(async () => {
  const ids = (
    await db.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    })
  ).map((u) => u.id);
  await db.auditEvent.deleteMany({ where: { userId: { in: ids } } });
  await db.employmentDocument.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
});
for (const width of [320, 375, 430, 1440])
  test(`password-confirmed deletion and session clearing at ${width}px`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const owner = await account(page);
    const copied = await browser.newContext();
    await copied.addCookies(await page.context().cookies());
    const extraSession = await db.authSession.create({
      data: { userId: owner.userId, expiresAt: new Date(Date.now() + 60000) },
    });
    await page.goto("/profile");
    const danger = page.getByRole("region", {
      name: "Delete account",
      exact: true,
    });
    await expect(danger).toContainText("provider backups");
    await expect(danger).toContainText("cannot be undone");
    await danger
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await danger.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveCount(0);
    await danger
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await fillConfirmation(page, "wrong password");
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(danger.getByRole("alert")).toContainText(
      "password could not be verified",
    );
    await expect(
      page.getByLabel("Current password", { exact: true }),
    ).toHaveValue("");
    expect(
      await db.user.findUnique({ where: { id: owner.userId } }),
    ).not.toBeNull();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await fillConfirmation(page);
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in\?account=deleted$/);
    await expect(page.getByRole("status")).toContainText(
      "All sessions have ended",
    );
    expect(
      (await page.context().cookies()).filter((c) =>
        c.name.includes("session-token"),
      ),
    ).toHaveLength(0);
    expect(
      await db.user.findUnique({ where: { id: owner.userId } }),
    ).toBeNull();
    expect(
      await db.authSession.findUnique({ where: { id: extraSession.id } }),
    ).toBeNull();
    expect((await copied.request.get(origin + "/api/me")).status()).toBe(401);
    expect(
      (
        await copied.request.delete(origin + "/api/account", {
          headers: { origin },
          data: { password, confirmation: "DELETE" },
        })
      ).status(),
    ).toBe(401);
    await copied.close();
  });
test("real storage AccessDenied retains account and files with clear retry guidance", async ({
  page,
}) => {
  const owner = await account(page);
  const doc = await db.employmentDocument.findUniqueOrThrow({
    where: { id: owner.documentId },
  });
  const path = "/private/" + doc.objectKey;
  const setDenied = (denied: boolean) =>
    page.request.post("http://127.0.0.1:3197/__test/delete-failure", {
      headers: { authorization: "Bearer fixture-admin" },
      data: { path, denied },
    });
  await setDenied(true);
  try {
    await page.goto("/profile");
    await page
      .getByRole("button", { name: "Delete my account", exact: true })
      .click();
    await fillConfirmation(page);
    await page
      .getByRole("button", { name: "Permanently delete account", exact: true })
      .click();
    await expect(
      page
        .getByRole("region", { name: "Delete account", exact: true })
        .getByRole("alert"),
    ).toContainText("Your account and cleanup records remain");
    expect(
      await db.user.findUnique({ where: { id: owner.userId } }),
    ).not.toBeNull();
    expect((await page.request.get("/api/me")).status()).toBe(200);
    expect(
      (
        await page.request.get("http://127.0.0.1:3197" + path, {
          headers: { authorization: "Bearer fixture" },
        })
      ).status(),
    ).toBe(200);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.screenshot({
      path: "test-results/account-delete-storage-failure-320.png",
      fullPage: true,
    });
    await page.reload();
    await expect(page.getByRole("status")).toContainText("has not finished");
    await setDenied(false);
    await fillConfirmation(page);
    await page
      .getByRole("button", { name: "Continue account deletion", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in\?account=deleted$/);
    expect(
      (
        await page.request.get("http://127.0.0.1:3197" + path, {
          headers: { authorization: "Bearer fixture" },
        })
      ).status(),
    ).toBe(404);
  } finally {
    await setDenied(false);
  }
});
test("rejects cross-origin deletion and target-user injection before cleanup", async ({
  page,
}) => {
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { origin },
        data: { password, confirmation: "DELETE" },
      })
    ).status(),
  ).toBe(401);
  const owner = await account(page);
  const other = await db.user.create({
    data: { email: `delete-other-${randomUUID()}@example.test` },
  });
  emails.push(other.email!);
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { origin },
        data: { password, confirmation: "DELETE", userId: other.id },
      })
    ).status(),
  ).toBe(422);
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { origin: "https://foreign.test" },
        data: { password, confirmation: "DELETE" },
      })
    ).status(),
  ).toBe(403);
  expect(
    await db.user.findUnique({ where: { id: owner.userId } }),
  ).not.toBeNull();
  expect(await db.user.findUnique({ where: { id: other.id } })).not.toBeNull();
});
