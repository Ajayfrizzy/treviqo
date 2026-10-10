// Run inside the production image with disposable PostgreSQL/Redis and HTTPS APP_URL.
// Requests use loopback HTTP only to test the container behind its TLS ingress.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const email = `smoke-${randomUUID()}@example.test`;
const password = `Synthetic fixture ${randomUUID()}`;
const base = "http://127.0.0.1:3000";
const origin = new URL(process.env.APP_URL).origin;
const cookies = new Map();
function remember(response) {
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";")[0];
    const equals = pair.indexOf("=");
    cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
}
async function request(path, options = {}) {
  const response = await fetch(base + path, {
    redirect: "manual",
    ...options,
    headers: {
      origin,
      cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
      ...options.headers,
    },
  });
  remember(response);
  return response;
}
try {
  assert.equal(process.getuid(), 1001);
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/me")).status, 401);
  assert.equal(
    (
      await request("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName: "Fixture",
          lastName: "Worker",
        }),
      })
    ).status,
    201,
  );
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  const login = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      json: "true",
      callbackUrl: origin,
    }),
  });
  assert.equal(login.status, 200);
  const sessionHeader = login.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-next-auth.session-token="));
  assert.ok(sessionHeader);
  assert.match(sessionHeader, /; Secure/i);
  assert.match(sessionHeader, /; HttpOnly/i);
  assert.match(sessionHeader, /; SameSite=Lax/i);
  const stolenCookie = cookies.get("__Secure-next-auth.session-token");
  const me = await request("/api/me");
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys((await me.json()).user), ["id"]);
  if (process.env.S3_ENDPOINT) {
    const created = await request("/api/employments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        employerName: "Smoke fixture",
        roleTitle: "Worker",
        startDate: "2024-01-01",
      }),
    });
    assert.equal(created.status, 201);
    const employmentId = (await created.json()).employment.id;
    const pdf = readFileSync(
      process.env.RUMPTY_AI_BASE_URL
        ? "/app/tests/fixtures/intelligence/employment_contract.pdf"
        : "/app/tests/fixtures/document.pdf",
    );
    const uploaded = await request(
      `/api/documents?employmentId=${employmentId}&documentType=employment_contract`,
      {
        method: "POST",
        headers: {
          "content-type": "application/pdf",
          "x-file-name": "fixture.pdf",
        },
        body: pdf,
      },
    );
    assert.equal(uploaded.status, 201);
    const doc = (await uploaded.json()).document;
    assert.equal(doc.status, "ready");
    assert.equal(doc.objectKey, undefined);
    const access = await request(`/api/documents/${doc.id}/access`, {
      method: "POST",
    });
    assert.equal(access.status, 200);
    const { url, expiresIn } = await access.json();
    assert.equal(expiresIn, 60);
    const fetched = await fetch(url);
    assert.equal(fetched.status, 200);
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), pdf);
    const anonymous = new URL(url);
    anonymous.search = "";
    assert.equal((await fetch(anonymous)).status, 403);
    if (process.env.RUMPTY_AI_BASE_URL) {
      const extracted = await request(`/api/documents/${doc.id}/extractions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "ai" }),
      });
      assert.equal(extracted.status, 200);
      const run = (await extracted.json()).extraction;
      assert.equal(run.status, "ready");
      assert.equal(run.sourceKind, "pdf_text");
      const field = run.fields.find((field) => field.key === "employer");
      assert.equal(field.proposedValue, "Harbour Workshop Ltd");
      assert.equal(field.value, null);
      const reviewed = await request(`/api/documents/${doc.id}/extractions`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fieldId: field.id,
          version: 0,
          action: "confirm",
        }),
      });
      assert.equal(reviewed.status, 200);
      assert.equal(
        (await reviewed.json()).extraction.fields.find(
          (item) => item.id === field.id,
        ).reviewState,
        "confirmed",
      );
      console.log(
        "PASS: production PDF subprocess, TLS inference adapter, grounded extraction and confirmed review.",
      );
    }
    assert.equal(
      (await request(`/api/documents/${doc.id}`, { method: "DELETE" })).status,
      200,
    );
    assert.equal(
      await db.documentExtraction.count({ where: { documentId: doc.id } }),
      0,
    );
    assert.equal((await fetch(url)).status, 404);
    assert.equal(
      await db.auditEvent.count({
        where: {
          documentId: doc.id,
          action: {
            in: [
              "document_uploaded",
              "document_access_issued",
              "document_deleted",
            ],
          },
        },
      }),
      3,
    );
    console.log(
      "PASS: production vault upload, private TLS S3 SDK transfer, signed download, anonymous denial, deletion and three audit events.",
    );
  }
  const exitJobResponse = await request("/api/employments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      employerName: "Exit smoke",
      roleTitle: "Worker",
      startDate: "2024-01-01",
    }),
  });
  assert.equal(exitJobResponse.status, 201);
  const exitJob = (await exitJobResponse.json()).employment;
  const answers = {
    exitType: "resignation",
    lastWorkingDate: "2026-10-31",
    noticeDate: "2026-10-01",
    noticeApplicable: "yes",
    noticeRequirement: "30 days",
    pension: "yes",
  };
  const exitResponse = await request("/api/exits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ employmentId: exitJob.id, answers }),
  });
  assert.equal(exitResponse.status, 201);
  const exitCase = (await exitResponse.json()).exitCase;
  assert.equal(exitCase.checklist.length, 9);
  assert.equal(
    exitCase.checklist.find((item) => item.ruleId === "notice").state,
    "complete",
  );
  assert.equal(
    exitCase.checklist.find((item) => item.ruleId === "pension").state,
    "missing",
  );
  const update = {
    version: 0,
    answers: { ...answers, noticeDate: "2026-10-02" },
  };
  const updated = await request(`/api/exits/${exitCase.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  assert.equal(updated.status, 200);
  assert.equal(
    (await updated.json()).exitCase.checklist[0].state,
    "needs_clarification",
  );
  assert.equal(
    (
      await request(`/api/exits/${exitCase.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      })
    ).status,
    409,
  );
  assert.equal(
    await db.auditEvent.count({
      where: {
        exitCaseId: exitCase.id,
        action: { in: ["exit_created", "exit_updated"] },
      },
    }),
    2,
  );
  console.log(
    "PASS: production exit creation, nine deterministic rules, update, stale-edit rejection and audit.",
  );
  const financeUrl = `/api/exits/${exitCase.id}/finance`;
  const financeCommand = (body) =>
    request(financeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const started = await financeCommand({ action: "pension_start" });
  assert.equal(started.status, 200);
  assert.equal((await started.json()).pension.result.state, "waiting");
  const passportUrl = `/api/passport/${exitJob.id}`;
  assert.equal((await request(passportUrl)).status, 404);
  const closedJob = {
    employerName: "Exit smoke",
    roleTitle: "Worker",
    startDate: "2024-01-01",
    endDate: "2026-10-31",
    status: "closed",
  };
  assert.equal(
    (
      await request(`/api/employments/${exitJob.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(closedJob),
      })
    ).status,
    200,
  );
  assert.equal((await request(passportUrl)).status, 200);
  assert.ok(
    (await (await request("/api/passport")).json()).entries.some(
      (entry) => entry.id === exitJob.id,
    ),
  );
  if (process.env.S3_ENDPOINT && process.env.RUMPTY_AI_BASE_URL) {
    const sources = {};
    for (const type of ["payslip", "final_settlement", "pension_statement"]) {
      const uploaded = await request(
        `/api/documents?employmentId=${exitJob.id}&documentType=${type}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/pdf",
            "x-file-name": `${type}.pdf`,
          },
          body: readFileSync(`/app/tests/fixtures/intelligence/${type}.pdf`),
        },
      );
      assert.equal(uploaded.status, 201);
      const doc = (await uploaded.json()).document;
      const extracted = await request(`/api/documents/${doc.id}/extractions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "ai" }),
      });
      assert.equal(extracted.status, 200);
      const run = (await extracted.json()).extraction;
      assert.equal(run.status, "ready");
      assert.equal(run.documentType, type);
      for (const field of run.fields) {
        if (field.key === "document_type") continue;
        const value =
          field.key === "entries_complete"
            ? "yes"
            : field.key === "pay_period"
              ? "2026-10"
              : field.key === "contribution_1_employer"
                ? "Exit smoke"
                : null;
        if (!field.proposedValue && !value) continue;
        assert.equal(
          (
            await request(`/api/documents/${doc.id}/extractions`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                fieldId: field.id,
                version: 0,
                action: value ? "correct" : "confirm",
                ...(value ? { value } : {}),
              }),
            })
          ).status,
          200,
        );
      }
      sources[type] = { doc, run };
    }
    const expected = sources.payslip.run.fields.find(
      (f) => f.key === "gross_pay",
    );
    const actual = sources.final_settlement.run.fields.find(
      (f) => f.key === "final_salary",
    );
    const comparison = await financeCommand({
      action: "settlement_save",
      item: {
        category: "final_salary",
        label: "Fixture salary",
        documentId: sources.final_settlement.doc.id,
        expectedFieldId: expected.id,
        expectedFieldVersion: 1,
        actualFieldId: actual.id,
        actualFieldVersion: 1,
        expectedPeriod: "2026-10",
        actualPeriod: "2026-10",
      },
    });
    assert.equal(comparison.status, 200);
    assert.equal((await comparison.json()).items[0].result.state, "consistent");
    const matched = await financeCommand({
      action: "pension_save",
      input: {
        version: 0,
        targetPeriod: "2026-10",
        statementRunId: sources.pension_statement.run.id,
        expectedFieldId: null,
        expectedFieldVersion: null,
        followUpDate: "2026-12-01",
      },
    });
    assert.equal(matched.status, 200);
    const pension = (await matched.json()).pension;
    assert.equal(pension.result.state, "contribution_detected");
    const confirmed = await financeCommand({
      action: "pension_confirm",
      version: pension.version,
      evidenceToken: pension.evidenceToken,
    });
    assert.equal(confirmed.status, 200);
    assert.equal((await confirmed.json()).pension.result.state, "confirmed");
    const passport = await (await request(passportUrl)).json();
    assert.equal(passport.pension.state, "confirmed");
    assert.equal(passport.pension.provider, "Fixture Pensions");
    const providerField = sources.pension_statement.run.fields.find(
      (field) => field.key === "provider",
    );
    const assessment = {
      category: "pension",
      classification: "portable",
      version: null,
      contextToken: passport.contextToken,
      documentId: sources.pension_statement.doc.id,
      fieldId: providerField.id,
      fieldVersion: 1,
      evidenceAcknowledged: true,
    };
    const assessed = await request(passportUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", input: assessment }),
    });
    assert.equal(assessed.status, 200);
    assert.equal(
      (await assessed.json()).benefits.find(
        (item) => item.category === "pension",
      ).classification,
      "portable",
    );
    for (const { doc } of Object.values(sources))
      assert.equal(
        (await request(`/api/documents/${doc.id}`, { method: "DELETE" }))
          .status,
        200,
      );
    const stale = await (await request(financeUrl)).json();
    assert.equal(stale.items[0].result.state, "needs_clarification");
    assert.equal(stale.pension.result.state, "needs_clarification");
    const stalePassport = await (await request(passportUrl)).json();
    assert.equal(stalePassport.pension.state, "needs_clarification");
    assert.equal(
      stalePassport.benefits.find((item) => item.category === "pension")
        .classification,
      "unknown",
    );
    assert.equal(
      await db.auditEvent.count({
        where: { employmentId: exitJob.id, action: "benefit_saved" },
      }),
      1,
    );
    console.log(
      "PASS: production Passport derivation, current pension confirmation, benefit assessment/audit and stale-evidence invalidation.",
    );
    console.log(
      "PASS: production settlement/pension PDF extraction, reviewed comparisons, explicit confirmation and deleted-evidence invalidation.",
    );
  }
  assert.equal(
    (
      await request(`/api/employments/${exitJob.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...closedJob, status: "active", endDate: null }),
      })
    ).status,
    200,
  );
  assert.equal((await request(passportUrl)).status, 404);
  if (process.env.WORKER_REQUIRED === "true") {
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    const expired = await db.authSession.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    await db.exitCase.update({
      where: { id: exitCase.id },
      data: {
        createdAt: new Date(Date.now() - 8 * 86400000),
        updatedAt: new Date(Date.now() - 8 * 86400000),
      },
    });
    await db.backgroundJob.updateMany({ data: { dueAt: new Date() } });
    let reminders = [];
    for (let attempt = 0; attempt < 40; attempt++) {
      reminders =
        (await (await request("/api/reminders")).json()).reminders ?? [];
      if (
        reminders.length &&
        !(await db.authSession.findUnique({ where: { id: expired.id } }))
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(reminders.length);
    assert.equal(
      await db.authSession.findUnique({ where: { id: expired.id } }),
      null,
    );
    assert.equal((await request("/api/me")).status, 200);
    assert.equal((await request("/api/ready")).status, 200);
    const reminder = reminders[0];
    assert.equal(
      (
        await request("/api/reminders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: reminder.id,
            version: reminder.version,
            action: "snooze",
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      await db.auditEvent.count({
        where: { reminderId: reminder.id, action: "reminder_snoozed" },
      }),
      1,
    );
    console.log(
      "PASS: production worker reminders, snooze/audit, expired-session cleanup, live-session preservation and readiness.",
    );
  }
  const logout = await request("/api/auth/signout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      json: "true",
      callbackUrl: `${origin}/sign-in`,
    }),
  });
  assert.equal(logout.status, 200);
  cookies.set("__Secure-next-auth.session-token", stolenCookie);
  assert.equal((await request("/api/me")).status, 401);
  assert.equal((await request(`/api/exits/${exitCase.id}`)).status, 401);
  assert.equal((await request(financeUrl)).status, 401);
  assert.equal((await request(passportUrl)).status, 401);
  console.log(
    "PASS: non-root runtime, registration/Argon2, credentials login, Secure/HttpOnly/SameSite cookies, protected API, logout and copied-cookie rejection.",
  );
} finally {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    await db.auditEvent.deleteMany({ where: { userId: user.id } });
    await db.employmentDocument.deleteMany({ where: { userId: user.id } });
  }
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
}
