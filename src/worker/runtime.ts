import { logRuntimeFailure } from "@/server/diagnostics/runtime";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";

export function workerPort(value = process.env.PORT) {
  if (value === undefined) return 3001;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
    throw new Error("Invalid worker PORT");
  return Number(value);
}

// HTTP only reads local state. A stuck tick cannot borrow another worker's heartbeat.
export async function runWorker({
  tick,
  healthy,
  signal,
  once = false,
  port = workerPort(),
  interval = 10000,
  clock = Date.now,
  onError = () => console.error("Worker dependencies unavailable; retrying."),
}: {
  tick: () => Promise<unknown>;
  healthy: () => Promise<boolean>;
  signal: AbortSignal;
  once?: boolean;
  port?: number;
  interval?: number;
  clock?: () => number;
  onError?: () => void;
}) {
  let lastHealthy: number | undefined;
  let failed = false;
  const server = once
    ? undefined
    : createServer((request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET" || request.url !== "/health") {
          response.writeHead(404).end(JSON.stringify({ status: "not_found" }));
          return;
        }
        const ok =
          !signal.aborted &&
          lastHealthy !== undefined &&
          clock() - lastHealthy < 45000 &&
          clock() >= lastHealthy;
        response
          .writeHead(ok ? 200 : 503)
          .end(JSON.stringify({ status: ok ? "ok" : "unhealthy" }));
      });
  let closing: Promise<void> | undefined;
  function close() {
    lastHealthy = undefined;
    if (!server || closing) return;
    closing = new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Health responses are tiny and synchronous; do not let idle/slow peers delay exit.
      server.closeAllConnections();
    });
  }
  try {
    if (signal.aborted) return false;
    if (server) {
      server.requestTimeout = 5000;
      server.headersTimeout = 5000;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "0.0.0.0", () => {
          server.off("error", reject);
          resolve();
        });
      });
    }
    signal.addEventListener("abort", close, { once: true });
    while (!signal.aborted) {
      let phase: "worker_tick" | "worker_health" = "worker_tick";
      try {
        await tick();
        if (once) break;
        phase = "worker_health";
        lastHealthy =
          !signal.aborted && (await healthy()) ? clock() : undefined;
      } catch (error) {
        logRuntimeFailure(phase, error);
        lastHealthy = undefined;
        failed = true;
        onError();
      }
      if (once || signal.aborted) break;
      try {
        await setTimeout(interval, undefined, { signal });
      } catch {
        break;
      }
    }
    return !failed;
  } finally {
    signal.removeEventListener("abort", close);
    close();
    await closing;
  }
}
