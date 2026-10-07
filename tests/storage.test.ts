import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  options: vi.fn(),
  send: vi.fn().mockResolvedValue({}),
  destroy: vi.fn(),
  sign: vi.fn().mockResolvedValue("https://storage.example.test/signed"),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(options: unknown) {
      mocks.options(options);
    }
    send = mocks.send;
    destroy = mocks.destroy;
  },
  HeadBucketCommand: class {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  ListObjectVersionsCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
import { getObjectStorage } from "@/server/storage/client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  mocks.send.mockReset().mockResolvedValue({});
});
function configure() {
  for (const [key, value] of Object.entries({
    S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "test",
    S3_BUCKET: "private",
    S3_ACCESS_KEY_ID: "fixture",
    S3_SECRET_ACCESS_KEY: "fixture",
  }))
    vi.stubEnv(key, value);
}
it("cannot fall back to a default cloud provider", () => {
  expect(() => getObjectStorage()).toThrow("not configured");
  expect(mocks.options).not.toHaveBeenCalled();
});
it("uses only the configured endpoint and private object writes", async () => {
  configure();
  await getObjectStorage().put(
    "key",
    Buffer.from("fixture"),
    "application/pdf",
  );
  expect(mocks.options).toHaveBeenCalledWith(
    expect.objectContaining({
      endpoint: "https://storage.example.test",
      forcePathStyle: true,
    }),
  );
  expect(mocks.send.mock.calls[0]?.[0].input).toMatchObject({
    Bucket: "private",
    ACL: "private",
    CacheControl: "private, no-store",
  });
  expect(mocks.destroy).toHaveBeenCalled();
});
it("signs short-lived attachment downloads without caching", async () => {
  configure();
  await getObjectStorage().signDownload(
    "key",
    "file.pdf",
    "application/pdf",
    60,
  );
  expect(mocks.sign).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      input: expect.objectContaining({
        ResponseContentDisposition: 'attachment; filename="file.pdf"',
        ResponseCacheControl: "private, no-store",
      }),
    }),
    { expiresIn: 60 },
  );
  await expect(
    getObjectStorage().signDownload("key", "file.pdf", "application/pdf", 1000),
  ).rejects.toThrow();
});

it("purges only exact owned versions and verifies current-object absence", async () => {
  configure();
  const { ListObjectVersionsCommand, DeleteObjectCommand, HeadObjectCommand } =
    await import("@aws-sdk/client-s3");
  const versions = new Set(["v1", "v2", "marker"]);
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof ListObjectVersionsCommand)
      return {
        Versions: [...versions]
          .map((VersionId) => ({ Key: "owned", VersionId }))
          .concat([{ Key: "owned-other", VersionId: "foreign" }]),
        IsTruncated: false,
      };
    if (command instanceof DeleteObjectCommand) {
      expect(command.input.Key).toBe("owned");
      if (command.input.VersionId) versions.delete(command.input.VersionId);
      else versions.add("new-marker");
      return {};
    }
    if (command instanceof HeadObjectCommand)
      throw Object.assign(new Error("not found"), {
        $metadata: { httpStatusCode: 404 },
      });
    throw new Error("unexpected");
  });
  await getObjectStorage().purge("owned");
  expect(versions.size).toBe(0);
  expect(mocks.destroy).toHaveBeenCalled();
});
it.each(["list", "delete", "head"])(
  "fails closed on denied %s permission during account purge",
  async (denied) => {
    configure();
    const {
      ListObjectVersionsCommand,
      DeleteObjectCommand,
      HeadObjectCommand,
    } = await import("@aws-sdk/client-s3");
    mocks.send.mockImplementation(async (command) => {
      if (
        (denied === "list" && command instanceof ListObjectVersionsCommand) ||
        (denied === "delete" && command instanceof DeleteObjectCommand) ||
        (denied === "head" && command instanceof HeadObjectCommand)
      )
        throw Object.assign(new Error("AccessDenied"), {
          $metadata: { httpStatusCode: 403 },
        });
      return { IsTruncated: false };
    });
    await expect(getObjectStorage().purge("owned")).rejects.toThrow(
      "AccessDenied",
    );
    expect(mocks.destroy).toHaveBeenCalled();
  },
);
it("accepts an already missing object but not a retained object or incomplete inventory", async () => {
  configure();
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof HeadObjectCommand)
      throw Object.assign(new Error("missing"), {
        $metadata: { httpStatusCode: 404 },
      });
    return { IsTruncated: false };
  });
  await getObjectStorage().purge("missing");
  mocks.send.mockResolvedValue({ IsTruncated: false });
  await expect(getObjectStorage().purge("retained")).rejects.toThrow(
    "remains accessible",
  );
  mocks.send.mockResolvedValue({ IsTruncated: true });
  await expect(getObjectStorage().purge("unknown")).rejects.toThrow(
    "listing incomplete",
  );
});
it("verifies absence after a NoSuchKey retry and rejects unsupported version inventories", async () => {
  configure();
  const { HeadObjectCommand, DeleteObjectCommand } =
    await import("@aws-sdk/client-s3");
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof DeleteObjectCommand)
      throw Object.assign(new Error("gone"), { name: "NoSuchKey" });
    if (command instanceof HeadObjectCommand)
      throw Object.assign(new Error("gone"), {
        $metadata: { httpStatusCode: 404 },
      });
    return { IsTruncated: false };
  });
  await getObjectStorage().purge("already-gone");
  mocks.send.mockResolvedValue({});
  await expect(getObjectStorage().purge("unknown")).rejects.toThrow(
    "inventory unavailable",
  );
});
