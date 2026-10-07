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
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }));
import { getObjectStorage } from "@/server/storage/client";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
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
