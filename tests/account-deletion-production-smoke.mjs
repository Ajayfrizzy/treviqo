// Run with node --conditions=react-server after building the worker.
// Only run against the local standalone app with disposable PostgreSQL/Redis
// and the test TLS S3 fixture. Never target deployed accounts or live storage.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "25432");
assert.equal(database.pathname, "/treviqo_test");
const base = "http://127.0.0.1:3200",
  origin = "https://treviqo.test";
const db = new PrismaClient(),
  cookies = new Map();
const email = `account-smoke-${randomUUID()}@example.test`,
  password = "Synthetic delete smoke 7!";
let documentId, deniedPath;
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
    headers: {
      origin,
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...options.headers,
    },
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0],
      at = pair.indexOf("=");
    cookies.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
const json = (body, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const deny = async (denied) => {
  const result = await fetch("https://127.0.0.1:3197/__test/delete-failure", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer fixture-admin",
    },
    body: JSON.stringify({ path: deniedPath, denied }),
  });
  assert.equal(result.status, 200);
};
try {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal(
    (await request("/api/register", json({ email, password }))).status,
    201,
  );
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password, csrfToken, json: "true" }),
  });
  assert.equal((await request("/api/me")).status, 200);
  const copied = [...cookies]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  await db.authSession.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60000) },
  });
  const employment = await request(
    "/api/employments",
    json({
      employerName: "Synthetic",
      roleTitle: "Worker",
      startDate: "2026-01-01",
    }),
  );
  assert.equal(employment.status, 201);
  const employmentId = (await employment.json()).employment.id;
  const upload = await request(`/api/documents?employmentId=${employmentId}`, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "x-file-name": "fixture.pdf",
    },
    body: readFileSync("tests/fixtures/document.pdf"),
  });
  assert.equal(upload.status, 201);
  documentId = (await upload.json()).document.id;
  const doc = await db.employmentDocument.findUniqueOrThrow({
    where: { id: documentId },
  });
  deniedPath = "/private/" + doc.objectKey;
  assert.equal(
    (
      await request(
        "/api/account",
        json({ password: "wrong", confirmation: "DELETE" }, "DELETE"),
      )
    ).status,
    403,
  );
  await deny(true);
  const success = await request(
    "/api/account",
    json({ password, confirmation: "DELETE" }, "DELETE"),
  );
  assert.equal(success.status, 202);
  const scheduled = await success.json();
  assert.equal(scheduled.status, "scheduled");
  assert.ok(await db.user.findUnique({ where: { id: user.id } }));
  assert.equal((await request("/api/me")).status, 401);
  const { accountDeletionService } =
    await import("../dist-worker/modules/account/service.js");
  const cleanup = accountDeletionService(db);
  assert.equal(await cleanup.processDue(), false);
  await cleanup.processDue(new Date(scheduled.deletionScheduledFor));
  const failed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(failed.deletionStartedAt);
  assert.equal(failed.deletionAttempts, 1);
  await deny(false);
  await cleanup.processDue(failed.deletionRetryAt);
  assert.ok(
    success.headers
      .getSetCookie()
      .some(
        (value) =>
          value.startsWith("__Secure-next-auth.session-token=") &&
          value.includes("Max-Age=0"),
      ),
  );
  assert.equal(await db.user.findUnique({ where: { id: user.id } }), null);
  assert.equal(await db.authSession.count({ where: { userId: user.id } }), 0);
  assert.equal(
    await db.employmentDocument.count({ where: { userId: user.id } }),
    0,
  );
  assert.equal(
    (await fetch(base + "/api/me", { headers: { cookie: copied } })).status,
    401,
  );
  assert.equal(
    (
      await fetch("https://127.0.0.1:3197" + deniedPath, {
        headers: { authorization: "Bearer fixture" },
      })
    ).status,
    404,
  );
  documentId = undefined;
  console.log(
    "PASS: standalone scheduled deletion, password rejection, grace period, TLS worker purge/retry, all-session revocation, Secure-cookie clearing and User-last cleanup.",
  );
} finally {
  if (deniedPath) await deny(false);
  if (documentId)
    await request(`/api/documents/${documentId}`, { method: "DELETE" });
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    await db.auditEvent.deleteMany({ where: { userId: user.id } });
    await db.employmentDocument.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
}
