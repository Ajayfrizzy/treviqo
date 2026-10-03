import { afterAll, beforeAll, expect, it } from "vitest";
import { getDb } from "@/server/db/client";
import { createEmployment, getEmployment, listEmployments, updateEmployment } from "@/modules/employments/service";
const db = getDb();
let a: string; let b: string; let employmentId: string;
const details = { employerName: "Example Ltd", roleTitle: "Engineer", startDate: "2024-02-29" };
beforeAll(async () => { a = (await db.user.create({ data: {} })).id; b = (await db.user.create({ data: {} })).id; });
it("creates a dated owner-linked record without altering auth data", async () => {
  const record = await createEmployment(a, details); employmentId = record.id;
  expect(record.startDate).toBe("2024-02-29"); expect(record.endDate).toBeNull(); expect(record).not.toHaveProperty("userId");
  expect((await db.employment.findUniqueOrThrow({ where: { id: record.id } })).userId).toBe(a);
  expect(await db.user.findUnique({ where: { id: a } })).not.toBeNull();
});
it("never lists or reads another worker's employment", async () => {
  expect(await listEmployments(b)).toEqual([]); expect(await getEmployment(b, employmentId)).toBeNull();
  expect(await getEmployment(a, employmentId)).toMatchObject(details);
});
it("rejects foreign writes, owner reassignment and invalid dates", async () => {
  expect(await updateEmployment(b, employmentId, { ...details, roleTitle: "Changed" })).toBeNull();
  await expect(updateEmployment(a, employmentId, { ...details, userId: b })).rejects.toThrow();
  await expect(updateEmployment(a, employmentId, { ...details, status: "closed", endDate: "2020-01-01" })).rejects.toThrow();
  expect(await getEmployment(a, employmentId)).toMatchObject(details);
});
it("updates own records and supports history with unknown type/end date", async () => {
  const closed = await updateEmployment(a, employmentId, { ...details, roleTitle: "Senior engineer", status: "closed", endDate: "2025-01-01", employmentType: "contract" });
  expect(closed).toMatchObject({ status: "closed", endDate: "2025-01-01", employmentType: "contract" });
  const current = await createEmployment(a, { ...details, startDate: "2025-02-01" });
  expect((await listEmployments(a)).map(record => record.id)).toEqual([current.id, employmentId]);
  const corrected = await updateEmployment(a, employmentId, { ...details, status: "exiting", endDate: null }); expect(corrected?.endDate).toBeNull();
});
it("enforces the user foreign key and rejects missing identities", async () => {
  await expect(createEmployment("", details)).rejects.toThrow("Authentication required");
  await expect(createEmployment("missing-user", details)).rejects.toThrow();
});
afterAll(async () => { await db.user.deleteMany({ where: { id: { in: [a, b].filter(Boolean) } } }); await db.$disconnect(); });
