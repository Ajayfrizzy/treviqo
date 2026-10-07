import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { deleteAccountSchema } from "@/modules/account/shared";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  allow: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/modules/auth/rate-limit", () => ({ allowAuthRequest: mocks.allow }));
vi.mock("@/modules/account/service", () => ({
  accountDeletionService: () => ({ schedule: mocks.schedule }),
}));
import { DELETE } from "@/app/api/account/route";
const input = { password: " current password ", confirmation: "DELETE" };
const req = (body: unknown = input, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost:3000/api/account", {
    method: "DELETE",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.user.mockResolvedValue({ id: "session-owner" });
  mocks.allow.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("requires exact confirmation, preserves passwords, and prohibits target-user injection", () => {
  expect(deleteAccountSchema.parse(input)).toEqual(input);
  for (const value of [
    { ...input, userId: "victim" },
    { ...input, confirmation: "delete" },
    { password: input.password },
    { ...input, password: "" },
    { ...input, password: "x".repeat(129) },
  ])
    expect(deleteAccountSchema.safeParse(value).success).toBe(false);
});
it("requires authentication before cleanup", async () => {
  mocks.user.mockResolvedValue(null);
  expect((await DELETE(req())).status).toBe(401);
  expect(mocks.schedule).not.toHaveBeenCalled();
});
it.each([
  [{ origin: "https://foreign.test" }, 403],
  [{ "content-type": "text/plain" }, 415],
] as const)(
  "rejects foreign origin or unsupported bodies",
  async (headers, status) => {
    expect((await DELETE(req(input, headers))).status).toBe(status);
    expect(mocks.schedule).not.toHaveBeenCalled();
  },
);
it("bounds streamed input and fails closed on unavailable rate limiting", async () => {
  expect((await DELETE(req({ password: "x".repeat(4097) }))).status).toBe(400);
  mocks.allow.mockRejectedValue(new Error("redis private secret"));
  const response = await DELETE(req());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private secret");
  expect(mocks.schedule).not.toHaveBeenCalled();
});
it("derives ownership only from the session and clears all auth cookie variants after success", async () => {
  mocks.schedule.mockResolvedValue({
    status: "scheduled",
    deletionScheduledFor: "2026-10-14T00:00:00.000Z",
  });
  const response = await DELETE(
    req(input, {
      cookie:
        "next-auth.session-token.0=private; __Secure-next-auth.session-token.1=private; other=keep",
    }),
  );
  expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith(
    "session-owner",
    input,
  );
  expect(response.status).toBe(202);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const cookies = response.cookies.getAll();
  for (const name of [
    "next-auth.session-token",
    "__Secure-next-auth.session-token",
    "next-auth.session-token.0",
    "__Secure-next-auth.session-token.1",
  ])
    expect(cookies.find((c) => c.name === name)).toMatchObject({
      value: "",
      maxAge: 0,
      httpOnly: true,
      path: "/",
    });
  expect(cookies.some((c) => c.name === "other")).toBe(false);
});
it("does not clear cookies or claim success when scheduling fails", async () => {
  mocks.schedule.mockRejectedValueOnce(
    new Error("403 AccessDenied document-content password secret-key"),
  );
  const failed = await DELETE(req());
  expect(failed.status).toBe(503);
  expect(failed.headers.has("set-cookie")).toBe(false);
  const body = await failed.text();
  expect(body).toContain("could not be scheduled");
  expect(body).not.toContain("secret-key");
  expect(body).not.toContain("document-content");
});
