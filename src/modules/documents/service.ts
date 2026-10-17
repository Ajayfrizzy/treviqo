import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import {
  readDatabase,
  transientDatabaseError,
  DatabaseUnavailableError,
} from "@/server/db/retry";
import { UPLOAD_RESERVATION_MS } from "./upload-state";
import { getDb } from "@/server/db/client";
import {
  getObjectStorage,
  type PrivateObjectStorage,
} from "@/server/storage/client";
import {
  DocumentError,
  objectKey,
  uploadMetadata,
  validateFile,
} from "./validation";
import type { DocumentRecord } from "./shared";
const selection = {
  id: true,
  employmentId: true,
  documentType: true,
  originalFilename: true,
  sanitizedFilename: true,
  mimeType: true,
  fileSize: true,
  status: true,
  createdAt: true,
  employment: { select: { employerName: true, roleTitle: true } },
} satisfies Prisma.EmploymentDocumentSelect;
type Row = Prisma.EmploymentDocumentGetPayload<{ select: typeof selection }>;
const serialize = (row: Row): DocumentRecord => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
// Inject only infrastructure: the same orchestration runs against real/fake storage.
export function documentService(
  db: PrismaClient = getDb(),
  storage: () => PrivateObjectStorage = getObjectStorage,
) {
  function owner(userId: string) {
    if (!userId) throw new DocumentError("Sign in to access documents.", 401);
  }
  async function employment(userId: string, id: string) {
    owner(userId);
    if (
      !(await readDatabase(() =>
        db.employment.findFirst({
          where: { id, userId },
          select: { id: true },
        }),
      ))
    )
      throw new DocumentError("Employment record not found.", 404);
  }
  async function find(userId: string, id: string) {
    owner(userId);
    const doc = await readDatabase(() =>
      db.employmentDocument.findFirst({
        where: {
          id,
          userId,
          status: { not: "deleted" },
          employment: { userId },
        },
      }),
    );
    if (!doc) throw new DocumentError("Document not found.", 404);
    return doc;
  }
  return {
    employment,
    async list(userId: string, employmentId?: string) {
      owner(userId);
      if (employmentId) await employment(userId, employmentId);
      return (
        await readDatabase(() =>
          db.employmentDocument.findMany({
            where: {
              userId,
              employmentId,
              status: { not: "deleted" },
              employment: { userId },
            },
            select: selection,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          }),
        )
      ).map(serialize);
    },
    async detail(userId: string, id: string) {
      await find(userId, id);
      const row = await readDatabase(() =>
        db.employmentDocument.findFirst({
          where: { id, userId, status: { not: "deleted" } },
          select: selection,
        }),
      );
      if (!row) throw new DocumentError("Document not found.", 404);
      return serialize(row);
    },
    async upload(
      userId: string,
      metadata: unknown,
      bytes: Buffer,
      filename: string,
      mimeType: string,
      maxBytes: number,
    ) {
      const input = uploadMetadata.parse(metadata);
      owner(userId);
      const { extension, ...file } = validateFile(
        bytes,
        filename,
        mimeType,
        maxBytes,
      );
      const id = randomUUID();
      const key = objectKey(userId, input.employmentId, id, extension);
      let bucket: PrivateObjectStorage;
      try {
        bucket = storage();
      } catch {
        console.error("document_upload_storage_failed");
        throw new DocumentError(
          "The file could not be saved. Please try again.",
          503,
        );
      }
      async function lockUpload(tx: Prisma.TransactionClient) {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { deletionStartedAt: true, deletionScheduledFor: true },
        });
        if (!user || user.deletionStartedAt || user.deletionScheduledFor)
          throw new DocumentError(
            "Your account is disabled for scheduled deletion. New uploads are blocked.",
            409,
          );
      }
      const reservedAt = Date.now();
      try {
        await db.$transaction(async (tx) => {
          await lockUpload(tx);
          if (
            !(await tx.employment.findFirst({
              where: { id: input.employmentId, userId },
              select: { id: true },
            }))
          )
            throw new DocumentError("Employment record not found.", 404);
          await tx.employmentDocument.create({
            data: { id, userId, ...input, ...file, objectKey: key },
          });
        });
      } catch (error) {
        if (transientDatabaseError(error)) {
          console.error("document_upload_db_unavailable");
          throw new DatabaseUnavailableError();
        }
        if (error instanceof DocumentError) throw error;
        console.error("document_upload_reservation_failed");
        throw new DocumentError(
          "The upload could not be started. Please retry.",
          503,
        );
      }
      // No transaction or row lock is held during S3 I/O. Cleanup retains fresh
      // uploaded reservations, including this object's key, until PUT settles.
      try {
        // Do not start a delayed PUT near the cleanup grace deadline.
        if (Date.now() - reservedAt > 60000)
          throw new Error("Upload reservation expired");
        await bucket.put(key, bytes, file.mimeType);
      } catch {
        console.error("document_upload_storage_failed");
        try {
          await storage().remove(key);
        } catch {
          /* Durable key remains for cleanup. */
        }
        try {
          await db.employmentDocument.updateMany({
            where: { id, userId, status: "uploaded" },
            data: { status: "failed" },
          });
        } catch {
          console.error("document_upload_finalize_failed");
        }
        throw new DocumentError(
          "The file could not be saved. Please try again.",
          503,
        );
      }
      try {
        return await db.$transaction(async (tx) => {
          await lockUpload(tx); // Scheduling can proceed during PUT; never publish after it.
          const changed = await tx.employmentDocument.updateMany({
            where: { id, userId, status: "uploaded", employment: { userId } },
            data: { status: "ready" },
          });
          if (!changed.count)
            throw new DocumentError("Upload could not be completed.", 409);
          await tx.auditEvent.create({
            data: {
              userId,
              documentId: id,
              employmentId: input.employmentId,
              action: "document_uploaded",
            },
          });
          const row = await tx.employmentDocument.findUniqueOrThrow({
            where: { id },
            select: selection,
          });
          return serialize(row);
        });
      } catch (error) {
        console.error("document_upload_finalize_failed");
        // On an uncertain commit, do not remove a potentially ready object or
        // overwrite its status. The durable reservation/key permits cleanup.
        if (transientDatabaseError(error)) throw new DatabaseUnavailableError();
        if (error instanceof DocumentError) {
          try {
            await storage().remove(key);
          } catch {
            /* Retain key for cleanup. */
          }
          try {
            await db.employmentDocument.updateMany({
              where: { id, userId, status: "uploaded" },
              data: { status: "failed" },
            });
          } catch {
            /* Reservation remains recoverable. */
          }
          throw error;
        }
        throw new DocumentError(
          "The upload could not be completed. Check Documents before retrying.",
          503,
        );
      }
    },
    async access(userId: string, id: string) {
      const initial = await find(userId, id);
      if (initial.status !== "ready")
        throw new DocumentError(
          "This document is not available for viewing.",
          409,
        );
      const url = await storage().signDownload(
        initial.objectKey,
        initial.sanitizedFilename,
        initial.mimeType,
        60,
      );
      // Lock against deletion until the access audit commits. Existing URLs expire in 60s.
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "EmploymentDocument" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
        const doc = await tx.employmentDocument.findFirst({
          where: { id, userId, status: "ready", employment: { userId } },
        });
        if (!doc)
          throw new DocumentError(
            "This document is not available for viewing.",
            409,
          );
        await tx.auditEvent.create({
          data: {
            userId,
            documentId: id,
            employmentId: doc.employmentId,
            action: "document_access_issued",
          },
        });
        return { url, expiresIn: 60 };
      });
    },
    async remove(userId: string, id: string) {
      const doc = await find(userId, id);
      if (
        (doc.status === "uploaded" || doc.status === "processing") &&
        Date.now() - doc.createdAt.getTime() < UPLOAD_RESERVATION_MS
      )
        throw new DocumentError(
          "Upload may still be finishing. Retry removal in 15 minutes.",
          409,
        );
      // Persist the blocked-access state first. Retrying a deleting row is safe.
      const changed = await db.employmentDocument.updateMany({
        where: { id, userId, status: { not: "deleted" } },
        data: { status: "deleting" },
      });
      if (!changed.count) throw new DocumentError("Document not found.", 404);
      try {
        // A DELETE acknowledgement alone cannot prove removal (retained versions,
        // delete markers, or incompatible providers). Verify before finalizing.
        await storage().purge(doc.objectKey);
      } catch {
        console.error("document_delete_storage_failed");
        throw new DocumentError(
          "Storage cleanup could not be verified. Deletion is pending; please retry.",
          503,
        );
      }
      await db
        .$transaction(async (tx) => {
          const removed = await tx.employmentDocument.updateMany({
            where: { id, userId, status: "deleting" },
            data: { status: "deleted", storagePurgedAt: new Date() },
          });
          if (removed.count)
            await tx.documentExtraction.deleteMany({
              where: { documentId: id, userId },
            });
          if (removed.count)
            await tx.auditEvent.create({
              data: {
                userId,
                documentId: id,
                employmentId: doc.employmentId,
                action: "document_deleted",
              },
            });
        })
        .catch((error: unknown) => {
          console.error("document_delete_finalize_failed");
          throw error;
        });
    },
  };
}
