import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  limit: vi.fn(),
  service: vi.fn(),
  start: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/modules/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/server/rate-limit", () => ({
  limitWorkflow: mocks.limit,
  limitResponse: () => null,
}));
vi.mock("@/modules/extractions/service", () => ({
  extractionService: mocks.service,
}));
import { extractionRequest } from "@/modules/extractions/http";
function request() {
  return new Request(
    "http://localhost:3000/api/documents/fixture/extractions",
    {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "ai", text: "synthetic document contents" }),
    },
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.service.mockReturnValue({ start: mocks.start, read: mocks.read });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("returns a failed inference attempt as 200, preserving the manual fallback contract", async () => {
  const bundle = {
    extraction: { status: "failed", errorCode: "timeout", fields: [] },
    attempts: [],
  };
  mocks.start.mockResolvedValue(bundle);
  const response = await extractionRequest(request(), "fixture");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(bundle);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.start).toHaveBeenCalledTimes(1);
  expect(console.error).not.toHaveBeenCalled();
});
it.each([
  ["user", "authentication"],
  ["limit", "write_limiter"],
  ["service", "service_initialization"],
  ["start", "start"],
] as const)(
  "identifies the %s 503 boundary without leaking errors",
  async (source, stage) => {
    mocks[source].mockImplementation(() => {
      throw new Error("secret credential and document text");
    });
    const response = await extractionRequest(request(), "fixture");
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "extraction_request_failed",
      stage,
      "unknown",
    );
  },
);
it("reports only a validated Prisma code for missing extraction migrations", async () => {
  mocks.start.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("private SQL", {
      code: "P2021",
      clientVersion: "test",
      meta: { document: "private" },
    }),
  );
  expect((await extractionRequest(request(), "fixture")).status).toBe(503);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    "extraction_request_failed",
    "start",
    "P2021",
  );
});
