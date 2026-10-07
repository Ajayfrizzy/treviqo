// Local production-navigation test proxy. Certificates are supplied by the runner.
import https from "node:https";
import http from "node:http";
import { readFileSync } from "node:fs";
const server = https.createServer(
  {
    key: readFileSync(process.env.NAVIGATION_TLS_KEY),
    cert: readFileSync(process.env.NAVIGATION_TLS_CERT),
  },
  (request, response) => {
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3110,
        path: request.url,
        method: request.method,
        headers: { ...request.headers, "x-forwarded-proto": "https" },
      },
      (result) => {
        response.writeHead(result.statusCode, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  },
);
server.listen(3443, "127.0.0.1");
