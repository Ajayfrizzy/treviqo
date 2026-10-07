import "server-only";
import {
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "@/server/config/env";
export interface PrivateObjectStorage {
  checkConnection(): Promise<void>;
  read(key: string, maxBytes: number): Promise<Buffer>;
  put(key: string, body: Buffer, mimeType: string): Promise<void>;
  remove(key: string): Promise<void>;
  purge(key: string): Promise<void>;
  signDownload(
    key: string,
    filename: string,
    mimeType: string,
    expiresIn: number,
  ): Promise<string>;
}
// Explicit endpoint/credentials only: this SDK is a Rumpty S3 protocol client.
export function getObjectStorage(): PrivateObjectStorage {
  const env = getEnv();
  if (
    !env.S3_ENDPOINT ||
    !env.S3_BUCKET ||
    !env.S3_REGION ||
    !env.S3_ACCESS_KEY_ID ||
    !env.S3_SECRET_ACCESS_KEY
  )
    throw new Error("Object storage is not configured");
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    maxAttempts: 1,
  });
  const Bucket = env.S3_BUCKET;
  return {
    async checkConnection() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }), {
          abortSignal: AbortSignal.timeout(2500),
        });
      } finally {
        client.destroy();
      }
    },
    async read(key, maxBytes) {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(10000) },
        );
        if (!result.Body) throw new Error("Object unavailable");
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength;
          if (size > maxBytes) throw new Error("Object too large");
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      } finally {
        client.destroy();
      }
    },
    async put(key, body, mimeType) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket,
            Key: key,
            Body: body,
            ContentType: mimeType,
            CacheControl: "private, no-store",
            ACL: "private",
          }),
          { abortSignal: AbortSignal.timeout(30000) },
        );
      } finally {
        client.destroy();
      }
    },
    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(10000),
        });
      } catch (error) {
        if (!(error instanceof Error && error.name === "NoSuchKey"))
          throw error;
      } finally {
        client.destroy();
      }
    },
    async purge(key) {
      // Rumpty unversioned buckets need only HEAD/DELETE permissions. Version
      // enumeration is opt-in for a deployment explicitly configured as versioned.
      if (env.S3_VERSIONING === "unversioned") {
        const abortSignal = AbortSignal.timeout(10000);
        const absent = (error: unknown) =>
          error instanceof Error &&
          (["NoSuchKey", "NotFound"].includes(error.name) ||
            (error as { $metadata?: { httpStatusCode?: number } }).$metadata
              ?.httpStatusCode === 404);
        const exists = async () => {
          try {
            const head = await client.send(
              new HeadObjectCommand({ Bucket, Key: key }),
              { abortSignal },
            );
            if (head.VersionId && head.VersionId !== "null")
              throw new Error(
                "Versioned object requires versioned cleanup configuration",
              );
            return true;
          } catch (error) {
            if (absent(error)) return false;
            throw error;
          }
        };
        try {
          if (!(await exists())) return;
          try {
            await client.send(new DeleteObjectCommand({ Bucket, Key: key }), {
              abortSignal,
            });
          } catch (error) {
            if (!absent(error)) throw error;
          }
          if (await exists()) throw new Error("Object remains accessible");
          return;
        } finally {
          client.destroy();
        }
      }
      // Versioned deployments must also erase retained versions and markers.
      // Fail closed when the provider cannot list versions or verify absence.
      const abortSignal = AbortSignal.timeout(10000);
      let currentDeleted = false;
      const deleteExact = async (VersionId?: string) => {
        try {
          await client.send(
            new DeleteObjectCommand({ Bucket, Key: key, VersionId }),
            { abortSignal },
          );
        } catch (error) {
          // A concurrent cleanup or a retry may find this version already gone.
          // Still require the final inventory and HEAD checks; never swallow denial.
          if (!(
            error instanceof Error &&
            ["NoSuchKey", "NoSuchVersion"].includes(error.name)
          ))
            throw error;
        }
      };
      try {
        for (let batch = 0; batch < 20; batch++) {
          const listed = await client.send(
            new ListObjectVersionsCommand({
              Bucket,
              Prefix: key,
              MaxKeys: 100,
            }),
            { abortSignal },
          );
          const entries = [
            ...(listed.Versions ?? []),
            ...(listed.DeleteMarkers ?? []),
          ];
          if (typeof listed.IsTruncated !== "boolean")
            throw new Error("Object version inventory unavailable");
          // Keys are unique application-generated names, not user-supplied prefixes.
          // Never delete another object merely because its key shares a prefix.
          const owned = entries.filter((entry) => entry.Key === key);
          if (owned.some((entry) => !entry.VersionId))
            throw new Error("Unverifiable object version");
          if (owned.length) {
            for (const entry of owned) {
              await deleteExact(entry.VersionId);
            }
            continue; // Re-list from the beginning after removing this bounded page.
          }
          if (listed.IsTruncated) throw new Error("Object listing incomplete");
          // Unversioned providers may return no version entry for a current object.
          if (!currentDeleted) {
            await deleteExact();
            currentDeleted = true;
          }
          const remaining = await client.send(
            new ListObjectVersionsCommand({
              Bucket,
              Prefix: key,
              MaxKeys: 100,
            }),
            { abortSignal },
          );
          if (typeof remaining.IsTruncated !== "boolean")
            throw new Error("Object version inventory unavailable");
          if (
            remaining.IsTruncated ||
            [
              ...(remaining.Versions ?? []),
              ...(remaining.DeleteMarkers ?? []),
            ].some((entry) => entry.Key === key)
          )
            continue; // A versioned delete creates a marker; remove it on the next pass.
          try {
            await client.send(new HeadObjectCommand({ Bucket, Key: key }), {
              abortSignal,
            });
          } catch (error) {
            if (
              error instanceof Error &&
              ((error as { $metadata?: { httpStatusCode?: number } }).$metadata
                ?.httpStatusCode === 404 ||
                error.name === "NoSuchKey" ||
                error.name === "NotFound")
            )
              return;
            throw error;
          }
          throw new Error("Object remains accessible");
        }
        throw new Error("Object version cleanup incomplete");
      } finally {
        client.destroy();
      }
    },
    async signDownload(key, filename, mimeType, expiresIn) {
      if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 300)
        throw new Error("Invalid access lifetime");
      if (!/^[a-zA-Z0-9_.-]+$/.test(filename))
        throw new Error("Invalid download filename");
      try {
        return await getSignedUrl(
          client,
          new GetObjectCommand({
            Bucket,
            Key: key,
            ResponseContentType: mimeType,
            ResponseContentDisposition: `attachment; filename="${filename}"`,
            ResponseCacheControl: "private, no-store",
          }),
          { expiresIn },
        );
      } finally {
        client.destroy();
      }
    },
  };
}
