import { expect, it } from "vitest";
import { deploymentEnv } from "@/server/config/deployment";
const worker = {
  NODE_ENV: "production",
  APP_URL: "https://treviqo.example.test",
  DATABASE_URL: "postgresql://user:password@db.private/treviqo",
  REDIS_URL: "rediss://:password@redis.private:6379",
};
const web = {
  ...worker,
  NEXTAUTH_URL: worker.APP_URL,
  SESSION_SECRET:
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  S3_ENDPOINT: "https://objects.example.test",
  S3_BUCKET: "private",
  S3_REGION: "region",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};
it("separates worker secrets from web requirements without weakening production readiness", () => {
  expect(deploymentEnv(worker, "worker").DATABASE_URL).toBe(
    worker.DATABASE_URL,
  );
  expect(() => deploymentEnv(worker, "web")).toThrow("NEXTAUTH_URL");
  expect(deploymentEnv(web, "web").APP_URL).toBe(web.APP_URL);
  expect(() =>
    deploymentEnv({ ...web, WORKER_REQUIRED: "false" }, "web"),
  ).toThrow("WORKER_REQUIRED");
});
it("rejects embedded credentials, callback paths and query secrets without echoing them", () => {
  for (const endpoint of [
    "https://user:password@example.test",
    "https://example.test?token=secret",
    "https://example.test#secret",
    "https://example.test/app",
  ]) {
    expect(() =>
      deploymentEnv(
        { ...web, APP_URL: endpoint, NEXTAUTH_URL: endpoint },
        "web",
      ),
    ).toThrow("Use a clean endpoint: APP_URL");
  }
});
it("rejects malformed database/Redis URLs and missing database names", () => {
  for (const DATABASE_URL of ["postgresql://", "postgresql://db.private"])
    expect(() => deploymentEnv({ ...worker, DATABASE_URL }, "worker")).toThrow(
      "Invalid connection URL: DATABASE_URL",
    );
  expect(() =>
    deploymentEnv({ ...worker, REDIS_URL: "redis://" }, "worker"),
  ).toThrow("Invalid connection URL: REDIS_URL");
});
it("requires production mode and a generated session secret, with no value disclosure", () => {
  expect(() =>
    deploymentEnv({ ...web, NODE_ENV: "development" }, "web"),
  ).toThrow("NODE_ENV");
  for (const SESSION_SECRET of [
    "x".repeat(48),
    "test-only-session-secret-at-least-32-characters",
  ])
    expect(() => deploymentEnv({ ...web, SESSION_SECRET }, "web")).toThrow(
      "SESSION_SECRET must be freshly generated",
    );
  expect(() =>
    deploymentEnv(
      { ...web, RUMPTY_AI_BASE_URL: "https://ai.example.test/v1" },
      "web",
    ),
  ).toThrow("Incomplete environment group");
});
