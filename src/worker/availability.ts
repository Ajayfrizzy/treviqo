import { workerPort } from "./runtime";
// Container health must not borrow a shared heartbeat from another replica.
try {
  const response = await fetch(`http://127.0.0.1:${workerPort()}/health`, {
    signal: AbortSignal.timeout(3000),
    redirect: "error",
  });
  if (response.status !== 200 || (await response.json()).status !== "ok")
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
