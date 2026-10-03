import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ register: vi.fn(), limit: vi.fn() }));
vi.mock("@/modules/auth/options", () => ({ authConfigured: () => true }));
vi.mock("@/modules/auth/rate-limit", () => ({ allowAuthRequest: mocks.limit }));
vi.mock("@/modules/auth/credentials", async (original) => ({ ...await original<typeof import("@/modules/auth/credentials")>(), registerUser: mocks.register }));
import { POST } from "@/app/api/register/route";
import { RegistrationError } from "@/modules/auth/credentials";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("APP_URL", "http://localhost:3000"); vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000"); mocks.limit.mockResolvedValue(true); mocks.register.mockResolvedValue({ id: "user-a", passwordHash: "must-not-leak" }); });
function request(origin = "http://localhost:3000", body = JSON.stringify({ email: "a@example.test", password: "long test passphrase" })) { return new Request("http://localhost:3000/api/register", { method: "POST", headers: { origin, "content-type": "application/json" }, body }); }
it("never serializes the persistence result", async () => { const response = await POST(request()); expect(response.status).toBe(201); expect(await response.json()).toEqual({ success: true }); });
it("rejects cross-site registration", async () => { expect((await POST(request("https://attacker.test"))).status).toBe(403); expect(mocks.register).not.toHaveBeenCalled(); });
it("rejects oversized bodies without trusting content-length", async () => { expect((await POST(request(undefined, "x".repeat(5000)))).status).toBe(400); expect(mocks.register).not.toHaveBeenCalled(); });
it("returns a generic duplicate/validation response", async () => { mocks.register.mockRejectedValue(new RegistrationError()); const response = await POST(request()); expect(response.status).toBe(400); expect(await response.text()).not.toContain("passwordHash"); });
it("fails closed when Redis is unavailable", async () => { mocks.limit.mockRejectedValue(new Error("redis://secret")); const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret"); expect(mocks.register).not.toHaveBeenCalled(); });
