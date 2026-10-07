import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  getObjectStorage,
  type PrivateObjectStorage,
} from "@/server/storage/client";
import { verifyPassword, verifyMissingPassword } from "@/modules/auth/password";
import { allowCredentialAttempt } from "@/modules/auth/rate-limit";
import { retryDelay } from "@/server/jobs/queue";
import {
  AccountDeletionError,
  deleteAccountSchema,
  deletionDeadline,
} from "./shared";

export function accountDeletionService(
  db: PrismaClient = getDb(),
  dependencies: {
    storage?: () => Pick<PrivateObjectStorage, "purge">;
    allow?: typeof allowCredentialAttempt;
    clock?: () => Date;
  } = {},
) {
  const clock = dependencies.clock ?? (() => new Date());
  async function cleanup(userId: string, now = clock()) {
    const reserved = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) return "deleted" as const;
      if (!user.deletionScheduledFor || user.deletionScheduledFor > now)
        return "not_due" as const;
      await tx.user.update({
        where: { id: userId },
        data: { deletionStartedAt: user.deletionStartedAt ?? now },
      });
      await tx.authSession.deleteMany({ where: { userId } });
      await tx.employmentDocument.updateMany({
        where: { userId },
        data: { status: "deleting" },
      });
      return "deleting" as const;
    });
    if (reserved !== "deleting") return { status: reserved };
    const docs = await db.employmentDocument.findMany({
      where: { userId, storagePurgedAt: null },
      select: { id: true, objectKey: true },
      orderBy: { id: "asc" },
      take: 3,
    });
    for (const doc of docs) {
      await (dependencies.storage ?? getObjectStorage)().purge(doc.objectKey);
      await db.employmentDocument.updateMany({
        where: { id: doc.id, userId },
        data: { storagePurgedAt: clock() },
      });
    }
    return db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) return { status: "deleted" as const };
        if (!user.deletionStartedAt) throw new Error("Deletion not reserved");
        if (
          await tx.employmentDocument.count({
            where: { userId, storagePurgedAt: null },
          })
        )
          return { status: "pending" as const };
        // Explicit child-first order; User/Employment document and audit FKs restrict deletion.
        await tx.authSession.deleteMany({ where: { userId } });
        await tx.reminder.deleteMany({ where: { userId } });
        await tx.settlementItem.deleteMany({ where: { userId } });
        await tx.pensionVerification.deleteMany({ where: { userId } });
        await tx.benefit.deleteMany({ where: { userId } });
        await tx.exitCase.deleteMany({ where: { userId } });
        await tx.extractionFieldRevision.deleteMany({
          where: { field: { extraction: { userId } } },
        });
        await tx.extractedField.deleteMany({
          where: { extraction: { userId } },
        });
        await tx.documentExtraction.deleteMany({ where: { userId } });
        await tx.employmentDocument.deleteMany({ where: { userId } });
        await tx.auditEvent.deleteMany({ where: { userId } });
        await tx.employment.deleteMany({ where: { userId } });
        await tx.user.delete({ where: { id: userId } });
        return { status: "deleted" as const };
      },
      { isolationLevel: "Serializable", timeout: 10000 },
    );
  }
  return {
    async schedule(userId: string, raw: unknown) {
      if (!userId)
        throw new AccountDeletionError("Sign in to delete your account.", 401);
      const input = deleteAccountSchema.parse(raw);
      const account = await db.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true, email: true },
      });
      if (
        !(await (dependencies.allow ?? allowCredentialAttempt)(
          account?.email ?? userId,
        ))
      )
        throw new AccountDeletionError(
          "Too many password attempts. Wait 15 minutes before trying again.",
          429,
        );
      const verified = account?.passwordHash
        ? await verifyPassword(account.passwordHash, input.password)
        : (await verifyMissingPassword(input.password), false);
      if (!verified || !account)
        throw new AccountDeletionError(
          "Your current password could not be verified.",
          403,
        );
      return db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
          const current = await tx.user.findUnique({ where: { id: userId } });
          if (
            !current ||
            current.passwordHash !== account.passwordHash ||
            current.deletionStartedAt
          )
            throw new AccountDeletionError(
              "Account deletion cannot be scheduled. Sign in again to check its status.",
              409,
            );
          const scheduledFor =
            current.deletionScheduledFor ?? deletionDeadline(clock());
          await tx.user.update({
            where: { id: userId },
            data: {
              deletionScheduledFor: scheduledFor,
              deletionRetryAt: null,
              deletionAttempts: 0,
            },
          });
          await tx.authSession.deleteMany({ where: { userId } });
          if (!current.deletionScheduledFor)
            await tx.auditEvent.create({
              data: { userId, action: "account_deletion_scheduled" },
            });
          return {
            status: "scheduled" as const,
            deletionScheduledFor: scheduledFor.toISOString(),
          };
        },
        { timeout: 10000, maxWait: 50000 },
      );
    },
    cleanup,
    async processDue(now = clock()) {
      const account = await db.user.findFirst({
        where: {
          deletionScheduledFor: { lte: now },
          OR: [{ deletionRetryAt: null }, { deletionRetryAt: { lte: now } }],
        },
        orderBy: [
          { deletionRetryAt: "asc" },
          { deletionScheduledFor: "asc" },
          { id: "asc" },
        ],
        select: { id: true, deletionAttempts: true },
      });
      if (!account) return false;
      try {
        const result = await cleanup(account.id, now);
        if (result.status === "pending")
          await db.user.updateMany({
            where: { id: account.id, deletionStartedAt: { not: null } },
            data: {
              deletionAttempts: 0,
              deletionRetryAt: new Date(
                Math.max(now.getTime(), clock().getTime()),
              ),
            },
          });
      } catch {
        // Durable per-account backoff prevents one failed bucket object from
        // starving other due accounts. No provider internals are persisted.
        await db.user.updateMany({
          where: { id: account.id, deletionScheduledFor: { lte: now } },
          data: {
            deletionAttempts: { increment: 1 },
            deletionRetryAt: new Date(
              Math.max(now.getTime(), clock().getTime()) +
                retryDelay(account.deletionAttempts),
            ),
          },
        });
      }
      return true;
    },
  };
}
