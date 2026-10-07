// Test-only S3 protocol fixture. Not a production server or signature verifier.
// Exercises the real SDK HTTP path; anonymous requests are denied.
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
const objects = new Map();
const handler = async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/health") {
    response.end("ok");
    return;
  }
  const signed =
    url.searchParams.has("X-Amz-Signature") &&
    !/^0+$/.test(url.searchParams.get("X-Amz-Signature"));
  const date = url.searchParams.get("X-Amz-Date") ?? "";
  const stamp = Date.parse(
    date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  const ttl = Number(url.searchParams.get("X-Amz-Expires"));
  const validLink =
    signed && ttl > 0 && ttl <= 300 && Date.now() <= stamp + ttl * 1000;
  if (!request.headers.authorization && !validLink) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  if (request.method === "PUT") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    objects.set(url.pathname, Buffer.concat(chunks));
    response.setHeader("ETag", '"fixture"');
    response.end();
    return;
  }
  if (request.method === "DELETE") {
    objects.delete(url.pathname);
    response.writeHead(204);
    response.end();
    return;
  }
  const body = objects.get(url.pathname);
  if (!body) {
    response.writeHead(404);
    response.end();
    return;
  }
  response.setHeader(
    "Content-Type",
    url.searchParams.get("response-content-type") || "application/octet-stream",
  );
  response.setHeader(
    "Content-Disposition",
    url.searchParams.get("response-content-disposition") || "attachment",
  );
  response.end(body);
};
const server = process.env.FIXTURE_TLS_CERT
  ? https.createServer(
      {
        cert: readFileSync(process.env.FIXTURE_TLS_CERT),
        key: readFileSync(process.env.FIXTURE_TLS_KEY),
      },
      handler,
    )
  : http.createServer(handler);
server.listen(
  Number(process.env.FIXTURE_PORT || 3197),
  process.env.FIXTURE_HOST || "127.0.0.1",
);
