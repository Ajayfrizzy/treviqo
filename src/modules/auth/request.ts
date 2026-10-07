import "server-only";
import { getEnv } from "@/server/config/env";
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(getEnv().APP_URL).origin;
}
export async function readSmallBody(request: Request, maximumBytes = 4096) {
  if (Number(request.headers.get("content-length")) > maximumBytes)
    throw new Error("Body too large");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
