import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { sameOrigin, readSmallBody } from "@/modules/auth/request";
import { updateProfile } from "@/modules/profile/service";
import { limitWorkflow, limitResponse } from "@/server/rate-limit";
const headers = { "Cache-Control": "private, no-store" };
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return Response.json(
        { error: "Sign in to update your profile." },
        { status: 401, headers },
      );
    if (!sameOrigin(request))
      return Response.json(
        { error: "Request rejected." },
        { status: 403, headers },
      );
    await limitWorkflow(user.id, "write");
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      return Response.json(
        { error: "Send profile details as JSON." },
        { status: 415, headers },
      );
    let input: unknown;
    try {
      input = JSON.parse(await readSmallBody(request));
    } catch {
      return Response.json(
        { error: "Profile details could not be read." },
        { status: 400, headers },
      );
    }
    const profile = await updateProfile(user.id, input);
    return profile
      ? Response.json({ profile }, { headers })
      : Response.json(
          { error: "Account unavailable." },
          { status: 401, headers },
        );
  } catch (error) {
    const limited = limitResponse(error);
    if (limited) return limited;
    if (error instanceof ZodError)
      return Response.json(
        {
          error: "Check your profile details.",
          fields: Object.fromEntries(
            error.issues.map((issue) => [String(issue.path[0]), issue.message]),
          ),
        },
        { status: 422, headers },
      );
    return Response.json(
      { error: "Profile could not be saved. Please try again." },
      { status: 503, headers },
    );
  }
}
