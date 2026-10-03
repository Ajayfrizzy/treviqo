import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const db = new PrismaClient(); const emails: string[] = [];
const pdf = readFileSync("tests/fixtures/document.pdf");
async function account(page: Page) {
  const email = `vault-${randomUUID()}@example.test`; emails.push(email); const password = "Synthetic vault test passphrase";
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Create account", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Your account is ready");
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByRole("button", { name: "Sign in securely" }).click(); await expect(page).toHaveURL("/");
  const response = await page.request.post("/api/employments", { headers: { origin: "http://127.0.0.1:3100" }, data: { employerName: "Vault fixture", roleTitle: "Designer", startDate: "2024-01-01" } });
  expect(response.status()).toBe(201); return (await response.json()).employment.id as string;
}
async function upload(page: Page) {
  await page.goto("/documents"); await page.getByRole("link", { name: "Upload document", exact: true }).click();
  await page.getByLabel("Document category").selectOption("employment_contract"); await page.getByLabel("Choose a file").setInputFiles({ name: "My contract.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.getByRole("button", { name: "Upload document", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Document uploaded." })).toBeVisible();
  return new URL(page.url()).pathname.split("/").at(-1)!;
}
test.afterAll(async () => { const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } }); const ids = users.map(user => user.id); await db.auditEvent.deleteMany({ where: { userId: { in: ids } } }); await db.employmentDocument.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); });
for (const width of [320,375,430]) {
  test(`private vault upload/view/delete at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 }); const employmentId = await account(page); const id = await upload(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Documents", exact: true })).toHaveAttribute("aria-current", "page");
    await page.screenshot({ path: `test-results/vault-${width}.png`, fullPage: true });
    await page.goto("/documents"); await page.getByLabel("Filter by employment").selectOption(employmentId); await page.getByRole("button", { name: "Apply filter" }).click(); await page.getByRole("link", { name: "My-contract.pdf" }).click();
    await page.getByRole("button", { name: "Open / download" }).click();
    const link = page.getByRole("link", { name: "Download document", exact: true }); await expect(link).toBeVisible(); const url = (await link.getAttribute("href"))!;
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("60");
    const fetched = await page.request.get(url); expect(fetched.status()).toBe(200); expect(await fetched.body()).toEqual(pdf); expect(fetched.headers()["content-disposition"]).toContain("attachment");
    const publicUrl = new URL(url); publicUrl.search = ""; expect((await page.request.get(publicUrl.toString())).status()).toBe(403);
    await page.getByRole("button", { name: "Delete document", exact: true }).click(); await page.getByRole("button", { name: "Keep document" }).click();
    await page.getByRole("button", { name: "Delete document", exact: true }).click(); await page.getByRole("button", { name: "Confirm deletion" }).click(); await expect(page.getByRole("status")).toHaveText("Document deleted.");
    await expect(page.getByRole("heading", { name: "No documents yet" })).toBeVisible(); expect((await page.request.get(`/api/documents/${id}`)).status()).toBe(404); expect((await page.request.get(url)).status()).toBe(404);
  });
}
test("blocks other workers at every document boundary and rejects invalid uploads", async ({ page, browser }) => {
  const employmentId = await account(page); const id = await upload(page);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
  try {
    const otherPage = await other.newPage(); await account(otherPage);
    const headers = { origin: "http://127.0.0.1:3100" };
    expect((await (await other.request.get("/api/documents")).json()).documents).toEqual([]);
    expect((await other.request.get(`/api/documents?employmentId=${employmentId}`)).status()).toBe(404);
    expect((await other.request.get(`/api/documents/${id}`)).status()).toBe(404);
    expect((await other.request.post(`/api/documents/${id}/access`, { headers })).status()).toBe(404);
    expect((await other.request.delete(`/api/documents/${id}`, { headers })).status()).toBe(404);
    expect((await other.request.post(`/api/documents?employmentId=${employmentId}`, { headers: { ...headers, "x-file-name": "x.pdf", "content-type": "application/pdf" }, data: pdf })).status()).toBe(404);
    await otherPage.goto(`/documents/${id}`); await expect(otherPage.getByRole("heading", { name: "Document not found" })).toBeVisible();
    for (const [body, filename, expected] of [[Buffer.from("MZ executable"), "bad.pdf", 400], [Buffer.alloc(1048577), "large.pdf", 413], [pdf, "bad.exe", 400]] as const) {
      expect((await page.request.post(`/api/documents?employmentId=${employmentId}`, { headers: { ...headers, "x-file-name": filename, "content-type": "application/pdf" }, data: body })).status()).toBe(expected);
    }
    const safe = await page.request.post(`/api/documents?employmentId=${employmentId}`, { headers: { ...headers, "x-file-name": encodeURIComponent("../../unsafe name.pdf"), "content-type": "application/pdf" }, data: pdf }); expect(safe.status()).toBe(201); const doc = (await safe.json()).document; expect(doc.sanitizedFilename).toBe("unsafe-name.pdf"); expect(doc).not.toHaveProperty("objectKey");
  } finally { await other.close(); }
});
test("preserves a selected file after upload failure and supports retry", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 }); await account(page); await page.goto("/documents/upload");
  await page.getByLabel("Choose a file").setInputFiles({ name: "record.pdf", mimeType: "application/pdf", buffer: pdf });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.route("**/api/documents?*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Storage unavailable. Please retry." }) }));
  await page.getByRole("button", { name: "Upload document", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "Storage unavailable" })).toBeVisible();
  await page.unroute("**/api/documents?*"); await page.getByRole("button", { name: "Upload document", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Document uploaded." })).toBeVisible();
});
test("requires authentication and rejects cross-origin mutations", async ({ page, request }) => {
  for (const path of ["/documents", "/documents/upload", "/documents/missing"]) { await page.goto(path); await expect(page).toHaveURL(/\/sign-in$/); }
  expect((await request.get("/api/documents")).status()).toBe(401); expect((await request.post("/api/documents")).status()).toBe(401); expect((await request.post("/api/documents/missing/access")).status()).toBe(401); expect((await request.delete("/api/documents/missing")).status()).toBe(401);
  await account(page); expect((await page.request.post("/api/documents", { headers: { origin: "https://attacker.test" } })).status()).toBe(403);
});
