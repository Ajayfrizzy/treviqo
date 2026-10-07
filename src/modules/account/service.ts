import "server-only";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  getObjectStorage,
  type PrivateObjectStorage,
} from "@/server/storage/client";
import { verifyPassword, verifyMissingPassword } from "@/modules/auth/password";
import { allowCredentialAttempt } from "@/modules/auth/rate-limit";
import { AccountDeletionError, deleteAccountSchema } from "./shared";

// A bounded batch avoids an unbounded synchronous deletion request. Continuation
// requires the same authentication, password and explicit confirmation again.
const batchSize = 3;
export function accountDeletionService(
  db: PrismaClient = getDb(),
  dependencies: {
    storage?: () => Pick<PrivateObjectStorage, "purge">;
    allow?: typeof allowCredentialAttempt;
  } = {},
) {
  return {
    async remove(
      userId: string,
      raw: unknown,
    ): Promise<{ status: "deleted" | "pending" }> {
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
      if (!account?.passwordHash) {
        await verifyMissingPassword(input.password);
        throw new AccountDeletionError(
          "Your current password could not be verified.",
          403,
        );
      }
      if (!(await verifyPassword(account.passwordHash, input.password)))
        throw new AccountDeletionError(
          "Your current password could not be verified.",
          403,
        );

      await db.$transaction(async (tx) => {
        // Same row lock as upload reservation/PUT. No upload can start after intent.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true, deletionStartedAt: true },
        });
        // A concurrent, already-authenticated deletion may have finished.
        if (!current) return;
        if (current.passwordHash !== account.passwordHash)
          throw new AccountDeletionError(
            "Your account changed. Sign in again before deleting it.",
            409,
          );
        if (
          await tx.employmentDocument.count({
            where: { userId, status: { in: ["uploaded", "processing"] } },
          })
        )
          throw new AccountDeletionError(
            "An upload is unfinished. Let it finish, or remove its failed/pending entry in Documents before deleting your account. If it stays pending, ask Treviqo support to reconcile the upload first.",
            409,
          );
        await tx.user.update({
          where: { id: userId },
          data: { deletionStartedAt: current.deletionStartedAt ?? new Date() },
        });
        // Includes historically deleted objects: ordinary deletion may have left versions.
        await tx.employmentDocument.updateMany({
          where: { userId },
          data: { status: "deleting" },
        });
      });
      const docs = await db.employmentDocument.findMany({
        where: { userId, storagePurgedAt: null },
        select: { id: true, objectKey: true },
        orderBy: { id: "asc" },
        take: batchSize,
      });
      for (const doc of docs) {
        // No provider exception/body is logged or exposed. Permission failures stop here.
        await (dependencies.storage ?? getObjectStorage)().purge(doc.objectKey);
        await db.employmentDocument.updateMany({
          where: { id: doc.id, userId },
          data: { storagePurgedAt: new Date() },
        });
      }
      return db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
          const current = await tx.user.findUnique({
            where: { id: userId },
            select: { deletionStartedAt: true },
          });
          if (!current) return { status: "deleted" as const };
          if (!current.deletionStartedAt)
            throw new Error("Deletion not reserved");
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
    },
  };
}
