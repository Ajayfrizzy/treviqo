import { createServer } from "node:net";
import { expect, it, vi } from "vitest";
import { runWorker, workerPort } from "@/worker/runtime";

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
it("uses the injected port, a worker-only fallback, and rejects invalid ports safely", () => {
  vi.stubEnv("PORT", "4123");
  expect(workerPort()).toBe(4123);
  vi.stubEnv("PORT", undefined);
  expect(workerPort()).toBe(3001);
  for (const value of ["", "0", "65536", "123x", "secret"]) {
    expect(() => workerPort(value)).toThrow("Invalid worker PORT");
  }
  vi.unstubAllEnvs();
});
it("serves minimal health, expires local progress, keeps ticking, and closes HTTP on abort", async () => {
  const port = await freePort();
  const shutdown = new AbortController();
  let now = 1000;
  let health = true;
  let release: (() => void) | undefined;
  let blocked = true;
  const onError = vi.fn();
  const tick = vi.fn(async () => {
    if (blocked)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  const healthy = vi.fn(async () => health);
  const done = runWorker({
    tick,
    healthy,
    signal: shutdown.signal,
    port,
    interval: 10,
    clock: () => now,
    onError,
  });
  const url = `http://127.0.0.1:${port}/health`;
  try {
    await vi.waitFor(() => expect(release).toBeDefined());
    expect((await fetch(url)).status).toBe(503);
    expect(healthy).not.toHaveBeenCalled();
    blocked = false;
    release!();
    release = undefined;
    await vi.waitFor(async () => expect((await fetch(url)).status).toBe(200));
    expect(await (await fetch(url)).json()).toEqual({ status: "ok" });
    expect((await fetch(url)).headers.get("cache-control")).toBe("no-store");
    expect((await fetch(url.replace("/health", "/"))).status).toBe(404);
    expect((await fetch(url, { method: "POST" })).status).toBe(404);
    health = false;
    await vi.waitFor(async () => expect((await fetch(url)).status).toBe(503));
    expect(await (await fetch(url)).json()).toEqual({ status: "unhealthy" });
    healthy.mockRejectedValue(
      new Error("postgres://private:credential@internal/job-payload"),
    );
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(await (await fetch(url)).json()).toEqual({ status: "unhealthy" });
    healthy.mockImplementation(async () => true);
    await vi.waitFor(async () => expect((await fetch(url)).status).toBe(200));
    expect(tick.mock.calls.length).toBeGreaterThan(1);
    blocked = true;
    await vi.waitFor(() => expect(release).toBeDefined());
    now += 45001;
    expect((await fetch(url)).status).toBe(503);
    shutdown.abort();
    await expect(fetch(url)).rejects.toThrow();
    release!();
    await done;
    const calls = tick.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(tick).toHaveBeenCalledTimes(calls);
  } finally {
    shutdown.abort();
    release?.();
    await done;
  }
});
it("preserves one-shot mode without HTTP or a new health dependency", async () => {
  const tick = vi.fn(async () => {});
  const healthy = vi.fn(async () => false);
  expect(
    await runWorker({
      tick,
      healthy,
      once: true,
      signal: new AbortController().signal,
    }),
  ).toBe(true);
  expect(tick).toHaveBeenCalledTimes(1);
  expect(healthy).not.toHaveBeenCalled();
});
