import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { sameOrigin, readSmallBody } from "@/modules/auth/request";
import { DocumentError } from "@/modules/documents/validation";
import { financeService } from "./service";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function financeRequest(request: Request, id: string) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new DocumentError("Sign in to review your records.", 401);
    if (request.method === "GET") await limitWorkflow(user.id, "read");
    if (request.method === "GET")
      return json(await financeService().read(user.id, id));
    if (!sameOrigin(request)) throw new DocumentError("Request rejected.", 403);
    await limitWorkflow(user.id, "write");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new DocumentError("Send JSON.", 415);
    let input;
    try {
      input = JSON.parse(await readSmallBody(request, 8192));
    } catch {
      throw new DocumentError("Invalid or oversized request.");
    }
    return json(await financeService().command(user.id, id, input));
  } catch (error) {
    const limited = limitResponse(error);
    if (limited) return limited;
    if (error instanceof DocumentError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error:
            "Check the selected fields, label, versions and dates. Periods must use YYYY-MM.",
        },
        422,
      );
    return json(
      {
        error:
          "The review could not be saved. Refresh to check current data, then retry.",
      },
      503,
    );
  }
}
