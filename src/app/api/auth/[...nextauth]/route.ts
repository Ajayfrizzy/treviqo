import NextAuth from "next-auth";
import { NextRequest } from "next/server";
import { authConfigured, getAuthOptions } from "@/modules/auth/options";
import { allowAuthRequest } from "@/modules/auth/rate-limit";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
export const runtime = "nodejs";
async function handler(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    if (!authConfigured())
      return Response.json(
        { error: "Authentication unavailable" },
        { status: 503 },
      );
    if (!(await allowAuthRequest()))
      return Response.json(
        { error: "Please try again shortly" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    if (request.method === "POST") {
      if (!sameOrigin(request))
        return Response.json({ error: "Request rejected" }, { status: 403 });
      let body: string;
      try {
        body = await readSmallBody(request);
      } catch {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
      request = new NextRequest(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      });
    }
    let signOutFailed = false;
    const auth = NextAuth(
      getAuthOptions(() => {
        signOutFailed = true;
      }),
    );
    const response = await auth(request, { params: await context.params });
    // NextAuth catches event failures internally. Do not claim successful revocation.
    if (signOutFailed)
      return Response.json(
        { error: "Sign-out unavailable. Please try again." },
        { status: 503 },
      );
    return response;
  } catch {
    return Response.json(
      { error: "Authentication unavailable" },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST };
