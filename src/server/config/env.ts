import "server-only";
import { z } from "zod";
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(value => value === "" ? undefined : value, schema.optional());
const url = z.string().url().refine(value => ["http:", "https:"].includes(new URL(value).protocol));
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: url.default("http://localhost:3000"),
  NEXTAUTH_URL: optional(url),
  SESSION_SECRET: optional(z.string().min(32)),
  WORKER_REQUIRED: optional(z.enum(["true", "false"])),
  DATABASE_URL: optional(z.string().regex(/^postgres(ql)?:\/\//)),
  REDIS_URL: optional(z.string().regex(/^rediss?:\/\//)),
  RUMPTY_AI_BASE_URL: optional(url),
  RUMPTY_AI_API_KEY: optional(z.string().min(1)),
  RUMPTY_AI_MODEL: optional(z.string().min(1).max(160)),
  DOCUMENT_MAX_FILE_MB: z.coerce.number().int().min(1).max(20).default(10),
  S3_ENDPOINT: optional(url), S3_REGION: optional(z.string().min(1)), S3_BUCKET: optional(z.string().min(1)),
  S3_ACCESS_KEY_ID: optional(z.string().min(1)), S3_SECRET_ACCESS_KEY: optional(z.string().min(1)),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
});
// Errors deliberately list field names only, never configuration values.
export function parseEnv(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(`Invalid environment: ${result.error.issues.map(issue => issue.path.join(".")).join(", ")}`);
  const env = result.data;
  const groups = [["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"], ["RUMPTY_AI_BASE_URL", "RUMPTY_AI_API_KEY", "RUMPTY_AI_MODEL"]] as const;
  for (const group of groups) {
    if (group.some(key => env[key] !== undefined) && !group.every(key => env[key] !== undefined)) {
      throw new Error(`Incomplete environment group: ${group.join(", ")}`);
    }
  }
  if (env.NEXTAUTH_URL && env.NEXTAUTH_URL !== env.APP_URL) throw new Error("APP_URL and NEXTAUTH_URL must match");
  if (env.NODE_ENV === "production") {
    for (const key of ["APP_URL", "S3_ENDPOINT", "RUMPTY_AI_BASE_URL"] as const) {
      if (env[key] && !String(env[key]).startsWith("https://")) throw new Error(`HTTPS required: ${key}`);
    }
  }
  return env;
}
export const getEnv = () => parseEnv(process.env);
