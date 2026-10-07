import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import {
  allowAuthRequest,
  allowCredentialAttempt,
} from "@/modules/auth/rate-limit";
import {
  registerUser,
  authenticateCredentials,
} from "@/modules/auth/credentials";
import {
  createAuthSession,
  isAuthSessionActive,
  revokeAuthSession,
} from "@/modules/auth/session-store";
import { getAuthOptions } from "@/modules/auth/options";
import { randomUUID } from "node:crypto";
const email = `integration-${randomUUID()}@example.test`;
const password = "Only a synthetic test passphrase 7!";
let userId: string;
beforeAll(() => {
  vi.stubEnv(
    "SESSION_SECRET",
    "integration-test-secret-at-least-32-characters",
  );
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
});
it("registers only a password hash, and rejects case-insensitive duplicates", async () => {
  const user = await registerUser({ email, password });
  userId = user.id;
  expect(Object.keys(user)).toEqual(["id"]);
  const row = await getDb().user.findUniqueOrThrow({ where: { id: userId } });
  expect(row.passwordHash).toMatch(/^\$argon2id\$/);
  expect(row.passwordHash).not.toContain(password);
  await expect(
    registerUser({ email: email.toUpperCase(), password }),
  ).rejects.toThrow("Unable to create");
});
it("authenticates correct credentials and rejects incorrect/unknown accounts", async () => {
  expect(await authenticateCredentials({ email, password })).toEqual({
    id: userId,
  });
  expect(
    await authenticateCredentials({
      email,
      password: "An incorrect long passphrase",
    }),
  ).toBeNull();
  expect(
    await authenticateCredentials({ email: `missing-${email}`, password }),
  ).toBeNull();
});
it("checks session ownership, expiry and logout revocation", async () => {
  const session = await createAuthSession(userId);
  expect(await isAuthSessionActive(session.id, userId)).toBe(true);
  expect(await isAuthSessionActive(session.id, "another-user")).toBe(false);
  await revokeAuthSession(session.id);
  expect(await isAuthSessionActive(session.id, userId)).toBe(false);
  const expired = await getDb().authSession.create({
    data: { userId, expiresAt: new Date(0) },
  });
  expect(await isAuthSessionActive(expired.id, userId)).toBe(false);
});
it("does not expose hashes or session references through session serialization", async () => {
  const session = await createAuthSession(userId);
  const callback = getAuthOptions().callbacks!.session!;
  const publicSession = await callback({
    session: { expires: "fixture" },
    token: { sub: userId, sid: session.id },
  } as unknown as Parameters<typeof callback>[0]);
  expect(publicSession).toEqual({ expires: "fixture", user: { id: userId } });
  await revokeAuthSession(session.id);
  const revoked = await callback({
    session: { expires: "fixture" },
    token: { sub: userId, sid: session.id },
  } as unknown as Parameters<typeof callback>[0]);
  expect(revoked.user).toBeUndefined();
});
it("enforces the per-account Redis throttle", async () => {
  const limitedEmail = `limited-${email}`;
  for (let attempt = 0; attempt < 10; attempt++)
    expect(await allowCredentialAttempt(limitedEmail)).toBe(true);
  expect(await allowCredentialAttempt(limitedEmail)).toBe(false);
});
it("connects to Redis", async () => {
  expect(await getRedis().ping()).toBe("PONG");
});
it("bounds authentication requests atomically", async () => {
  const redis = getRedis();
  await redis.del("treviqo:auth:requests");
  try {
    expect(await allowAuthRequest()).toBe(true);
    expect(await redis.ttl("treviqo:auth:requests")).toBeGreaterThan(0);
    await redis.set("treviqo:auth:requests", 300, "EX", 60);
    expect(await allowAuthRequest()).toBe(false);
  } finally {
    await redis.del("treviqo:auth:requests");
  }
});
afterAll(async () => {
  await getDb().user.deleteMany({ where: { email } });
  await getDb().$disconnect();
  getRedis().disconnect();
  vi.unstubAllEnvs();
});

it("keeps existing passphrase accounts usable after the registration policy changes", async () => {
  const { hashPassword } = await import("@/modules/auth/password");
  const legacyPassword = "An older passphrase without numbers";
  const legacyEmail = `legacy-${randomUUID()}@example.test`;
  const user = await getDb().user.create({
    data: {
      email: legacyEmail,
      passwordHash: await hashPassword(legacyPassword),
    },
  });
  try {
    expect(
      await authenticateCredentials({
        email: legacyEmail,
        password: legacyPassword,
      }),
    ).toEqual({ id: user.id });
    await expect(
      registerUser({ email: `new-${legacyEmail}`, password: legacyPassword }),
    ).rejects.toThrow("Unable to create");
  } finally {
    await getDb().user.delete({ where: { id: user.id } });
  }
});
