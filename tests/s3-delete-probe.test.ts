import { expect, it, vi } from "vitest";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  GetBucketVersioningCommand,
} from "@aws-sdk/client-s3";
import { probeConfig, runDeleteProbe } from "@/ops/s3-delete-probe";
const env = {
  PROBE_S3_ENDPOINT: "https://private.example.test",
  PROBE_S3_REGION: "fixture",
  PROBE_S3_BUCKET: "private-test",
  PROBE_S3_ACCESS_KEY_ID: "private-access",
  PROBE_S3_SECRET_ACCESS_KEY: "private-secret",
  PROBE_CONFIRM_BUCKET: "private-test",
  PROBE_TARGET: "private-test",
};
it("requires explicit execution and independent confirmed probe configuration", () => {
  expect(() => probeConfig(env, [])).toThrow();
  expect(() =>
    probeConfig({ S3_BUCKET: "production" }, ["--test-bucket", "--execute"]),
  ).toThrow();
  expect(() =>
    probeConfig({ ...env, PROBE_CONFIRM_BUCKET: "other" }, [
      "--test-bucket",
      "--execute",
    ]),
  ).toThrow();
  expect(() =>
    probeConfig(env, ["--production-disposable", "--execute"]),
  ).toThrow();
  expect(() =>
    probeConfig(env, [
      "--production-disposable",
      "--execute",
      "--authorize-production-disposable",
    ]),
  ).toThrow();
  expect(
    probeConfig({ ...env, PROBE_TARGET: "production-disposable" }, [
      "--production-disposable",
      "--execute",
      "--authorize-production-disposable",
    ]).options.maxAttempts,
  ).toBe(1);
  expect(
    probeConfig(env, ["--test-bucket", "--execute"]).options.credentials
      .accessKeyId,
  ).toBe("private-access");
});
it.each([
  "http://host",
  "https://user:password@host",
  "https://host?secret=value",
])("rejects unsafe endpoint shape", (endpoint) => {
  expect(() =>
    probeConfig({ ...env, PROBE_S3_ENDPOINT: endpoint }, [
      "--test-bucket",
      "--execute",
    ]),
  ).toThrow();
});
function fixture(
  mode:
    | "ok"
    | "delete_denied"
    | "head_denied"
    | "put_failed"
    | "versions_denied"
    | "retained"
    | "foreign" = "ok",
) {
  let body: Uint8Array | undefined;
  let key: string | undefined;
  const commands: unknown[] = [];
  const denied = () =>
    Object.assign(new Error("private provider details https://secret.test"), {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });
  const send = vi.fn(async (command) => {
    commands.push(command);
    if (command instanceof GetBucketVersioningCommand)
      return {
        Status: mode === "retained" ? "Enabled" : undefined,
        $metadata: { httpStatusCode: 200 },
      };
    if (command instanceof PutObjectCommand) {
      key = command.input.Key;
      body = command.input.Body as Uint8Array;
      if (mode === "put_failed") throw denied();
      return { $metadata: { httpStatusCode: 200 } };
    }
    if (command instanceof GetObjectCommand)
      return {
        Body: (async function* () {
          yield body!;
        })(),
        $metadata: { httpStatusCode: 200 },
      };
    if (command instanceof HeadObjectCommand) {
      if (mode === "head_denied") throw denied();
      if (!body || command.input.Key !== key)
        throw Object.assign(new Error("private details"), {
          name: "NotFound",
          $metadata: { httpStatusCode: 404 },
        });
      return { $metadata: { httpStatusCode: 200 } };
    }
    if (command instanceof DeleteObjectCommand) {
      if (
        mode === "delete_denied" ||
        (mode === "retained" && command.input.VersionId)
      )
        throw denied();
      body = undefined;
      return { $metadata: { httpStatusCode: 204 } };
    }
    if (command instanceof ListObjectVersionsCommand) {
      if (mode === "versions_denied") throw denied();
      return {
        IsTruncated: false,
        Versions:
          mode === "retained"
            ? [{ Key: key, VersionId: "private-version" }]
            : mode === "foreign"
              ? [{ Key: "unrelated-user-key", VersionId: "private-version" }]
              : [],
        $metadata: { httpStatusCode: 200 },
      };
    }
    throw denied(); // Read-only retention/lock queries may be denied independently.
  });
  return { send, commands, key: () => key };
}
it.each([
  "ok",
  "delete_denied",
  "head_denied",
  "put_failed",
  "versions_denied",
  "retained",
  "foreign",
] as const)(
  "reports %s safely without hiding ordinary DELETE results",
  async (mode) => {
    const client = fixture(mode);
    const events: Record<string, string | number | boolean>[] = [];
    const ok = await runDeleteProbe(
      client as unknown as Parameters<typeof runDeleteProbe>[0],
      "private-bucket",
      (event) => events.push(event),
    );
    expect(ok).toBe(mode === "ok" || mode === "versions_denied");
    expect(events.at(-1)?.operator_followup_required).toBe(!ok);
    const printed = JSON.stringify(events);
    for (const secret of [
      "private-bucket",
      "private provider",
      "secret.test",
      "private-version",
      "unrelated-user-key",
      client.key()!,
    ])
      expect(printed).not.toContain(secret);
    const deletes = client.commands.filter(
      (command) => command instanceof DeleteObjectCommand,
    );
    expect(deletes[0]?.input).toEqual({
      Bucket: "private-bucket",
      Key: client.key(),
    });
    expect(deletes.every((command) => command.input.Key === client.key())).toBe(
      true,
    );
    const lists = client.commands.filter(
      (command) => command instanceof ListObjectVersionsCommand,
    );
    expect(
      lists.every((command) => command.input.Prefix === client.key()),
    ).toBe(true);
    if (mode === "head_denied")
      expect(events).toContainEqual({
        operation: "current_absence",
        verified: false,
      });
    if (mode === "delete_denied")
      expect(events).toContainEqual(
        expect.objectContaining({
          operation: "delete_object",
          category: "authorization",
          http: 403,
        }),
      );
    if (mode === "foreign") expect(deletes).toHaveLength(1);
  },
);
