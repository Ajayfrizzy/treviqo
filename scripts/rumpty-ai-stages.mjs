import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
// Operator-only synthetic probes. Never print source, responses, URLs or secrets.
try {
  const endpoint = new URL(process.env.RUMPTY_AI_BASE_URL);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    !process.env.RUMPTY_AI_API_KEY ||
    !process.env.RUMPTY_AI_MODEL
  )
    throw new Error();
} catch {
  console.error(
    "Configure a clean HTTPS RUMPTY_AI_BASE_URL and nonempty RUMPTY_AI_API_KEY/RUMPTY_AI_MODEL. Values withheld.",
  );
  process.exit(1);
}
const mod = (p) => import(pathToFileURL(process.cwd() + "/dist-worker/" + p));
const { classificationPrompt, extractionPrompt } = await mod(
  "modules/extractions/prompts.js",
);
const { parseClassification, parseFields } = await mod(
  "modules/extractions/schema.js",
);
const { getDocumentAI, INFERENCE_TIMEOUT_MS } = await mod(
  "server/ai/client.js",
);
const fixture = async (name) =>
  JSON.parse(
    await readFile(`tests/fixtures/intelligence/${name}.json`, "utf8"),
  );
const minimal = await fixture("employment_contract"),
  realistic = await fixture("realistic_payslip");
function accuracy(raw, f) {
  let fields;
  try {
    fields = parseFields(raw, f.type, f.text);
  } catch {
    return { passed: false, usableOutput: false };
  }
  const expected = Object.entries(f.fields).filter(
    ([, cell]) => cell.value !== null,
  );
  const correct = expected.filter(
    ([key, cell]) => fields.find((v) => v.key === key)?.value === cell.value,
  ).length;
  return {
    // Accepting a partial review is not provider-accuracy acceptance.
    passed: correct === expected.length && !fields.partial,
    usableOutput: true,
    partial: fields.partial,
    expectedFields: expected.length,
    correctFields: correct,
    groundedProposals: fields.filter((v) => v.value !== null).length,
  };
}
const stages = [
  {
    name: "plain",
    tokens: 16,
    messages: [{ role: "user", content: "Reply with OK only." }],
    validate: (raw) => ({ passed: raw.trim() === "OK" }),
  },
  {
    name: "structured",
    tokens: 64,
    json: true,
    messages: [
      {
        role: "system",
        content: 'Output JSON only. No explanation. Return {"ok":true}.',
      },
      { role: "user", content: 'Return {"ok":true}.' },
    ],
    validate: (raw) => {
      const p = JSON.parse(raw);
      return { passed: p.ok === true && Object.keys(p).length === 1 };
    },
  },
  {
    name: "classification",
    task: classificationPrompt(minimal.text),
    validate: (raw) => {
      const p = parseClassification(raw, minimal.text);
      return {
        passed:
          p.type === minimal.type && ["high", "medium"].includes(p.confidence),
      };
    },
  },
  {
    name: "minimal_extraction",
    task: extractionPrompt(minimal.text, minimal.type),
    validate: (raw) => accuracy(raw, minimal),
  },
  {
    name: "realistic_extraction",
    task: extractionPrompt(realistic.text, realistic.type),
    validate: (raw) => accuracy(raw, realistic),
  },
];
// Resume a diagnosed stage explicitly; never automatically retry paid inference.
const startAt = process.argv[2] ?? "plain";
if (process.argv.length > 3 || !stages.some((s) => s.name === startAt)) {
  console.error(
    "Optional argument: plain|structured|classification|minimal_extraction|realistic_extraction",
  );
  process.exit(1);
}
for (const [index, stage] of stages.entries()) {
  if (index < stages.findIndex((s) => s.name === startAt)) continue;
  const started = Date.now();
  let passed = false;
  try {
    let raw,
      http = 200,
      finish = "stop",
      usage;
    if (stage.task) {
      raw = await getDocumentAI().complete(stage.task);
    } else {
      const response = await fetch(
        process.env.RUMPTY_AI_BASE_URL.replace(/\/$/, "") + "/chat/completions",
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + process.env.RUMPTY_AI_API_KEY,
          },
          body: JSON.stringify({
            model: process.env.RUMPTY_AI_MODEL,
            temperature: 0,
            max_tokens: stage.tokens,
            stream: false,
            messages: stage.messages,
            ...(stage.json ? { response_format: { type: "json_object" } } : {}),
          }),
        },
      );
      http = response.status;
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw Object.assign(new Error(), { code: "http", httpStatus: http });
      }
      const reader = response.body.getReader(),
        chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            throw Object.assign(new Error(), { code: "too_large" });
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const choice = payload?.choices?.[0];
      finish = choice?.finish_reason;
      raw = choice?.message?.content;
      usage =
        typeof payload.usage?.completion_tokens === "number"
          ? payload.usage.completion_tokens
          : undefined;
    }
    let validation = { passed: false };
    if (finish === "stop" && typeof raw === "string") {
      try {
        validation = stage.validate(raw);
      } catch {
        validation = { passed: false, validationFailed: true };
      }
    }
    passed = validation.passed;
    console.log(
      JSON.stringify({
        stage: stage.name,
        http,
        ...validation,
        elapsedMs: Date.now() - started,
        outputChars: typeof raw === "string" ? raw.length : 0,
        completionTokens: usage,
        requestedTokens: stage.tokens ?? stage.task.maxTokens,
        promptChars: stage.task
          ? stage.task.system.length + JSON.stringify(stage.task.schema).length
          : undefined,
      }),
    );
  } catch (error) {
    const code = [
      "timeout",
      "transport",
      "http",
      "too_large",
      "malformed",
      "incomplete",
    ].includes(error.code)
      ? error.code
      : error.name === "TimeoutError"
        ? "timeout"
        : "probe_failed";
    console.log(
      JSON.stringify({
        stage: stage.name,
        passed: false,
        error: code,
        http: Number.isInteger(error.httpStatus) ? error.httpStatus : undefined,
        elapsedMs: Date.now() - started,
      }),
    );
  }
  if (!passed) {
    process.exitCode = 1;
    for (const next of stages.slice(index + 1))
      console.log(
        JSON.stringify({
          stage: next.name,
          status: "not_attempted",
          reason: "previous_stage_failed",
        }),
      );
    break;
  }
}
