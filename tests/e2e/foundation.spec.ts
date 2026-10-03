import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
const db = new PrismaClient();
const accounts: string[] = [];
const password = "Synthetic E2E passphrase only";
async function register(page: Page) {
  const email = `e2e-${randomUUID()}@example.test`; accounts.push(email);
  await page.goto("/register"); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Your account is ready"); return email;
}
async function login(page: Page, email: string) {
  await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click(); await expect(page).toHaveURL("/");
}
test.afterAll(async () => { await db.user.deleteMany({ where: { email: { in: accounts } } }); await db.$disconnect(); });
for (const width of [320, 375, 430, 1280]) {
  test(`sign-in fits ${width}px and has a working keyboard skip link`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 }); await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in securely" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press("Tab"); await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
}
test("all five areas require authentication", async ({ page, request }) => {
  for (const route of ["/", "/exit", "/passport", "/documents", "/profile"]) { await page.goto(route); await expect(page).toHaveURL(/\/sign-in$/); }
  expect((await request.get("/api/me")).status()).toBe(401);
  expect((await request.get("/api/auth/session")).status()).toBe(200);
  expect((await request.get("/api/health")).status()).toBe(200);
  expect((await request.get("/api/ready")).status()).toBe(200);
});
test("sign-in errors show safe recovery copy", async ({ page }) => { await page.goto("/sign-in?error=secret-provider-detail"); await expect(page.getByRole("main").getByRole("alert")).toContainText("Please try again"); await expect(page.getByRole("main")).not.toContainText("secret-provider-detail"); });

for (const width of [320, 375, 430, 1280]) {
  test(`authenticated navigation and shell fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const email = await register(page); await login(page, email);
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();
    for (const label of ["Exit", "Passport", "Documents", "Profile", "Home"]) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = await nav.boundingBox();
      if (width < 800) expect(bounds!.y + bounds!.height).toBeCloseTo(850, 0);
    }
    await page.screenshot({ path: `test-results/shell-${width}.png`, fullPage: true });
  });
}
test("expired session cannot access the shell", async ({ page, context }) => {
  const { encode } = await import("next-auth/jwt");
  const token = await encode({ token: { sub: "fixture-user" }, secret: "test-only-session-secret-at-least-32-characters", maxAge: -60 });
  await context.addCookies([{ name: "next-auth.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/documents"); await expect(page).toHaveURL(/\/sign-in$/);
});

test("real registration, generic login failures, persistence and logout invalidation", async ({ page, context }) => {
  const email = await register(page);
  await page.goto("/register"); await page.getByLabel("Email", { exact: true }).fill(email.toUpperCase()); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click(); await expect(page.getByRole("main").getByRole("alert")).toContainText("Unable to create");
  for (const loginEmail of [email, `absent-${email}`]) {
    await page.goto("/sign-in"); await page.getByLabel("Email", { exact: true }).fill(loginEmail); await page.getByLabel("Password", { exact: true }).fill("Wrong long fixture password"); await page.getByRole("button", { name: "Sign in securely" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Unable to sign in. Check your details or try again later.");
  }
  await login(page, email); await page.reload(); await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const me = await context.request.get("/api/me"); expect(me.status()).toBe(200); expect(Object.keys((await me.json()).user)).toEqual(["id"]);
  const session = await context.request.get("/api/auth/session"); const publicSession = await session.json(); expect(Object.keys(publicSession).sort()).toEqual(["expires", "user"]); expect(Object.keys(publicSession.user)).toEqual(["id"]);
  const cookies = await context.cookies(); const sessionCookie = cookies.find(cookie => cookie.name === "next-auth.session-token")!; expect(sessionCookie.httpOnly).toBe(true); expect(sessionCookie.sameSite).toBe("Lax");
  await page.goto("/profile"); await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(/\/sign-in$/);
  await context.addCookies([sessionCookie]); expect((await context.request.get("/api/me")).status()).toBe(401);
  await page.goto("/documents"); await expect(page).toHaveURL(/\/sign-in$/);
});
test("registration and login reject cross-site requests and missing CSRF", async ({ request }) => {
  expect((await request.post("/api/register", { headers: { origin: "https://attacker.test" }, data: { email: "x@example.test", password } })).status()).toBe(403);
  const response = await request.post("/api/auth/callback/credentials", { headers: { origin: "http://127.0.0.1:3100" }, form: { email: "x@example.test", password, json: "true" } });
  expect(await response.text()).toContain("csrf=true"); expect((await request.get("/api/me")).status()).toBe(401);
});
