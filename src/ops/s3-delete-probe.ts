import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand,
  GetObjectRetentionCommand,
  GetObjectLegalHoldCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import {
  isObjectAbsent,
  storageDiagnostic,
} from "@/server/storage/diagnostics";

export function probeConfig(
  env: Record<string, string | undefined>,
  args: string[],
) {
  const production = args.includes("--production-disposable");
  const expected = production
    ? [
        "--production-disposable",
        "--execute",
        "--authorize-production-disposable",
      ]
    : ["--test-bucket", "--execute"];
  if (
    args.length !== expected.length ||
    !expected.every((flag) => args.includes(flag))
  )
    throw new Error("Explicit probe execution flags required");
  const names = [
    "ENDPOINT",
    "REGION",
    "BUCKET",
    "ACCESS_KEY_ID",
    "SECRET_ACCESS_KEY",
  ] as const;
  for (const name of names)
    if (!env[`PROBE_S3_${name}`])
      throw new Error("Probe configuration incomplete");
  if (
    env.PROBE_CONFIRM_BUCKET !== env.PROBE_S3_BUCKET ||
    env.PROBE_TARGET !== (production ? "production-disposable" : "private-test")
  )
    throw new Error("Probe target confirmation required");
  const endpoint = new URL(env.PROBE_S3_ENDPOINT!);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error("Probe requires a clean HTTPS endpoint");
  const pathStyle = env.PROBE_S3_FORCE_PATH_STYLE ?? "true";
  if (!["true", "false"].includes(pathStyle))
    throw new Error("Invalid addressing mode");
  // No fallback to application credentials or default SDK credential providers.
  return {
    bucket: env.PROBE_S3_BUCKET!,
    options: {
      endpoint: endpoint.href,
      region: env.PROBE_S3_REGION!,
      forcePathStyle: pathStyle === "true",
      credentials: {
        accessKeyId: env.PROBE_S3_ACCESS_KEY_ID!,
        secretAccessKey: env.PROBE_S3_SECRET_ACCESS_KEY!,
      },
      maxAttempts: 1,
    },
  };
}
type Send = Pick<S3Client, "send">;
type Report = (value: Record<string, string | number | boolean>) => void;

/** One generated object only. No caller-supplied keys, bucket-wide lists or retention changes. */
export async function runDeleteProbe(
  client: Send,
  bucket: string,
  report: Report,
) {
  const runId = randomUUID();
  const key = `treviqo-delete-probes/${runId}/object.txt`;
  const missing = `treviqo-delete-probes/${runId}/never-written.txt`;
  const body = Buffer.from(
    "Treviqo disposable deletion diagnostic. No personal data.\n",
  );
  report({
    operation: "start",
    run_id: runId,
    started_at: new Date().toISOString(),
  }); // Synthetic identifier only, never the key or endpoint.
  const input = { Bucket: bucket, Key: key };
  async function step<T extends { $metadata?: { httpStatusCode?: number } }>(
    operation: string,
    action: () => Promise<T>,
  ) {
    try {
      const result = await action();
      report({
        operation,
        outcome: "success",
        http: result.$metadata?.httpStatusCode ?? "unknown",
        category: "none",
      });
      return { ok: true as const, result };
    } catch (error) {
      report({ operation, outcome: "failure", ...storageDiagnostic(error) });
      return { ok: false as const, absent: isObjectAbsent(error) };
    }
  }
  const options = () => ({ abortSignal: AbortSignal.timeout(10000) });
  const versioning = await step("bucket_versioning", () =>
    client.send(new GetBucketVersioningCommand({ Bucket: bucket }), options()),
  );
  report({
    operation: "versioning_state",
    state: versioning.ok
      ? versioning.result.Status === "Enabled"
        ? "enabled"
        : versioning.result.Status === "Suspended"
          ? "suspended"
          : "unversioned"
      : "unknown",
  });
  const lock = await step("bucket_object_lock", () =>
    client.send(
      new GetObjectLockConfigurationCommand({ Bucket: bucket }),
      options(),
    ),
  );
  if (lock.ok)
    report({
      operation: "object_lock_state",
      enabled:
        lock.result.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled",
    });
  const missingHead = await step("head_never_written", () =>
    client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: missing }),
      options(),
    ),
  );
  report({
    operation: "missing_key_comparison",
    absence_verified: !missingHead.ok && missingHead.absent,
  });
  // Match the application's private PUT; do not silently remove ACL on incompatibility.
  const put = await step("put_object", () =>
    client.send(
      new PutObjectCommand({
        ...input,
        Body: body,
        ContentType: "text/plain",
        CacheControl: "private, no-store",
        ACL: "private",
      }),
      options(),
    ),
  );
  // A failed PUT can have reached storage. Still inspect and clean only our generated key.
  let contentVerified = false;
  if (put.ok) {
    const read = await step("get_object", async () => {
      const result = await client.send(new GetObjectCommand(input), options());
      if (!result.Body) throw new Error("Missing body");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > 1024) throw new Error("Unexpected body size");
        chunks.push(chunk);
      }
      contentVerified = Buffer.concat(chunks).equals(body);
      return result;
    });
    report({
      operation: "content_verification",
      verified: read.ok && contentVerified,
    });
  }
  const before = await step("head_before_delete", () =>
    client.send(new HeadObjectCommand(input), options()),
  );
  if (before.ok)
    report({
      operation: "head_metadata",
      version_present: Boolean(before.result.VersionId),
      retention_present: Boolean(
        before.result.ObjectLockMode || before.result.ObjectLockRetainUntilDate,
      ),
      legal_hold_on: before.result.ObjectLockLegalHoldStatus === "ON",
    });
  const retention = await step("object_retention", () =>
    client.send(new GetObjectRetentionCommand(input), options()),
  );
  if (retention.ok)
    report({
      operation: "retention_state",
      mode:
        retention.result.Retention?.Mode === "GOVERNANCE"
          ? "governance"
          : retention.result.Retention?.Mode === "COMPLIANCE"
            ? "compliance"
            : "none_reported",
      retain_until_present: Boolean(
        retention.result.Retention?.RetainUntilDate,
      ),
    });
  const hold = await step("object_legal_hold", () =>
    client.send(new GetObjectLegalHoldCommand(input), options()),
  );
  if (hold.ok)
    report({
      operation: "legal_hold_state",
      state:
        hold.result.LegalHold?.Status === "ON"
          ? "on"
          : hold.result.LegalHold?.Status === "OFF"
            ? "off"
            : "unknown",
    });
  // Ordinary application request: no VersionId, ACL, conditions or bypass headers.
  const deletion = await step("delete_object", () =>
    client.send(new DeleteObjectCommand(input), options()),
  );
  if (deletion.ok)
    report({
      operation: "delete_metadata",
      delete_marker: deletion.result.DeleteMarker === true,
      version_present: Boolean(deletion.result.VersionId),
    });
  const after = await step("head_after_delete", () =>
    client.send(new HeadObjectCommand(input), options()),
  );
  const currentAbsent = !after.ok && after.absent;
  report({ operation: "current_absence", verified: currentAbsent });

  // Inspect and clean ONLY exact versions of this run's generated key. Bounded,
  // no ListObjects, no broad prefixes, no bypass-governance/retention mutations.
  let inventoryVerified = false;
  let unversionedFallback = versioning.ok && !versioning.result.Status;
  for (let pass = 0; pass < 3; pass++) {
    const inventory = await step("list_probe_versions", () =>
      client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: key,
          MaxKeys: 20,
        }),
        options(),
      ),
    );
    if (!inventory.ok) break;
    const entries = [
      ...(inventory.result.Versions ?? []),
      ...(inventory.result.DeleteMarkers ?? []),
    ];
    const own = entries.filter((entry) => entry.Key === key);
    // An inconsistent inventory must override a nominally unversioned bucket.
    if (entries.length || inventory.result.IsTruncated !== false)
      unversionedFallback = false;
    report({
      operation: "version_inventory",
      versions: (inventory.result.Versions ?? []).filter(
        (entry) => entry.Key === key,
      ).length,
      markers: (inventory.result.DeleteMarkers ?? []).filter(
        (entry) => entry.Key === key,
      ).length,
      complete: inventory.result.IsTruncated === false,
    });
    if (
      inventory.result.IsTruncated !== false ||
      entries.some((entry) => entry.Key !== key) ||
      own.some((entry) => !entry.VersionId)
    )
      break;
    if (!own.length) {
      inventoryVerified = true;
      break;
    }
    let failed = false;
    for (const entry of own) {
      const removed = await step("delete_probe_version", () =>
        client.send(
          new DeleteObjectCommand({ ...input, VersionId: entry.VersionId }),
          options(),
        ),
      );
      if (!removed.ok) {
        failed = true;
        break;
      }
    }
    if (failed) break;
  }
  const final = await step("head_after_cleanup", () =>
    client.send(new HeadObjectCommand(input), options()),
  );
  const cleanupVerified =
    !final.ok && final.absent && (inventoryVerified || unversionedFallback);
  const ordinaryDeleteVerified =
    put.ok && contentVerified && before.ok && deletion.ok && currentAbsent;
  report({
    operation: "summary",
    ordinary_delete_verified: ordinaryDeleteVerified,
    cleanup_verified: cleanupVerified,
    operator_followup_required: !ordinaryDeleteVerified || !cleanupVerified,
  });
  return ordinaryDeleteVerified && cleanupVerified;
}
