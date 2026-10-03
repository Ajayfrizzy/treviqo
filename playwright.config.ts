import { defineConfig } from "@playwright/test";
if (!process.env.DATABASE_URL || !process.env.REDIS_URL) throw new Error("Browser tests require disposable DATABASE_URL and REDIS_URL");
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", browserName: "chromium" },
  webServer: [{ command: "node tests/fixtures/s3-server.mjs", url: "http://127.0.0.1:3197/health", reuseExistingServer: false }, {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100/api/health", reuseExistingServer: false,
    env: { APP_URL: "http://127.0.0.1:3100", NEXTAUTH_URL: "http://127.0.0.1:3100", SESSION_SECRET: "test-only-session-secret-at-least-32-characters", DATABASE_URL: process.env.DATABASE_URL!, REDIS_URL: process.env.REDIS_URL!, S3_ENDPOINT: "http://127.0.0.1:3197", S3_REGION: "test", S3_BUCKET: "private", S3_ACCESS_KEY_ID: "fixture", S3_SECRET_ACCESS_KEY: "fixture", DOCUMENT_MAX_FILE_MB: "1" },
  }],
});
