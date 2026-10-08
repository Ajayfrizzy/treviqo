import "server-only";
import { getEnv } from "@/server/config/env";
import type { InferenceTask } from "@/modules/extractions/prompts";
export class InferenceError extends Error {
  constructor(
    public code:
      | "timeout"
      | "transport"
      | "http"
      | "too_large"
      | "malformed"
      | "incomplete",
    public httpStatus?: number,
  ) {
    super(`AI ${code}`);
  }
}
export const INFERENCE_TIMEOUT_MS = 25000;
export interface DocumentAI {
  model: string;
  complete(task: InferenceTask): Promise<string>;
}
// Protocol boundary only. Configure the Rumpty API base including /v1 if required.
// No default endpoint, fallback provider, tools, browsing, or document URLs.
export function getDocumentAI(): DocumentAI {
  const env = getEnv();
  if (!env.RUMPTY_AI_BASE_URL || !env.RUMPTY_AI_API_KEY || !env.RUMPTY_AI_MODEL)
    throw new Error("AI unavailable");
  const endpoint = `${env.RUMPTY_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  return {
    model: env.RUMPTY_AI_MODEL,
    async complete(task) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env.RUMPTY_AI_API_KEY}`,
          },
          body: JSON.stringify({
            model: env.RUMPTY_AI_MODEL,
            temperature: 0,
            max_tokens: task.maxTokens ?? 2048,
            messages: [
              {
                role: "system",
                content: task.system,
              },
              {
                role: "user",
                content: JSON.stringify({ documentText: task.source }),
              },
            ],
            stream: false,
          }),
        });
        if (!response.ok || !response.body) {
          await response.body?.cancel();
          throw new InferenceError("http", response.status);
        }
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65536) {
              await reader.cancel();
              throw new InferenceError("too_large");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        // Raw provider output/errors never enter logs or durable storage.
        let payload;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new InferenceError("malformed");
        }
        const choice = payload?.choices?.[0];
        if (
          choice?.finish_reason !== "stop" ||
          typeof choice?.message?.content !== "string"
        )
          throw new InferenceError("incomplete");
        return choice.message.content;
      } catch (error) {
        if (error instanceof InferenceError) throw error;
        throw new InferenceError(
          error instanceof Error &&
            ["TimeoutError", "AbortError"].includes(error.name)
            ? "timeout"
            : "transport",
        );
      }
    },
  };
}
