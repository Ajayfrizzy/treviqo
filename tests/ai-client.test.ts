import { afterEach, expect, it, vi } from "vitest";
import { getDocumentAI, INFERENCE_TIMEOUT_MS } from "@/server/ai/client";
import { parseEnv } from "@/server/config/env";
import { classificationPrompt } from "@/modules/extractions/prompts";
const task = classificationPrompt("Synthetic employment contract");
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configure() {
  vi.stubEnv("RUMPTY_AI_BASE_URL", "https://rumpty.example.test/v1");
  vi.stubEnv("RUMPTY_AI_API_KEY", "secret-fixture");
  vi.stubEnv("RUMPTY_AI_MODEL", "fixture-model");
}
it("requires complete explicit AI configuration and production HTTPS", () => {
  expect(() => getDocumentAI()).toThrow("AI unavailable");
  expect(() => parseEnv({ RUMPTY_AI_MODEL: "model" })).toThrow(
    "Incomplete environment",
  );
  expect(() =>
    parseEnv({
      NODE_ENV: "production",
      APP_URL: "https://app.test",
      RUMPTY_AI_BASE_URL: "http://ai.test",
      RUMPTY_AI_API_KEY: "test",
      RUMPTY_AI_MODEL: "test",
    }),
  ).toThrow("HTTPS required");
});
it("uses bounded non-streaming JSON requests with no redirects, tools, or fallback provider", async () => {
  configure();
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      choices: [{ finish_reason: "stop", message: { content: "{}" } }],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await getDocumentAI().complete(task)).toBe("{}");
  expect(fetcher).toHaveBeenCalledWith(
    "https://rumpty.example.test/v1/chat/completions",
    expect.objectContaining({
      redirect: "error",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body).toMatchObject({
    model: "fixture-model",
    temperature: 0,
    max_tokens: 256,
    stream: false,
  });
  expect(body.response_format).toBeUndefined();
  expect(body.messages[0].content).toBe(task.system);
  expect(body.tools).toBeUndefined();
});
it("rejects provider failures, truncated output, malformed envelopes and excessive responses", async () => {
  configure();
  for (const response of [
    new Response("private details", { status: 503 }),
    Response.json({
      choices: [{ finish_reason: "length", message: { content: "{}" } }],
    }),
    Response.json({ wrong: true }),
    new Response("x".repeat(65537)),
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(getDocumentAI().complete(task)).rejects.toThrow();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")),
  );
  await expect(getDocumentAI().complete(task)).rejects.toThrow();
});

it("bounds stalled headers and stalled response bodies without automatic retries", async () => {
  configure();
  for (const bodyStarted of [false, true]) {
    vi.useFakeTimers();
    const fetcher = vi.fn((_url, init) => {
      const signal = init.signal as AbortSignal;
      if (!bodyStarted)
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      return Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              signal.addEventListener(
                "abort",
                () => controller.error(signal.reason),
                { once: true },
              );
            },
          }),
        ),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    // Fake the clock driving AbortSignal.timeout, whose native timer is not faked.
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation((ms) => {
        const controller = new AbortController();
        setTimeout(
          () =>
            controller.abort(
              new DOMException("private details", "TimeoutError"),
            ),
          ms,
        );
        return controller.signal;
      });
    const pending = expect(
      getDocumentAI().complete(task),
    ).rejects.toMatchObject({ code: "timeout", message: "AI timeout" });
    await vi.advanceTimersByTimeAsync(INFERENCE_TIMEOUT_MS);
    await pending;
    expect(timeout).toHaveBeenCalledWith(INFERENCE_TIMEOUT_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
it("retains only safe provider failure metadata and does not retry 429 or 503", async () => {
  configure();
  for (const status of [429, 503]) {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("secret provider body", { status }));
    vi.stubGlobal("fetch", fetcher);
    await expect(getDocumentAI().complete(task)).rejects.toMatchObject({
      code: "http",
      httpStatus: status,
      message: "AI http",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
