import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
import { DocumentError } from "@/modules/documents/validation";
import { exitService } from "./service";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function exitRequest(request: Request, id?: string, evidenceOnly = false) {
  try {
    const user = await getCurrentUser(); if (!user) throw new DocumentError("Sign in to access exit cases.", 401);
    const service = exitService();
    if (evidenceOnly) return json({ evidence: await service.evidence(user.id, new URL(request.url).searchParams.get("employmentId") ?? "") });
    if (request.method === "GET") return id ? json({ exitCase: await service.detail(user.id, id) }) : json({ exitCases: await service.list(user.id) });
    if (!sameOrigin(request)) throw new DocumentError("Request rejected.", 403);
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new DocumentError("Send a JSON request.", 415);
    let input: unknown; try { input = JSON.parse(await readSmallBody(request, 8192)); } catch { throw new DocumentError("Invalid or oversized request.", 400); }
    return json({ exitCase: id ? await service.update(user.id, id, input) : await service.create(user.id, input) }, id ? 200 : 201);
  } catch (error) {
    if (error instanceof DocumentError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: "Check the required dates and selected answers.", fields: Object.fromEntries(error.issues.map(issue => [issue.path.at(-1), issue.message])) }, 422);
    return json({ error: "Exit cases are temporarily unavailable. Refresh to check whether your save completed, then retry." }, 503);
  }
}
