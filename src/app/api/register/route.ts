import { authConfigured } from "@/modules/auth/options";
import { registerUser, RegistrationError } from "@/modules/auth/credentials";
import { allowAuthRequest } from "@/modules/auth/rate-limit";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  let stage: "config" | "global_limiter" | "register" = "config";
  try {
    if (!authConfigured()) {
      console.error("registration_config_invalid");
      return Response.json({ error: "Registration unavailable" }, { status: 503, headers });
    }
    if (!sameOrigin(request)) return Response.json({ error: "Request rejected" }, { status: 403, headers });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return Response.json({ error: "JSON required" }, { status: 415, headers });
    stage = "global_limiter";
    if (!await allowAuthRequest()) return Response.json({ error: "Please try again shortly" }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    let input: unknown;
    try { input = JSON.parse(await readSmallBody(request)); }
    catch { return Response.json({ error: "Invalid registration details" }, { status: 400, headers }); }
    stage = "register";
    await registerUser(input);
    return Response.json({ success: true }, { status: 201, headers });
  } catch (error) {
    if (error instanceof RegistrationError) return Response.json({ error: error.message }, { status: 400, headers });
    if (stage === "config") console.error("registration_config_invalid");
    if (stage === "global_limiter") console.error("registration_global_limiter_failed");
    return Response.json({ error: "Registration unavailable. Please try again." }, { status: 503, headers });
  }
}
