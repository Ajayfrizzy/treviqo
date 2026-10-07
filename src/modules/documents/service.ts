import "server-only";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
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
      !(await db.employment.findFirst({
        where: { id, userId },
        select: { id: true },
      }))
    )
      throw new DocumentError("Employment record not found.", 404);
  }
  async function find(userId: string, id: string) {
    owner(userId);
    const doc = await db.employmentDocument.findFirst({
      where: { id, userId, status: { not: "deleted" }, employment: { userId } },
    });
    if (!doc) throw new DocumentError("Document not found.", 404);
    return doc;
  }
  return {
    employment,
    async list(userId: string, employmentId?: string) {
      owner(userId);
      if (employmentId) await employment(userId, employmentId);
      return (
        await db.employmentDocument.findMany({
          where: {
            userId,
            employmentId,
            status: { not: "deleted" },
            employment: { userId },
          },
          select: selection,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        })
      ).map(serialize);
    },
    async detail(userId: string, id: string) {
      await find(userId, id);
      const row = await db.employmentDocument.findFirst({
        where: { id, userId, status: { not: "deleted" } },
        select: selection,
      });
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
      await employment(userId, input.employmentId);
      const { extension, ...file } = validateFile(
        bytes,
        filename,
        mimeType,
        maxBytes,
      );
      const id = randomUUID();
      const key = objectKey(userId, input.employmentId, id, extension);
      const bucket = storage(); // Fail before reservation if storage is not configured.
      await db.employmentDocument.create({
        data: { id, userId, ...input, ...file, objectKey: key },
      });
      try {
        await bucket.put(key, bytes, file.mimeType);
      } catch {
        // The provider may have accepted the bytes even when the request timed out.
        try {
          await storage().remove(key);
        } catch {
          /* The durable row retains the key for cleanup. */
        }
        await db.employmentDocument.updateMany({
          where: { id, userId, status: "uploaded" },
          data: { status: "failed" },
        });
        throw new DocumentError(
          "Upload failed. Remove the failed entry and try again.",
          503,
        );
      }
      // If this transaction fails, keep the reservation/key for deletion/reconciliation.
      // Never publish ready metadata before both storage and the audit transaction succeed.
      await db.$transaction(async (tx) => {
        const changed = await tx.employmentDocument.updateMany({
          where: { id, userId, status: "uploaded" },
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
      });
      const row = await db.employmentDocument.findUniqueOrThrow({
        where: { id },
        select: selection,
      });
      return serialize(row);
    },
    async access(userId: string, id: string) {
      await find(userId, id);
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
        const url = await storage().signDownload(
          doc.objectKey,
          doc.sanitizedFilename,
          doc.mimeType,
          60,
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
        Date.now() - doc.createdAt.getTime() < 15 * 60 * 1000
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
      await storage().remove(doc.objectKey);
      await db.$transaction(async (tx) => {
        const removed = await tx.employmentDocument.updateMany({
          where: { id, userId, status: "deleting" },
          data: { status: "deleted" },
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
      });
    },
  };
}
