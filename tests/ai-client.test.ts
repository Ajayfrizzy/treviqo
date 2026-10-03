import { afterEach, expect, it, vi } from "vitest";
import { getDocumentAI } from "@/server/ai/client";
import { parseEnv } from "@/server/config/env";
import { classificationPrompt } from "@/modules/extractions/prompts";
const task = classificationPrompt("Synthetic employment contract");
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure() { vi.stubEnv("RUMPTY_AI_BASE_URL", "https://rumpty.example.test/v1"); vi.stubEnv("RUMPTY_AI_API_KEY", "secret-fixture"); vi.stubEnv("RUMPTY_AI_MODEL", "fixture-model"); }
it("requires complete explicit AI configuration and production HTTPS", () => {
  expect(() => getDocumentAI()).toThrow("AI unavailable");
  expect(() => parseEnv({ RUMPTY_AI_MODEL: "model" })).toThrow("Incomplete environment");
  expect(() => parseEnv({ NODE_ENV: "production", APP_URL: "https://app.test", RUMPTY_AI_BASE_URL: "http://ai.test", RUMPTY_AI_API_KEY: "test", RUMPTY_AI_MODEL: "test" })).toThrow("HTTPS required");
});
it("uses bounded non-streaming JSON requests with no redirects, tools, or fallback provider", async () => {
  configure(); const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] })); vi.stubGlobal("fetch", fetcher);
  expect(await getDocumentAI().complete(task)).toBe("{}");
  expect(fetcher).toHaveBeenCalledWith("https://rumpty.example.test/v1/chat/completions", expect.objectContaining({ redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body).toMatchObject({ model: "fixture-model", temperature: 0, max_tokens: 4096, response_format: { type: "json_object" }, stream: false }); expect(body.tools).toBeUndefined();
});
it("rejects provider failures, truncated output, malformed envelopes and excessive responses", async () => {
  configure();
  for (const response of [new Response("private details", { status: 503 }), Response.json({ choices: [{ finish_reason: "length", message: { content: "{}" } }] }), Response.json({ wrong: true }), new Response("x".repeat(65537))]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response)); await expect(getDocumentAI().complete(task)).rejects.toThrow();
  }
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
  await expect(getDocumentAI().complete(task)).rejects.toThrow();
});
