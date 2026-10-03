import "server-only";
import { HeadBucketCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/server/config/env";
export interface PrivateObjectStorage {
  checkConnection(): Promise<void>;
  read(key: string, maxBytes: number): Promise<Buffer>;
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  remove(key: string): Promise<void>;
  signDownload(key: string, filename: string, mimeType: string, expiresIn: number): Promise<string>;
}
// Explicit endpoint/credentials only: this SDK is a Rumpty S3 protocol client.
export function getObjectStorage(): PrivateObjectStorage {
  const env = getEnv();
  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) throw new Error("Object storage is not configured");
  const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  const Bucket = env.S3_BUCKET;
  return {
    async checkConnection() { try { await client.send(new HeadBucketCommand({ Bucket }), { abortSignal: AbortSignal.timeout(2500) }); } finally { client.destroy(); } },
    async read(key, maxBytes) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(10000) });
        if (!result.Body) throw new Error("Object unavailable");
        const chunks: Uint8Array[] = []; let size = 0;
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new Error("Object too large");
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } finally { client.destroy(); }
    },
    async put(key, body, mimeType) { try { await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: mimeType, CacheControl: "private, no-store", ACL: "private" }), { abortSignal: AbortSignal.timeout(30000) }); } finally { client.destroy(); } },
    async remove(key) { try { await client.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(10000) }); } catch (error) { if (!(error instanceof Error && error.name === "NoSuchKey")) throw error; } finally { client.destroy(); } },
    async signDownload(key, filename, mimeType, expiresIn) {
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300) throw new Error("Invalid access lifetime");
      if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) throw new Error("Invalid download filename");
      try { return await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentType: mimeType, ResponseContentDisposition: `attachment; filename="${filename}"`, ResponseCacheControl: "private, no-store" }), { expiresIn }); } finally { client.destroy(); }
    },
  };
}
