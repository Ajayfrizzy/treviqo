import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
export class ContentError extends Error {
  constructor(public code: "unreadable" | "too_large") {
    super(code);
  }
}
export async function prepareDocument(
  bytes: Buffer,
  mime: string,
): Promise<string> {
  if (mime !== "application/pdf") throw new ContentError("unreadable");
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        "--max-old-space-size=128",
        path.join(process.cwd(), "src/server/ai/pdf-worker.mjs"),
      ],
      {
        timeout: 10000,
        maxBuffer: 131072,
        env: { PATH: process.env.PATH, NODE_ENV: "production" },
      },
      (error, stdout) => {
        if (error) {
          reject(new ContentError("unreadable"));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error === "too_large") throw new ContentError("too_large");
          if (typeof result.text !== "string" || result.text.trim().length < 20)
            throw new ContentError("unreadable");
          resolve(result.text.trim());
        } catch (error) {
          reject(
            error instanceof ContentError
              ? error
              : new ContentError("unreadable"),
          );
        }
      },
    );
    child.stdin?.on("error", () => {
      /* A failed parser can close its input early. */
    });
    child.stdin?.end(bytes);
  });
}
