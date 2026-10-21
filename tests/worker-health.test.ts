import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ get: vi.fn(), findMany: vi.fn() }));
vi.mock("@/server/db/client", () => ({
  getDb: () => ({ backgroundJob: { findMany: mock.findMany } }),
}));
vi.mock("@/server/redis/client", () => ({
  getRedis: () => ({ get: mock.get }),
}));
import { workerHealthy, workerAvailable } from "@/server/jobs/health";
import { jobIds } from "@/server/jobs/queue";
const now = new Date("2026-10-20T04:30:00Z");
const jobs = () =>
  jobIds.map((id) => ({
    id,
    attempts: 0,
    dueAt: now,
    createdAt: now,
    lastSucceededAt: now,
  }));
beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock.get.mockResolvedValue(String(now.getTime()));
  mock.findMany.mockResolvedValue(jobs());
});
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});
it("accepts current heartbeat and completed sweeps silently", async () => {
  expect(await workerHealthy(now)).toBe(true);
  expect(console.error).not.toHaveBeenCalled();
});
it.each([
  [null, "heartbeat_expired"],
  ["invalid-private-value", "heartbeat_invalid"],
  [String(now.getTime() + 5001), "heartbeat_future"],
  [String(now.getTime() - 45001), "heartbeat_expired"],
])(
  "reports heartbeat failure without reading job data",
  async (value, reason) => {
    mock.findMany.mockClear();
    mock.get.mockResolvedValue(value);
    expect(await workerHealthy(now)).toBe(false);
    expect(mock.findMany).not.toHaveBeenCalled();
    expect(process.stderr.write).toHaveBeenCalledWith(
      `worker_health_failed reason=${reason}\n`,
    );
  },
);
it.each([
  [{ attempts: 5 }, "job_retries"],
  [{ dueAt: new Date(now.getTime() - 300000) }, "job_overdue"],
  [{ lastSucceededAt: new Date(now.getTime() - 7200000) }, "job_stale"],
  [
    { lastSucceededAt: null, createdAt: new Date(now.getTime() - 120000) },
    "job_never_completed",
  ],
])("keeps existing job health thresholds", async (patch, reason) => {
  const rows = jobs();
  Object.assign(rows[0]!, patch);
  mock.findMany.mockResolvedValue(rows);
  expect(await workerHealthy(now)).toBe(false);
  expect(process.stderr.write).toHaveBeenCalledWith(
    `worker_health_failed reason=${reason}\n`,
  );
});
it("reports missing configured jobs", async () => {
  mock.findMany.mockResolvedValue(jobs().slice(1));
  expect(await workerHealthy(now)).toBe(false);
  expect(process.stderr.write).toHaveBeenCalledWith(
    "worker_health_failed reason=jobs_missing\n",
  );
});
it.each([
  ["get", "worker_redis", "ECONNREFUSED", "connection_refused"],
  ["findMany", "worker_database", "P2024", "database_pool_timeout"],
] as const)(
  "preserves dependency rejection without disclosing its contents",
  async (method, phase, code, category) => {
    const error = Object.assign(new Error("private connection and query"), {
      code,
    });
    mock[method].mockRejectedValueOnce(error);
    await expect(workerHealthy(now)).rejects.toBe(error);
    expect(process.stderr.write).toHaveBeenCalledWith(
      `runtime_failed operation=${phase} category=${category}\n`,
    );
  },
);

it("keeps deployment available during backoff while strict diagnostics remain unhealthy", async () => {
  const rows = jobs();
  Object.assign(rows[0]!, {
    attempts: 30,
    dueAt: new Date(now.getTime() + 1800000),
    lastSucceededAt: new Date(0),
  });
  mock.findMany.mockResolvedValue(rows);
  expect(await workerAvailable(now)).toBe(true);
  expect(await workerHealthy(now)).toBe(false);
  expect(process.stderr.write).toHaveBeenCalledWith(
    "worker_health_failed reason=job_retries\n",
  );
});
it("availability still requires fresh progress, durable jobs and accessible dependencies", async () => {
  mock.get.mockResolvedValue(null);
  expect(await workerAvailable(now)).toBe(false);
  mock.get.mockResolvedValue(String(now.getTime()));
  mock.findMany.mockResolvedValue([]);
  expect(await workerAvailable(now)).toBe(false);
  mock.findMany.mockRejectedValueOnce(
    Object.assign(new Error("private"), { code: "P1001" }),
  );
  await expect(workerAvailable(now)).rejects.toMatchObject({ code: "P1001" });
  mock.get.mockRejectedValueOnce(
    Object.assign(new Error("private"), { code: "ECONNREFUSED" }),
  );
  await expect(workerAvailable(now)).rejects.toMatchObject({
    code: "ECONNREFUSED",
  });
});
