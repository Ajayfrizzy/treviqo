import "server-only";
import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { employmentSchema, type EmploymentInput, type EmploymentRecord } from "./validation";
// Explicit projection: no user credentials, session values or ownership changes cross this boundary.
const select = { id: true, employerName: true, roleTitle: true, startDate: true, endDate: true, employmentType: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.EmploymentSelect;
type Row = Prisma.EmploymentGetPayload<{ select: typeof select }>;
function serialize(row: Row): EmploymentRecord {
  return { ...row, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate?.toISOString().slice(0, 10) ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
function requireOwner(userId: string) { if (!userId) throw new Error("Authentication required"); }
function data(input: EmploymentInput) {
  return { ...input, startDate: new Date(`${input.startDate}T00:00:00.000Z`), endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null };
}
export async function listEmployments(userId: string) {
  requireOwner(userId);
  return (await getDb().employment.findMany({ where: { userId }, orderBy: [{ startDate: "desc" }, { id: "asc" }], select })).map(serialize);
}
export async function getEmployment(userId: string, id: string) {
  requireOwner(userId);
  const row = await getDb().employment.findFirst({ where: { userId, id }, select });
  return row ? serialize(row) : null;
}
export async function createEmployment(userId: string, input: unknown) {
  requireOwner(userId);
  const parsed = employmentSchema.parse(input);
  return serialize(await getDb().employment.create({ data: { ...data(parsed), userId }, select }));
}
export async function updateEmployment(userId: string, id: string, input: unknown) {
  requireOwner(userId);
  const parsed = employmentSchema.parse(input);
  try {
    // Ownership is part of the write predicate, not a separate read-before-write check.
    return serialize(await getDb().employment.update({ where: { id, userId }, data: data(parsed), select }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
    throw error;
  }
}
