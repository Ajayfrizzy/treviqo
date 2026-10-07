// Test-only protocol server; never enabled by a production-mode switch.
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
const types = [
  "employment_contract",
  "payslip",
  "resignation_letter",
  "termination_letter",
  "final_settlement",
  "pension_statement",
];
const fixtures = types.map((type) =>
  JSON.parse(
    readFileSync(new URL(`./intelligence/${type}.json`, import.meta.url)),
  ),
);
const handler = async (request, response) => {
  if (request.url === "/health") {
    response.end("ok");
    return;
  }
  if (
    request.url !== "/v1/chat/completions" ||
    request.headers.authorization !== "Bearer fixture"
  ) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const source = JSON.parse(body.messages[1].content).documentText;
    if (source.includes("FIXTURE_UNAVAILABLE")) {
      response.writeHead(503);
      response.end();
      return;
    }
    const fixture =
      fixtures.find((item) => source.includes(item.classification.evidence)) ??
      fixtures[0];
    const classify = body.messages[0].content.includes("Classify only");
    let result = classify ? fixture.classification : fixture.fields;
    if (source.includes("FIXTURE_LOW") && classify)
      result = { ...fixture.classification, confidence: "low" };
    const content = source.includes("FIXTURE_MALFORMED")
      ? "not JSON"
      : JSON.stringify(result);
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content } }],
      }),
    );
  } catch {
    response.writeHead(400);
    response.end();
  }
};
const server = process.env.AI_FIXTURE_TLS_CERT
  ? https.createServer(
      {
        cert: readFileSync(process.env.AI_FIXTURE_TLS_CERT),
        key: readFileSync(process.env.AI_FIXTURE_TLS_KEY),
      },
      handler,
    )
  : http.createServer(handler);
server.listen(
  Number(process.env.AI_FIXTURE_PORT || 3199),
  process.env.AI_FIXTURE_HOST || "127.0.0.1",
);
