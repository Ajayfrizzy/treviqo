import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
import { createEmployment, getEmployment, listEmployments, updateEmployment } from "./service";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
export async function employmentRequest(request: Request, id?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "Sign in to access your employment records." }, 401);
    if (request.method === "GET") {
      if (!id) return json({ employments: await listEmployments(user.id) });
      const employment = await getEmployment(user.id, id);
      return employment ? json({ employment }) : json({ error: "Employment record not found." }, 404);
    }
    if (!sameOrigin(request)) return json({ error: "Request rejected." }, 403);
    await limitWorkflow(user.id,"write");
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Send employment details as JSON." }, 415);
    let input: unknown;
    try { input = JSON.parse(await readSmallBody(request)); }
    catch { return json({ error: "The submitted details could not be read. Please try again." }, 400); }
    const employment = id ? await updateEmployment(user.id, id, input) : await createEmployment(user.id, input);
    return employment ? json({ employment }, id ? 200 : 201) : json({ error: "Employment record not found." }, 404);
  } catch (error) {
    const limited = limitResponse(error); if (limited) return limited;
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) { const key = issue.path[0]; if (typeof key === "string" && !fields[key]) fields[key] = issue.message; }
      return json({ error: "Check your employment details and try again.", fields }, 422);
    }
    return json({ error: "Employment records are temporarily unavailable. Please try again." }, 503);
  }
}
