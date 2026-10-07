import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { sameOrigin, readSmallBody } from "@/modules/auth/request";
import { DocumentError } from "@/modules/documents/validation";
import { passportService } from "./service";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
export async function passportRequest(request: Request, id?: string) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new DocumentError("Sign in to view your Passport.", 401);
    if (request.method === "GET") await limitWorkflow(user.id, "read");
    const service = passportService();
    if (request.method === "GET")
      return json(
        id
          ? await service.read(user.id, id)
          : { entries: await service.list(user.id) },
      );
    if (!id) throw new DocumentError("Passport entry not found.", 404);
    if (!sameOrigin(request)) throw new DocumentError("Request rejected.", 403);
    await limitWorkflow(user.id, "write");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new DocumentError("Send JSON.", 415);
    let input;
    try {
      input = JSON.parse(await readSmallBody(request, 4096));
    } catch {
      throw new DocumentError("Invalid or oversized request.");
    }
    return json(await service.command(user.id, id, input));
  } catch (error) {
    const limited = limitResponse(error);
    if (limited) return limited;
    if (error instanceof DocumentError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        {
          error:
            "Check your assessment and select current evidence. Confirm that it supports your choice.",
        },
        422,
      );
    return json(
      {
        error:
          "Passport could not load or save. Refresh to check current records, then retry.",
      },
      503,
    );
  }
}
