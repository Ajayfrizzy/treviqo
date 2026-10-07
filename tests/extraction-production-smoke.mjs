// Production-build smoke against disposable loopback services and TLS fixtures only.
// The running app must use the same fixture configuration. Never point it at Rumpty.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const base = "http://127.0.0.1:3200",
  origin = "https://treviqo.test";
assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
assert.equal(new URL(process.env.DATABASE_URL).port, "25432");
assert.equal(new URL(process.env.DATABASE_URL).pathname, "/treviqo_test");
const db = new PrismaClient(),
  cookies = new Map();
const email = `extraction-smoke-${randomUUID()}@example.test`,
  password = "Synthetic smoke passphrase 7!";
const fixture = JSON.parse(
  readFileSync("tests/fixtures/intelligence/employment_contract.json", "utf8"),
);
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(65000),
    headers: {
      origin,
      cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...options.headers,
    },
  });
  for (const item of response.headers.getSetCookie()) {
    const pair = item.split(";")[0],
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
let documentId;
try {
  assert.equal((await request("/api/health")).status, 200);
  assert.equal(
    (await request("/api/documents/unknown/extractions")).status,
    401,
  );
  assert.equal(
    (await request("/api/register", json({ email, password }))).status,
    201,
  );
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });
  assert.equal((await request("/api/me")).status, 200);
  const employmentResponse = await request(
    "/api/employments",
    json({
      employerName: "Original employer",
      roleTitle: "Worker",
      startDate: "2024-01-01",
    }),
  );
  assert.equal(employmentResponse.status, 201);
  const employmentId = (await employmentResponse.json()).employment.id;
  const upload = await request(`/api/documents?employmentId=${employmentId}`, {
    method: "POST",
    headers: {
      "content-type": "application/pdf",
      "x-file-name": "synthetic-contract.pdf",
    },
    body: readFileSync("tests/fixtures/intelligence/employment_contract.pdf"),
  });
  assert.equal(upload.status, 201);
  documentId = (await upload.json()).document.id;
  const path = `/api/documents/${documentId}/extractions`;
  // Actual PDF subprocess -> TLS classification -> TLS sparse extraction -> persistence.
  const response = await request(path, json({ mode: "ai" }));
  assert.equal(response.status, 200);
  const run = (await response.json()).extraction;
  assert.equal(run.status, "ready");
  assert.equal(run.schemaVersion, "fields-v3");
  assert.equal(run.sourceKind, "pdf_text");
  assert.ok(
    run.fields.every((f) => f.value === null && f.reviewState === "proposed"),
  );
  const employer = run.fields.find((f) => f.key === "employer");
  assert.equal(employer.proposedValue, "Harbour Workshop Ltd");
  assert.equal(
    (
      await request(
        path,
        json(
          {
            fieldId: employer.id,
            version: employer.version,
            action: "confirm",
          },
          "PATCH",
        ),
      )
    ).status,
    200,
  );
  for (const [marker, code] of [
    ["FIXTURE_UNAVAILABLE", "unavailable"],
    ["FIXTURE_MALFORMED", "malformed"],
  ]) {
    const failed = await request(
      path,
      json({
        mode: "ai",
        type: "employment_contract",
        text: fixture.text + "\n" + marker,
      }),
    );
    assert.equal(failed.status, 200);
    const extraction = (await failed.json()).extraction;
    assert.equal(extraction.status, "failed");
    assert.equal(extraction.errorCode, code);
    assert.equal(extraction.fields.length, 0);
  }
  const manualResponse = await request(
    path,
    json({ mode: "manual", type: "employment_contract" }),
  );
  assert.equal(manualResponse.status, 200);
  const manual = (await manualResponse.json()).extraction;
  assert.equal(manual.status, "ready");
  assert.ok(
    manual.fields.every((f) => f.value === null && f.proposedValue === null),
  );
  const previous = (await (await request(path + "?runId=" + run.id)).json())
    .extraction;
  assert.equal(
    previous.fields.find((f) => f.key === "employer").reviewState,
    "confirmed",
  );
  assert.equal(
    (await request(`/api/documents/${documentId}`, { method: "DELETE" }))
      .status,
    200,
  );
  documentId = undefined;
  console.log(
    "PASS: production build, auth, PDF preparation, TLS sparse inference, proposed-only values, explicit confirmation, provider 503/malformed fallback, manual entry and preserved reviews.",
  );
} finally {
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
