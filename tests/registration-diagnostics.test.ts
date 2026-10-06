import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({ config: vi.fn(), global: vi.fn(), account: vi.fn(), hash: vi.fn(), db: vi.fn(), create: vi.fn() }));
vi.mock("@/modules/auth/options", () => ({ authConfigured: mocks.config }));
vi.mock("@/modules/auth/rate-limit", () => ({ allowAuthRequest: mocks.global, allowCredentialAttempt: mocks.account }));
vi.mock("@/modules/auth/password", () => ({ hashPassword: mocks.hash }));
vi.mock("@/server/db/client", () => ({ getDb: mocks.db }));
import { POST } from "@/app/api/register/route";
const input = { email: "private@example.test", password: "private password must never be logged" };
const generic = { error: "Registration unavailable. Please try again." };
function request() { return new Request("http://localhost:3000/api/register", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(input) }); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("APP_URL", "http://localhost:3000"); vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  mocks.config.mockReturnValue(true); mocks.global.mockResolvedValue(true); mocks.account.mockResolvedValue(true);
  mocks.hash.mockResolvedValue("private-password-hash"); mocks.db.mockReturnValue({ user: { create: mocks.create } }); mocks.create.mockResolvedValue({ id: "user" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("logs missing configuration without changing its distinct 503 response", async () => {
  mocks.config.mockReturnValue(false); const response = await POST(request());
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "Registration unavailable" });
  expect(console.error).toHaveBeenCalledExactlyOnceWith("registration_config_invalid"); expect(mocks.global).not.toHaveBeenCalled();
});
it.each([
  ["config", "registration_config_invalid", "global"],
  ["global", "registration_global_limiter_failed", "account"],
  ["account", "registration_account_limiter_failed", "hash"],
  ["hash", "registration_password_hash_failed", "db"],
  ["db", "registration_database_create_failed", "create"],
  ["create", "registration_database_create_failed", null],
] as const)("logs only the fixed stage for a %s exception and remains fail-closed", async (source, label, next) => {
  const failure = new Error("password hash session-secret postgresql://private redis://private api-key " + JSON.stringify(input));
  mocks[source].mockImplementation(() => { throw failure; });
  const response = await POST(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual(generic);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(label);
  if (next) expect(mocks[next]).not.toHaveBeenCalled();
});
it("preserves global 429 and account 400 limits without reporting infrastructure failures", async () => {
  mocks.global.mockResolvedValue(false); const global = await POST(request());
  expect(global.status).toBe(429); expect(global.headers.get("Retry-After")).toBe("60"); expect(await global.json()).toEqual({ error: "Please try again shortly" });
  mocks.global.mockResolvedValue(true); mocks.account.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(400); expect(mocks.hash).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
});
it("does not log successful registration, duplicate emails or validation failures", async () => {
  const success = await POST(request()); expect(success.status).toBe(201); expect(await success.json()).toEqual({ success: true });
  mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private duplicate", { code: "P2002", clientVersion: "test" }));
  expect((await POST(request())).status).toBe(400);
  const invalid = new Request("http://localhost:3000/api/register", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}" });
  expect((await POST(invalid)).status).toBe(400); expect(console.error).not.toHaveBeenCalled();
});
