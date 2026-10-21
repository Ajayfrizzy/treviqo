import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { HEARTBEAT } from "@/server/jobs/queue";
const db = getDb(),
  redis = getRedis();
const exec = promisify(execFile);
// CI runs integrations before its separate worker build; verify fresh output here.
beforeAll(async () => {
  await exec(process.execPath, ["scripts/build-worker.mjs"], {
    timeout: 60000,
  });
}, 65000);
afterAll(async () => {
  await db.$disconnect();
  redis.disconnect();
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  it(`compiled worker serves health, runs jobs and shuts down on ${signal}`, async () => {
    for (const file of [
      "worker/main.js",
      "worker/runtime.js",
      "worker/health.js",
      "worker/availability.js",
      "server/jobs/runner.js",
      "server/jobs/health.js",
      "ops/deployment.js",
    ])
      await access(`dist-worker/${file}`);
    await db.backgroundJob.deleteMany();
    await redis.del(HEARTBEAT);
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "dist-worker/worker/main.js"],
      {
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
      },
    );
    const exited = once(child, "exit");
    const url = `http://127.0.0.1:${port}/health`;
    try {
      await vi.waitFor(
        async () => expect((await fetch(url)).status).toBe(200),
        { timeout: 15000 },
      );
      expect(await (await fetch(url)).json()).toEqual({ status: "ok" });
      const heartbeat = await redis.get(HEARTBEAT);
      await vi.waitFor(
        async () => expect(await redis.get(HEARTBEAT)).not.toBe(heartbeat),
        { timeout: 15000 },
      );
      expect(
        await db.backgroundJob.count({
          where: { lastSucceededAt: { not: null } },
        }),
      ).toBeGreaterThan(0);
      await exec("npm", ["run", "worker:health"], { timeout: 10000 });
      await db.backgroundJob.updateMany({
        data: { attempts: 5, dueAt: new Date(Date.now() + 3600000) },
      });
      const beforeRetryTick = await redis.get(HEARTBEAT);
      await vi.waitFor(
        async () =>
          expect(await redis.get(HEARTBEAT)).not.toBe(beforeRetryTick),
        { timeout: 15000 },
      );
      expect((await fetch(url)).status).toBe(200);
      expect(await (await fetch(url)).json()).toEqual({ status: "ok" });
      expect(await db.backgroundJob.count({ where: { attempts: 5 } })).toBe(4);
      await exec(
        process.execPath,
        ["--conditions=react-server", "dist-worker/worker/availability.js"],
        {
          env: { ...process.env, PORT: String(port) },
          timeout: 5000,
        },
      );
      await expect(
        exec("npm", ["run", "worker:health"], { timeout: 10000 }),
      ).rejects.toMatchObject({ code: 1 });
      child.kill(signal);
      expect(await exited).toEqual([0, null]);
      await expect(fetch(url)).rejects.toThrow();
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
      await db.backgroundJob.deleteMany();
      await redis.del(HEARTBEAT);
    }
  }, 45000);
}

it("bounds shutdown when a database operation is stuck", async () => {
  let unlock!: () => void;
  let locked!: () => void;
  const lockReady = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const release = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const transaction = db.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE "BackgroundJob" IN ACCESS EXCLUSIVE MODE`;
      locked();
      await release;
    },
    { timeout: 25000 },
  );
  // Attach a rejection handler immediately so a failed lock cannot be unhandled.
  const ready = Promise.race([lockReady, transaction]);
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  const child = spawn(
    process.execPath,
    ["--conditions=react-server", "dist-worker/worker/main.js"],
    {
      env: { ...process.env, PORT: String(port) },
      stdio: "ignore",
    },
  );
  const exited = once(child, "exit");
  try {
    await ready;
    await vi.waitFor(
      async () =>
        expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(
          503,
        ),
      { timeout: 5000 },
    );
    child.kill("SIGTERM");
    await vi.waitFor(() => expect(child.exitCode).toBe(1), { timeout: 12000 });
    expect(await exited).toEqual([1, null]);
  } finally {
    unlock();
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
    await exited;
    await transaction;
  }
}, 25000);

for (const dependency of ["DATABASE_URL", "REDIS_URL"] as const) {
  it(`compiled deployment probe fails when ${dependency} is unavailable`, async () => {
    const listener = createServer();
    await new Promise<void>((resolve) =>
      listener.listen(0, "127.0.0.1", resolve),
    );
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((resolve) => listener.close(() => resolve()));
    const child = spawn(
      process.execPath,
      ["--conditions=react-server", "dist-worker/worker/main.js"],
      {
        env: {
          ...process.env,
          PORT: String(port),
          [dependency]:
            dependency === "DATABASE_URL"
              ? "postgresql://fixture@127.0.0.1:1/fixture?connect_timeout=1"
              : "redis://127.0.0.1:1",
        },
        stdio: "ignore",
      },
    );
    const exited = once(child, "exit");
    try {
      await vi.waitFor(
        async () =>
          expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(
            503,
          ),
        { timeout: 5000 },
      );
      await expect(
        exec(
          process.execPath,
          ["--conditions=react-server", "dist-worker/worker/availability.js"],
          {
            env: { ...process.env, PORT: String(port) },
            timeout: 5000,
          },
        ),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  }, 15000);
}
