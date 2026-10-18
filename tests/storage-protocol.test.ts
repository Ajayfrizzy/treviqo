import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getObjectStorage } from "@/server/storage/client";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const objects = new Map<string, Buffer>();
let rejectAcl = false;
let denyDelete = false;
let missingHeadStatus = 404;
let holdRead = false;
let putFailure: "reset" | "timeout" | undefined;
let releaseRead: (() => void) | undefined;
let readStarted: (() => void) | undefined;
const requests: string[] = [];
function reject(response: ServerResponse) {
  response.writeHead(400, { "content-type": "application/xml" });
  response.end(
    "<Error><Code>AccessControlListNotSupported</Code><Message>fixture-private-detail</Message></Error>",
  );
}
const server = createServer(async (request, response) => {
  const key = request.url!.split("?")[0]!;
  requests.push(request.method!);
  if (!request.headers.authorization) {
    response.writeHead(403).end();
    return;
  }
  if (request.method === "HEAD") {
    response.statusCode =
      key === "/private/" || key === "/private" || objects.has(key)
        ? 200
        : missingHeadStatus;
    response.end();
    return;
  }
  if (request.method === "PUT") {
    if (putFailure === "reset") {
      request.socket.destroy();
      return;
    }
    if (putFailure === "timeout") {
      request.resume();
      return;
    }
    if (rejectAcl && request.headers["x-amz-acl"]) {
      reject(response);
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    objects.set(key, Buffer.concat(chunks));
    response.setHeader("ETag", '"fixture"');
    response.end();
    return;
  }
  if (request.method === "DELETE") {
    if (denyDelete) {
      response.writeHead(403).end();
      return;
    }
    objects.delete(key);
    response.writeHead(204).end();
    return;
  }
  const body = objects.get(key);
  if (!body) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader("content-length", body.length);
  if (holdRead) {
    response.write(body.subarray(0, 1));
    releaseRead = () => response.end(body.subarray(1));
    readStarted?.();
  } else response.end(body);
});
let endpoint: string;
beforeEach(async () => {
  objects.clear();
  requests.length = 0;
  rejectAcl = false;
  denyDelete = false;
  missingHeadStatus = 404;
  holdRead = false;
  putFailure = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const [key, value] of Object.entries({
    S3_ENDPOINT: endpoint,
    S3_REGION: "test",
    S3_BUCKET: "private",
    S3_ACCESS_KEY_ID: "fixture",
    S3_SECRET_ACCESS_KEY: "fixture",
  }))
    vi.stubEnv(key, value);
});
afterEach(async () => {
  releaseRead?.();
  releaseRead = undefined;
  readStarted = undefined;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("executes HEAD, private PUT, GET and DELETE with the real SDK; anonymous access is denied", async () => {
  const storage = getObjectStorage();
  await storage.checkConnection();
  await storage.put("synthetic", Buffer.from("synthetic"), "application/pdf");
  expect(await storage.read("synthetic", 100)).toEqual(
    Buffer.from("synthetic"),
  );
  expect((await fetch(endpoint + "/private/synthetic")).status).toBe(403);
  await storage.remove("synthetic");
  expect(objects.size).toBe(0);
  expect(requests).toEqual(["HEAD", "PUT", "GET", "GET", "DELETE"]);
});
it("isolates an active streamed GET from another operation's client destruction", async () => {
  const storage = getObjectStorage();
  await storage.put("read", Buffer.from("synthetic"), "application/pdf");
  holdRead = true;
  const started = new Promise<void>((resolve) => {
    readStarted = resolve;
  });
  const reading = storage.read("read", 100);
  await started;
  await storage.put("concurrent", Buffer.from("other"), "application/pdf");
  releaseRead!();
  expect(await reading).toEqual(Buffer.from("synthetic"));
});
it("identifies ACL incompatibility without retrying or weakening the application PUT", async () => {
  rejectAcl = true;
  const storage = getObjectStorage();
  await expect(
    storage.put("synthetic", Buffer.from("synthetic"), "application/pdf"),
  ).rejects.toMatchObject({ name: "AccessControlListNotSupported" });
  expect(requests).toEqual(["PUT"]);
  expect(console.error).toHaveBeenCalledWith(
    "storage_failed operation=put_object category=incompatible_request http=400 code=AccessControlListNotSupported",
  );
  // Isolated protocol experiment only. This fixture does not establish Rumpty support.
  const probe = new S3Client({
    endpoint,
    region: "test",
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: "fixture", secretAccessKey: "fixture" },
  });
  try {
    await probe.send(
      new PutObjectCommand({
        Bucket: "private",
        Key: "probe",
        Body: "synthetic",
      }),
    );
    expect((await fetch(endpoint + "/private/probe")).status).toBe(403);
    await storage.remove("probe");
  } finally {
    probe.destroy();
  }
});

it("reports a real transport reset without retrying the upload", async () => {
  putFailure = "reset";
  await expect(
    getObjectStorage().put(
      "synthetic",
      Buffer.from("synthetic"),
      "application/pdf",
    ),
  ).rejects.toMatchObject({ code: "ECONNRESET" });
  expect(requests).toEqual(["PUT"]);
  expect(console.error).toHaveBeenCalledWith(
    "storage_failed operation=put_object category=network http=unknown code=ECONNRESET",
  );
});

it("aborts a stalled PUT and reports only a safe timeout category", async () => {
  putFailure = "timeout";
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const timer = vi
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => timeout(50));
  await expect(
    getObjectStorage().put(
      "synthetic",
      Buffer.from("synthetic"),
      "application/pdf",
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(timer).toHaveBeenCalledWith(30000);
  expect(requests).toEqual(["PUT"]);
  expect(console.error).toHaveBeenCalledWith(
    "storage_failed operation=put_object category=timeout http=unknown code=AbortError",
  );
});

it("verifies real SDK deletion and recovers manual absence without DELETE permission", async () => {
  const storage = getObjectStorage();
  await storage.put("synthetic", Buffer.from("fixture"), "application/pdf");
  await storage.purge("synthetic");
  expect(requests.slice(-3)).toEqual(["HEAD", "DELETE", "HEAD"]);
  denyDelete = true;
  requests.length = 0;
  await storage.purge("synthetic");
  expect(requests).toEqual(["HEAD"]);
});
it("keeps real SDK missing-object 403 ambiguous and retries only after verified 404", async () => {
  const storage = getObjectStorage();
  await storage.put("synthetic", Buffer.from("fixture"), "application/pdf");
  denyDelete = true;
  await expect(storage.purge("synthetic")).rejects.toMatchObject({
    $metadata: { httpStatusCode: 403 },
  });
  objects.clear();
  missingHeadStatus = 403;
  await expect(storage.purge("synthetic")).rejects.toMatchObject({
    $metadata: { httpStatusCode: 403 },
  });
  missingHeadStatus = 404;
  await storage.purge("synthetic");
});
