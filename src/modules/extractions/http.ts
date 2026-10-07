import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
import { DocumentError } from "@/modules/documents/validation";
import { extractionService } from "./service";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
export async function extractionRequest(request: Request, documentId: string) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new DocumentError("Sign in to review documents.", 401);
    if (request.method === "GET") await limitWorkflow(user.id, "read");
    const service = extractionService();
    if (request.method === "GET")
      return json(
        await service.read(
          user.id,
          documentId,
          new URL(request.url).searchParams.get("runId") || undefined,
        ),
      );
    if (!sameOrigin(request)) throw new DocumentError("Request rejected.", 403);
    await limitWorkflow(user.id, "write");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new DocumentError("Send a JSON request.", 415);
    let input: unknown;
    try {
      input = JSON.parse(
        await readSmallBody(request, request.method === "POST" ? 80000 : 8192),
      );
    } catch {
      throw new DocumentError("Invalid or oversized request.", 400);
    }
    return json(
      request.method === "POST"
        ? await service.start(user.id, documentId, input)
        : await service.review(user.id, documentId, input),
    );
  } catch (error) {
    const limited = limitResponse(error);
    if (limited) return limited;
    if (error instanceof DocumentError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error:
            "Check the selected type and field values. Corrected values must be 1–1000 characters; source text 20–18000 characters.",
        },
        422,
      );
    return json(
      {
        error:
          "This request could not complete. Refresh to check its status before retrying.",
      },
      503,
    );
  }
}
