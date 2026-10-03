import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), active: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/modules/auth/session-store", () => ({ SESSION_SECONDS: 28800, createAuthSession: mocks.create, isAuthSessionActive: mocks.active, revokeAuthSession: mocks.revoke }));
import { assertOwner, getCurrentUser } from "@/modules/auth/session";
import { getAuthOptions } from "@/modules/auth/options";
import { GET } from "@/app/api/me/route";
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function configure() {
  for (const [key, value] of Object.entries({ APP_URL: "http://localhost:3000", NEXTAUTH_URL: "http://localhost:3000", SESSION_SECRET: "x".repeat(32), DATABASE_URL: "postgresql://localhost/test", REDIS_URL: "redis://localhost:6379" })) vi.stubEnv(key, value);
}
describe("authentication boundary", () => {
  it("keeps only internal identity and session references in encrypted tokens", async () => {
    configure(); mocks.create.mockResolvedValue({ id: "session-a" });
    const result = await getAuthOptions().callbacks!.jwt!({ token: { email: "discard@example.test" }, user: { id: "user-a", email: "discard@example.test" }, account: null, trigger: "signIn" });
    expect(result).toEqual({ sub: "user-a", sid: "session-a" });
  });
  it("fails closed without configuration", async () => { vi.stubEnv("SESSION_SECRET", ""); expect(await getCurrentUser()).toBeNull(); expect(mocks.session).not.toHaveBeenCalled(); expect((await GET()).status).toBe(401); });
  it("rejects missing sessions", async () => { configure(); mocks.session.mockResolvedValue(null); expect((await GET()).status).toBe(401); });
  it("returns only the authenticated user", async () => { configure(); mocks.session.mockResolvedValue({ user: { id: "user-a" } }); expect(await (await GET()).json()).toEqual({ user: { id: "user-a" } }); });
  it("rejects access across owners", () => { expect(() => assertOwner("user-a", "user-b")).toThrow("Forbidden"); expect(() => assertOwner("", "")).toThrow("Forbidden"); expect(() => assertOwner("user-a", "user-a")).not.toThrow(); });
  it("uses bounded sessions and secure production cookies", () => { configure(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_URL", "https://example.test"); vi.stubEnv("NEXTAUTH_URL", "https://example.test"); const options = getAuthOptions(); expect(options.session).toEqual({ strategy: "jwt", maxAge: 28800 }); expect(options.useSecureCookies).toBe(true); });
  it("revokes server sessions on logout and propagates revocation failure", async () => {
    configure(); const failed = vi.fn(); const options = getAuthOptions(failed);
    await options.events!.signOut!({ token: { sid: "session-a" }, session: { expires: "fixture" } }); expect(mocks.revoke).toHaveBeenCalledWith("session-a");
    mocks.revoke.mockRejectedValue(new Error("offline")); await expect(options.events!.signOut!({ token: { sid: "session-a" }, session: { expires: "fixture" } })).rejects.toThrow(); expect(failed).toHaveBeenCalled();
  });
});
