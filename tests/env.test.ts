import { describe, expect, it } from "vitest";
import { parseEnv } from "@/server/config/env";
describe("server environment", () => {
  it("allows credential-free local bootstrap", () => {
    expect(parseEnv({ DATABASE_URL: "" }).DATABASE_URL).toBeUndefined();
  });
  it("rejects invalid secrets without disclosing them", () => {
    expect(() => parseEnv({ SESSION_SECRET: "sensitive" })).toThrow(
      "Invalid environment: SESSION_SECRET",
    );
  });
  it("rejects partial storage configuration", () => {
    expect(() =>
      parseEnv({ S3_ENDPOINT: "https://storage.example.test" }),
    ).toThrow("Incomplete environment group");
  });
  it("rejects production HTTP and mismatched callback origins", () => {
    expect(() =>
      parseEnv({ NODE_ENV: "production", APP_URL: "http://example.test" }),
    ).toThrow("HTTPS required");
    expect(() =>
      parseEnv({
        APP_URL: "http://localhost:3000",
        NEXTAUTH_URL: "http://evil.test",
      }),
    ).toThrow("must match");
  });
  it("does not coerce the string false to true", () => {
    expect(parseEnv({ S3_FORCE_PATH_STYLE: "false" }).S3_FORCE_PATH_STYLE).toBe(
      false,
    );
  });
});
