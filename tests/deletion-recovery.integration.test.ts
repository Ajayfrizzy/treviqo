import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof import("@aws-sdk/client-s3")>()),
  S3Client: class {
    send = sdk.send;
    destroy() {}
  },
}));
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getDb } from "@/server/db/client";
import { documentService } from "@/modules/documents/service";
import { accountDeletionService } from "@/modules/account/service";
const db = getDb();
let userId: string, documentId: string;
let present: boolean, denyDelete: boolean, denyHead: boolean;
beforeEach(async () => {
  for (const [name, value] of Object.entries({
    S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "test",
    S3_BUCKET: "private",
    S3_ACCESS_KEY_ID: "fixture",
    S3_SECRET_ACCESS_KEY: "fixture",
    S3_VERSIONING: "unversioned",
  }))
    vi.stubEnv(name, value);
  present = true;
  denyDelete = false;
  denyHead = false;
  sdk.send.mockReset().mockImplementation(async (command) => {
    if (command instanceof DeleteObjectCommand) {
      if (denyDelete)
        throw Object.assign(new Error("denied"), {
          name: "AccessDenied",
          $metadata: { httpStatusCode: 403 },
        });
      present = false;
      return {};
    }
    if (denyHead)
      throw Object.assign(new Error("denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      });
    if (!present)
      throw Object.assign(new Error("absent"), {
        name: "NotFound",
        $metadata: { httpStatusCode: 404 },
      });
    return {};
  });
  const user = await db.user.create({
    data: {
      employments: {
        create: {
          employerName: "Fixture",
          roleTitle: "Role",
          startDate: new Date("2024-01-01"),
        },
      },
    },
    include: { employments: true },
  });
  userId = user.id;
  documentId = (
    await db.employmentDocument.create({
      data: {
        userId,
        employmentId: user.employments[0]!.id,
        objectKey: `synthetic/${crypto.randomUUID()}`,
        originalFilename: "fixture.pdf",
        sanitizedFilename: "fixture.pdf",
        mimeType: "application/pdf",
        fileSize: 5,
        checksum: "0".repeat(64),
        status: "deleting",
      },
    })
  ).id;
});
afterEach(async () => {
  await db.auditEvent.deleteMany({ where: { userId } });
  await db.employmentDocument.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());
it.each(["manual", "delete", "verification"])(
  "finalizes only verified absence after %s recovery",
  async (mode) => {
    const service = documentService(db);
    if (mode !== "manual") {
      denyDelete = mode === "delete";
      denyHead = mode === "verification";
      await expect(service.remove(userId, documentId)).rejects.toMatchObject({
        status: 503,
      });
      expect(
        await db.employmentDocument.findUnique({ where: { id: documentId } }),
      ).toMatchObject({ status: "deleting", storagePurgedAt: null });
      expect(
        await db.auditEvent.count({
          where: { documentId, action: "document_deleted" },
        }),
      ).toBe(0);
    }
    present = false; // Simulate console removal, with DELETE still denied.
    denyDelete = true;
    denyHead = false;
    sdk.send.mockClear();
    await service.remove(userId, documentId);
    expect(sdk.send).toHaveBeenCalledTimes(1);
    expect(
      await db.employmentDocument.findUnique({ where: { id: documentId } }),
    ).toMatchObject({ status: "deleted", storagePurgedAt: expect.any(Date) });
    await expect(service.remove(userId, documentId)).rejects.toMatchObject({
      status: 404,
    });
    expect(
      await db.auditEvent.count({
        where: { documentId, action: "document_deleted" },
      }),
    ).toBe(1);
  },
);
it("backs off scheduled cleanup on denied verification, then recovers an absent object idempotently", async () => {
  const now = new Date();
  await db.user.update({
    where: { id: userId },
    data: { deletionScheduledFor: now },
  });
  const service = accountDeletionService(db, { clock: () => now });
  present = false;
  denyHead = true;
  await service.processDue(now);
  const pending = await db.user.findUniqueOrThrow({ where: { id: userId } });
  expect(pending.deletionAttempts).toBe(1);
  expect(pending.deletionRetryAt!.getTime()).toBe(now.getTime() + 10000);
  expect(
    await db.employmentDocument.findUnique({ where: { id: documentId } }),
  ).toMatchObject({ storagePurgedAt: null });
  sdk.send.mockClear();
  expect(await service.processDue(now)).toBe(false);
  expect(sdk.send).not.toHaveBeenCalled();
  denyHead = false;
  denyDelete = true;
  await service.processDue(pending.deletionRetryAt!);
  expect(await db.user.findUnique({ where: { id: userId } })).toBeNull();
  expect(sdk.send).toHaveBeenCalledTimes(1);
  expect(await service.cleanup(userId, pending.deletionRetryAt!)).toEqual({
    status: "deleted",
  });
});
