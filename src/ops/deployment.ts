import { networkCheck } from "./network";
import { verifyHealthResponse } from "./health-response";
import { randomUUID, createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { deploymentEnv } from "@/server/config/deployment";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { getObjectStorage } from "@/server/storage/client";
import { getDocumentAI } from "@/server/ai/client";
import { workerHealthy } from "@/server/jobs/health";
import {
  classificationPrompt,
  extractionPrompt,
} from "@/modules/extractions/prompts";
import {
  normalizeEvidence,
  parseClassification,
  parseFields,
  PROMPT_VERSION,
  SCHEMA_VERSION,
} from "@/modules/extractions/schema";
import { supportedTypes } from "@/modules/extractions/shared";

const flags = new Set(process.argv.slice(2));
const allowed = [
  "--worker",
  "--services",
  "--storage",
  "--ai",
  "--runtime",
  "--network-local",
  "--inspect-db",
];
let failed = false;
async function check(label: string, operation: () => Promise<void>) {
  try {
    await operation();
    console.log(`PASS ${label}`);
  } catch {
    failed = true;
    console.error(
      `FAIL ${label}; inspect configuration/provider status without logging secrets`,
    );
  }
}
function requireCheck(value: unknown) {
  if (!value) throw new Error("Probe failed");
}
async function fetchProbe(url: string) {
  return fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
}
async function status(url: string) {
  const response = await fetchProbe(url);
  await response.body?.cancel();
  return response.status;
}

async function main() {
  if (
    [...flags].some((flag) => !allowed.includes(flag)) ||
    (flags.has("--worker") && (flags.has("--storage") || flags.has("--ai")))
  )
    throw new Error("Invalid probe flags");
  if (flags.has("--network-local")) {
    if (flags.size !== 1) throw new Error("Run network-local separately");
    for (const key of ["DATABASE_URL", "REDIS_URL"] as const) {
      const outcome = await networkCheck(process.env[key], true);
      console.log(`${key}: ${outcome}`);
      if (outcome === "requires_rumpty_network") process.exitCode = 2;
      else if (outcome !== "resolved") failed = true;
    }
    console.log(
      "DNS diagnosis only; no authentication, migration or production acceptance performed.",
    );
    return;
  }
  let env;
  try {
    env = deploymentEnv(process.env, flags.has("--worker") ? "worker" : "web");
  } catch (error) {
    failed = true;
    console.error(
      error instanceof Error
        ? error.message
        : "Invalid deployment configuration",
    );
    return;
  }
  console.log("PASS production configuration (values withheld)");
  if (flags.has("--inspect-db")) {
    await check(
      "database inspection (read-only; run from Rumpty private network)",
      async () => {
        const db = getDb();
        const tables = await db.$queryRaw<
          { table_name: string }[]
        >`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`;
        const hasHistory = tables.some(
          (row) => row.table_name === "_prisma_migrations",
        );
        console.log(
          JSON.stringify({
            publicTables: tables.length,
            migrationHistoryPresent: hasHistory,
            emptyPublicSchema: tables.length === 0,
          }),
        );
        if (hasHistory) {
          const state =
            await db.$queryRaw`SELECT count(*)::int AS total, count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS unfinished FROM "_prisma_migrations"`;
          console.log(JSON.stringify({ migrationState: state }));
        }
        console.log(
          "No changes made. Confirm target identity and backup/baseline requirements before migrate deploy.",
        );
      },
    );
  }
  if (
    !flags.has("--services") &&
    !flags.has("--storage") &&
    !flags.has("--ai") &&
    !flags.has("--runtime")
  )
    return;
  if (flags.has("--services")) {
    await check(
      "PostgreSQL connectivity and committed migration checksums",
      async () => {
        const db = getDb();
        await db.$queryRaw`SELECT 1`;
        const rows = await db.$queryRaw<
          {
            migration_name: string;
            checksum: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }[]
        >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"`;
        const directories = (
          await readdir("prisma/migrations", { withFileTypes: true })
        ).filter((item) => item.isDirectory());
        const applied = rows.filter((row) => !row.rolled_back_at);
        requireCheck(
          applied.length === directories.length &&
            applied.every((row) => row.finished_at),
        );
        for (const directory of directories) {
          const hash = createHash("sha256")
            .update(
              await readFile(
                `prisma/migrations/${directory.name}/migration.sql`,
              ),
            )
            .digest("hex");
          requireCheck(
            applied.some(
              (row) =>
                row.migration_name === directory.name && row.checksum === hash,
            ),
          );
        }
      },
    );
    await check(
      "Redis configured connection/write/read/TTL/Lua/delete",
      async () => {
        const redis = getRedis(),
          key = `treviqo:deployment-probe:${randomUUID()}`;
        try {
          await redis.set(key, "synthetic", "EX", 30, "NX");
          requireCheck((await redis.get(key)) === "synthetic");
          requireCheck(
            Number(
              await redis.eval("return redis.call('TTL',KEYS[1])", 1, key),
            ) > 0,
          );
        } finally {
          await redis.del(key);
        }
      },
    );
    if (!flags.has("--worker"))
      await check(
        "private bucket connectivity (policy checked separately)",
        () => getObjectStorage().checkConnection(),
      );
  }
  if (flags.has("--storage")) {
    await check(
      "S3 synthetic private write/read/sign/tamper/expiry/delete",
      async () => {
        const probeId = randomUUID(),
          key = `deployment-probes/${probeId}.txt`;
        console.log(`Storage probe ID: ${probeId}`); // Allows operator cleanup after ambiguous PUT/deletion failure.
        const bytes = Buffer.from(
          "Treviqo synthetic deployment probe; no personal data.\n",
        );
        let removed = false;
        try {
          await getObjectStorage().put(key, bytes, "text/plain");
          requireCheck(
            (await getObjectStorage().read(key, 1024)).equals(bytes),
          );
          const signed = await getObjectStorage().signDownload(
            key,
            "probe.txt",
            "text/plain",
            60,
          );
          const response = await fetchProbe(signed);
          requireCheck(response.status === 200);
          requireCheck(Buffer.from(await response.arrayBuffer()).equals(bytes));
          requireCheck(
            response.headers.get("content-disposition")?.includes("attachment"),
          );
          const unsigned = new URL(signed);
          unsigned.search = "";
          requireCheck([401, 403, 404].includes(await status(unsigned.href)));
          const tampered = new URL(signed);
          tampered.searchParams.set("X-Amz-Signature", "0".repeat(64));
          requireCheck([401, 403, 404].includes(await status(tampered.href)));
          const expiring = await getObjectStorage().signDownload(
            key,
            "probe.txt",
            "text/plain",
            2,
          );
          await setTimeout(3500);
          requireCheck([401, 403, 404].includes(await status(expiring)));
          await getObjectStorage().remove(key);
          removed = true;
          requireCheck([403, 404].includes(await status(signed)));
        } finally {
          if (!removed) await getObjectStorage().remove(key);
        }
      },
    );
  }
  if (flags.has("--ai")) {
    console.log(
      `AI synthetic evaluation: ${PROMPT_VERSION}/${SCHEMA_VERSION}; at most 12 inference calls; no automatic retries`,
    );
    for (const type of supportedTypes)
      await check(
        `AI ${type} classification/schema/grounded fixture values`,
        async () => {
          const fixture = JSON.parse(
            await readFile(`tests/fixtures/intelligence/${type}.json`, "utf8"),
          ) as {
            text: string;
            fields: Record<string, { value: string | null }>;
          };
          const ai = getDocumentAI(),
            started = Date.now();
          const classification = parseClassification(
            await ai.complete(classificationPrompt(fixture.text)),
            fixture.text,
          );
          requireCheck(
            classification.type === type &&
              ["high", "medium"].includes(classification.confidence),
          );
          const fields = parseFields(
            await ai.complete(extractionPrompt(fixture.text, type)),
            type,
            fixture.text,
          );
          // Strict acceptance fixture, not an assumption that real models reproduce fixture-server responses.
          const expected = Object.entries(fixture.fields).filter(
            ([key, value]) =>
              key !== "entries_complete" && value.value !== null,
          );
          const matches = expected.filter(([key, expected]) =>
            fields.some(
              (field) =>
                field.key === key &&
                field.value &&
                normalizeEvidence(field.value) ===
                  normalizeEvidence(expected.value!) &&
                ["high", "medium"].includes(field.confidence),
            ),
          );
          console.log(
            `AI ${type}: ${matches.length}/${expected.length} expected grounded values; ${Date.now() - started}ms`,
          );
          requireCheck(
            expected.length > 0 && matches.length === expected.length,
          );
        },
      );
  }
  if (flags.has("--runtime")) {
    await check("worker heartbeat and durable job progress", async () => {
      requireCheck(await workerHealthy());
    });
    if (!flags.has("--worker")) {
      await check("public HTTPS liveness", async () => {
        await verifyHealthResponse(
          await fetchProbe(`${env.APP_URL.replace(/\/$/, "")}/api/health`),
          "ok",
        );
      });
      await check("public HTTPS readiness", async () => {
        await verifyHealthResponse(
          await fetchProbe(`${env.APP_URL.replace(/\/$/, "")}/api/ready`),
          "ready",
        );
      });
    }
  }
}
try {
  await main();
} catch {
  failed = true;
  console.error(
    "FAIL deployment configuration or probe setup; verify required variable names and command flags. Values withheld.",
  );
} finally {
  // Do not initialize missing clients just to clean up a failed configuration check.
  if (
    flags.has("--services") ||
    flags.has("--runtime") ||
    flags.has("--inspect-db")
  ) {
    try {
      await getDb().$disconnect();
    } catch {
      /* safe cleanup */
    }
    try {
      getRedis().disconnect();
    } catch {
      /* safe cleanup */
    }
  }
}
if (failed) process.exitCode = 1;
