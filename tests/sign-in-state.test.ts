import { afterEach, expect, it, vi } from "vitest";
import { deletionDeadline, DELETION_GRACE_MS } from "@/modules/account/shared";
import {
  signInErrorMessage,
  pendingDeletionDate,
  CredentialStateError,
} from "@/modules/auth/sign-in-state";
const authenticate = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/credentials", () => ({
  authenticateCredentials: authenticate,
}));
import { getAuthOptions } from "@/modules/auth/options";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
function authorize() {
  for (const [key, value] of Object.entries({
    APP_URL: "http://localhost:3000",
    NEXTAUTH_URL: "http://localhost:3000",
    SESSION_SECRET: "x".repeat(32),
    DATABASE_URL: "postgresql://localhost/test",
    REDIS_URL: "redis://localhost:6379",
  }))
    vi.stubEnv(key, value);
  const provider = getAuthOptions().providers[0]! as unknown as {
    options: { authorize(input: unknown): Promise<unknown> };
  };
  return provider.options.authorize;
}
it("uses identical invalid-credentials copy for unknown email and wrong password", async () => {
  authenticate.mockResolvedValue(null);
  const check = authorize();
  expect(
    await check({ email: "unknown@example.test", password: "wrong" }),
  ).toBeNull();
  expect(
    await check({ email: "known@example.test", password: "wrong" }),
  ).toBeNull();
  expect(signInErrorMessage("CredentialsSignin")).toBe(
    "Email or password is incorrect.",
  );
});
it("sanitizes infrastructure failures without returning invalid credentials", async () => {
  authenticate.mockRejectedValue(new Error("private database internals"));
  await expect(authorize()({})).rejects.toThrow("SignInUnavailable");
  expect(signInErrorMessage("SignInUnavailable")).toBe(
    "Sign-in is temporarily unavailable. Please try again shortly.",
  );
  expect(signInErrorMessage(undefined)).toBe(
    "Sign-in is temporarily unavailable. Please try again shortly.",
  );
});
it("passes only verified account lifecycle errors and validates their dates", async () => {
  const error = new CredentialStateError(
    "DeletionPending:2026-10-14T00:00:00.000Z",
  );
  authenticate.mockRejectedValue(error);
  await expect(authorize()({})).rejects.toBe(error);
  expect(pendingDeletionDate(error.message)).toBe("2026-10-14T00:00:00.000Z");
  expect(pendingDeletionDate("DeletionPending:not-a-date")).toBeNull();
  expect(pendingDeletionDate("CredentialsSignin")).toBeNull();
});
it("adds exactly seven 24-hour days across month and year boundaries", () => {
  const now = new Date("2026-12-29T23:30:00.000Z");
  expect(deletionDeadline(now).toISOString()).toBe("2027-01-05T23:30:00.000Z");
  expect(deletionDeadline(now).getTime() - now.getTime()).toBe(
    DELETION_GRACE_MS,
  );
});
