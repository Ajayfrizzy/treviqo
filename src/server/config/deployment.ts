import "server-only";
import { parseEnv } from "./env";
export type DeploymentRole = "web" | "worker";
// Explicit release preflight, separate from credential-free build/dev validation.
export function deploymentEnv(
  input: Record<string, string | undefined>,
  role: DeploymentRole,
) {
  const env = parseEnv(input);
  if (env.NODE_ENV !== "production")
    throw new Error("NODE_ENV must be production");
  const required =
    role === "worker"
      ? (["DATABASE_URL", "REDIS_URL"] as const)
      : ([
          "DATABASE_URL",
          "REDIS_URL",
          "NEXTAUTH_URL",
          "SESSION_SECRET",
          "S3_ENDPOINT",
          "S3_REGION",
          "S3_BUCKET",
          "S3_ACCESS_KEY_ID",
          "S3_SECRET_ACCESS_KEY",
        ] as const);
  for (const key of required)
    if (!env[key]) throw new Error(`Missing configuration: ${key}`);
  for (const key of [
    "APP_URL",
    "NEXTAUTH_URL",
    "S3_ENDPOINT",
    "RUMPTY_AI_BASE_URL",
  ] as const) {
    if (!env[key]) continue;
    const url = new URL(env[key]);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      ((key === "APP_URL" || key === "NEXTAUTH_URL") && url.pathname !== "/")
    )
      throw new Error(`Use a clean endpoint: ${key}`);
  }
  for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
    try {
      const url = new URL(env[key]!);
      if (!url.hostname || (key === "DATABASE_URL" && url.pathname.length < 2))
        throw new Error();
    } catch {
      throw new Error(`Invalid connection URL: ${key}`);
    }
  }
  if (
    role === "web" &&
    (new Set(env.SESSION_SECRET).size < 12 ||
      /fixture|example|change.?me|test.only|synthetic/i.test(
        env.SESSION_SECRET!,
      ))
  )
    throw new Error("SESSION_SECRET must be freshly generated");
  if (env.WORKER_REQUIRED === "false")
    throw new Error("WORKER_REQUIRED must not be false for release acceptance");
  return env;
}
