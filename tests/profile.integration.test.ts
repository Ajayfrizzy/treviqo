import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { getDb } from "@/server/db/client";
import { getRedis } from "@/server/redis/client";
import { getProfile, updateProfile } from "@/modules/profile/service";
import {
  registerUser,
  authenticateCredentials,
} from "@/modules/auth/credentials";
import { hashPassword } from "@/modules/auth/password";
const session = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/modules/auth/session", () => ({ getCurrentUser: session.user }));
import { PATCH } from "@/app/api/profile/route";
const ids: string[] = [];
const password = "Synthetic Profile Password 7!";
let legacyId: string, otherId: string, legacyEmail: string;
beforeAll(async () => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
  vi.stubEnv("SESSION_SECRET", "synthetic-test-secret-at-least-32-characters");
  legacyEmail = `legacy-profile-${randomUUID()}@example.test`;
  legacyId = (
    await getDb().user.create({
      data: { email: legacyEmail, passwordHash: await hashPassword(password) },
    })
  ).id;
  otherId = (
    await getDb().user.create({
      data: { email: `other-profile-${randomUUID()}@example.test` },
    })
  ).id;
  ids.push(legacyId, otherId);
});
afterAll(async () => {
  await getDb().auditEvent.deleteMany({ where: { userId: { in: ids } } });
  await getDb().user.deleteMany({ where: { id: { in: ids } } });
  await getDb().$disconnect();
  getRedis().disconnect();
  vi.unstubAllEnvs();
});
it("keeps nameless existing accounts readable and able to sign in", async () => {
  expect(await getProfile(legacyId)).toEqual({
    email: legacyEmail,
    firstName: null,
    lastName: null,
    preferredName: null,
    country: null,
  });
  expect(
    await authenticateCredentials({ email: legacyEmail, password }),
  ).toEqual({ id: legacyId });
});
it("persists registration details without changing its safe response or password security", async () => {
  const created = await registerUser({
    email: `profile-${randomUUID()}@example.test`,
    password,
    firstName: "Ada",
    lastName: "Okafor",
    preferredName: "Dee",
    country: "NG",
  });
  ids.push(created.id);
  expect(Object.keys(created)).toEqual(["id"]);
  expect(await getProfile(created.id)).toMatchObject({
    firstName: "Ada",
    lastName: "Okafor",
    preferredName: "Dee",
    country: "NG",
  });
  expect(
    (await getDb().user.findUniqueOrThrow({ where: { id: created.id } }))
      .passwordHash,
  ).toMatch(/^\$argon2id\$/);
});
function request(
  body: unknown = { firstName: "Ada", lastName: "Okafor" },
  origin = "http://localhost:3000",
) {
  return new Request("http://localhost:3000/api/profile", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("requires a session and same origin; rejects owner and sensitive-field injection", async () => {
  session.user.mockResolvedValue(null);
  expect((await PATCH(request())).status).toBe(401);
  session.user.mockResolvedValue({ id: legacyId });
  expect((await PATCH(request({}, "https://attacker.test"))).status).toBe(403);
  for (const body of [
    { userId: otherId },
    { email: "changed@example.test" },
    { passwordHash: "changed" },
    { firstName: "x".repeat(81) },
  ])
    expect((await PATCH(request(body))).status).toBe(422);
  expect((await PATCH(request({ firstName: "x".repeat(5000) }))).status).toBe(
    400,
  );
  expect((await getProfile(otherId)).firstName).toBeNull();
});
it("updates only the signed-in profile, audits the edit and does not expose secrets", async () => {
  session.user.mockResolvedValue({ id: legacyId });
  const response = await PATCH(
    request({
      firstName: "Ada",
      lastName: "Okafor",
      preferredName: "Dee",
      country: "NG",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const { profile } = await response.json();
  expect(Object.keys(profile).sort()).toEqual([
    "country",
    "email",
    "firstName",
    "lastName",
    "preferredName",
  ]);
  expect(profile.preferredName).toBe("Dee");
  expect((await getProfile(otherId)).preferredName).toBeNull();
  expect(
    await getDb().auditEvent.count({
      where: { userId: legacyId, action: "profile_updated" },
    }),
  ).toBe(1);
});
it("does not update an account scheduled for deletion", async () => {
  await getDb().user.update({
    where: { id: legacyId },
    data: { deletionScheduledFor: new Date(Date.now() + 86400000) },
  });
  expect(await updateProfile(legacyId, { firstName: "Changed" })).toBeNull();
  expect((await getProfile(legacyId)).firstName).toBe("Ada");
});
