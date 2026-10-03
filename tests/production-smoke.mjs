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
    const pair = value.split(";")[0]; const equals = pair.indexOf("=");
    cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
  }
}
async function request(path, options = {}) {
  const response = await fetch(base + path, { redirect: "manual", ...options, headers: { origin, cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...options.headers } });
  remember(response); return response;
}
try {
  assert.equal(process.getuid(), 1001);
  assert.equal((await request("/api/health")).status, 200);
  assert.equal((await request("/api/me")).status, 401);
  assert.equal((await request("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) })).status, 201);
  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  const login = await request("/api/auth/callback/credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, json: "true", callbackUrl: origin }) });
  assert.equal(login.status, 200);
  const sessionHeader = login.headers.getSetCookie().find(value => value.startsWith("__Secure-next-auth.session-token="));
  assert.ok(sessionHeader); assert.match(sessionHeader, /; Secure/i); assert.match(sessionHeader, /; HttpOnly/i); assert.match(sessionHeader, /; SameSite=Lax/i);
  const stolenCookie = cookies.get("__Secure-next-auth.session-token");
  const me = await request("/api/me"); assert.equal(me.status, 200); assert.deepEqual(Object.keys((await me.json()).user), ["id"]);
  if (process.env.S3_ENDPOINT) {
    const created = await request("/api/employments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employerName: "Smoke fixture", roleTitle: "Worker", startDate: "2024-01-01" }) });
    assert.equal(created.status, 201); const employmentId = (await created.json()).employment.id;
    const pdf = readFileSync("/app/tests/fixtures/document.pdf");
    const uploaded = await request(`/api/documents?employmentId=${employmentId}&documentType=employment_contract`, { method: "POST", headers: { "content-type": "application/pdf", "x-file-name": "fixture.pdf" }, body: pdf });
    assert.equal(uploaded.status, 201); const doc = (await uploaded.json()).document;
    assert.equal(doc.status, "ready"); assert.equal(doc.objectKey, undefined);
    const access = await request(`/api/documents/${doc.id}/access`, { method: "POST" });
    assert.equal(access.status, 200); const { url, expiresIn } = await access.json(); assert.equal(expiresIn, 60);
    const fetched = await fetch(url); assert.equal(fetched.status, 200); assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), pdf);
    const anonymous = new URL(url); anonymous.search = ""; assert.equal((await fetch(anonymous)).status, 403);
    assert.equal((await request(`/api/documents/${doc.id}`, { method: "DELETE" })).status, 200);
    assert.equal((await fetch(url)).status, 404);
    assert.equal(await db.auditEvent.count({ where: { documentId: doc.id } }), 3);
    console.log("PASS: production vault upload, private TLS S3 SDK transfer, signed download, anonymous denial, deletion and three audit events.");
  }
  const logout = await request("/api/auth/signout", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, json: "true", callbackUrl: `${origin}/sign-in` }) });
  assert.equal(logout.status, 200);
  cookies.set("__Secure-next-auth.session-token", stolenCookie);
  assert.equal((await request("/api/me")).status, 401);
  console.log("PASS: non-root runtime, registration/Argon2, credentials login, Secure/HttpOnly/SameSite cookies, protected API, logout and copied-cookie rejection.");
} finally {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await db.auditEvent.deleteMany({ where: { userId: user.id } });
    await db.employmentDocument.deleteMany({ where: { userId: user.id } });
  }
  await db.user.deleteMany({ where: { email } });
  await db.$disconnect();
}
