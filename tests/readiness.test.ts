import { afterEach, beforeEach, expect, it, vi } from "vitest";
const checks = vi.hoisted(() => ({
  db: vi.fn(),
  redis: vi.fn(),
  storage: vi.fn(),
  auth: vi.fn(),
  worker: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  getDb: () => ({
    user: { findFirst: checks.db },
    reminder: { findFirst: checks.db },
    backgroundJob: { findFirst: checks.db },
  }),
}));
vi.mock("@/server/redis/client", () => ({
  getRedis: () => ({ ping: checks.redis }),
}));
vi.mock("@/server/storage/client", () => ({
  getObjectStorage: () => ({ checkConnection: checks.storage }),
}));
vi.mock("@/modules/auth/options", () => ({ authConfigured: checks.auth }));
vi.mock("@/server/jobs/health", () => ({ workerHealthy: checks.worker }));
import { GET as ready } from "@/app/api/ready/route";
import { GET as health } from "@/app/api/health/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.stubEnv("WORKER_REQUIRED", "true");
  checks.db.mockResolvedValue(null);
  checks.redis.mockResolvedValue("PONG");
  checks.storage.mockResolvedValue(undefined);
  checks.auth.mockReturnValue(true);
  checks.worker.mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
it("liveness does not depend on infrastructure", () => {
  expect(health().status).toBe(200);
});
it("requires all integrations for readiness", async () => {
  const response = await ready();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ready" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(console.error).not.toHaveBeenCalled();
  checks.auth.mockReturnValue(false);
  expect((await ready()).status).toBe(503);
});
it("does not disclose provider errors or secrets", async () => {
  checks.db.mockRejectedValue(new Error("postgresql://secret"));
  const response = await ready();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
});
it("bounds hung infrastructure checks", async () => {
  vi.useFakeTimers();
  checks.redis.mockReturnValue(new Promise(() => {}));
  const response = ready();
  await vi.advanceTimersByTimeAsync(3100);
  expect((await response).status).toBe(503);
  expect(vi.mocked(console.error).mock.calls).toEqual([
    ["readiness_failed redis"],
  ]);
  expect(process.stderr.write).toHaveBeenCalledWith(
    "runtime_failed operation=readiness_redis category=deadline\n",
  );
  vi.useRealTimers();
});

it("requires healthy worker progress when configured", async () => {
  vi.stubEnv("WORKER_REQUIRED", "true");
  try {
    expect((await ready()).status).toBe(200);
    checks.worker.mockResolvedValue(false);
    expect((await ready()).status).toBe(503);
  } finally {
    vi.unstubAllEnvs();
  }
});

const internalError = new Error(
  "https://user:secret@private-provider.test/private-key?token=credential",
);
it.each([
  ["database", "db"],
  ["redis", "redis"],
  ["storage", "storage"],
  ["worker", "worker"],
  ["auth", "auth"],
] as const)("logs only the %s label on failure", async (label, key) => {
  checks[key].mockImplementation(() => {
    throw internalError;
  });
  const response = await ready();
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"status":"unavailable"}');
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(vi.mocked(console.error).mock.calls).toEqual([
    [`readiness_failed ${label}`],
  ]);
  expect(process.stderr.write).toHaveBeenCalledWith(
    `runtime_failed operation=readiness_${label} category=unknown\n`,
  );
});
it("logs multiple failures once in stable order, without internal errors", async () => {
  checks.storage.mockRejectedValue(internalError);
  checks.worker.mockResolvedValue(false);
  const response = await ready();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "unavailable" });
  expect(vi.mocked(console.error).mock.calls).toEqual([
    ["readiness_failed storage,worker"],
  ]);
});
