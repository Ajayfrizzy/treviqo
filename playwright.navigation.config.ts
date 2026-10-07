import { defineConfig } from "@playwright/test";
if (
  !process.env.DATABASE_URL ||
  !process.env.REDIS_URL ||
  !process.env.NAVIGATION_TLS_KEY ||
  !process.env.NAVIGATION_TLS_CERT
) {
  throw new Error(
    "Production navigation tests require disposable DATABASE_URL/REDIS_URL and local NAVIGATION_TLS_KEY/NAVIGATION_TLS_CERT",
  );
}
process.env.NAVIGATION_PRODUCTION = "1";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "navigation.spec.ts",
  outputDir: "test-results/navigation-production",
  workers: 1,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/navigation-production/results.json" }],
  ],
  use: {
    baseURL: "https://127.0.0.1:3443",
    browserName: "chromium",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node tests/fixtures/navigation-server.mjs",
      url: "http://127.0.0.1:3110/api/health",
      reuseExistingServer: false,
      env: {
        HOSTNAME: "127.0.0.1",
        PORT: "3110",
        APP_URL: "https://127.0.0.1:3443",
        NEXTAUTH_URL: "https://127.0.0.1:3443",
        SESSION_SECRET: "test-only-navigation-secret-at-least-32-characters",
        DATABASE_URL: process.env.DATABASE_URL,
        REDIS_URL: process.env.REDIS_URL,
        S3_ENDPOINT: "",
        S3_REGION: "",
        S3_BUCKET: "",
        S3_ACCESS_KEY_ID: "",
        S3_SECRET_ACCESS_KEY: "",
        RUMPTY_AI_BASE_URL: "",
        RUMPTY_AI_API_KEY: "",
        RUMPTY_AI_MODEL: "",
      },
    },
    {
      command: "node tests/fixtures/navigation-https.mjs",
      url: "https://127.0.0.1:3443/api/health",
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
    },
  ],
});
