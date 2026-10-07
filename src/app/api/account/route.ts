import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { readSmallBody, sameOrigin } from "@/modules/auth/request";
import { allowAuthRequest } from "@/modules/auth/rate-limit";
import { accountDeletionService } from "@/modules/account/service";
import {
  AccountDeletionError,
  deletionUnavailable,
} from "@/modules/account/shared";
export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user)
      throw new AccountDeletionError("Sign in to delete your account.", 401);
    if (!sameOrigin(request))
      throw new AccountDeletionError("Request rejected.", 403);
    if (
      request.headers.get("content-type")?.split(";")[0] !== "application/json"
    )
      throw new AccountDeletionError("Send a JSON request.", 415);
    if (!(await allowAuthRequest()))
      throw new AccountDeletionError(
        "Too many requests. Please try again shortly.",
        429,
      );
    let input: unknown;
    try {
      input = JSON.parse(await readSmallBody(request));
    } catch {
      throw new AccountDeletionError("Invalid or oversized request.", 400);
    }
    const result = await accountDeletionService().remove(user.id, input);
    const response = NextResponse.json(result, {
      status: result.status === "deleted" ? 200 : 202,
      headers,
    });
    if (result.status === "deleted") {
      // Match NextAuth v4 default names (including chunked session cookies).
      // No domain is configured by auth/options.ts. Clear Secure and local variants.
      const names = new Set([
        "next-auth.session-token",
        "__Secure-next-auth.session-token",
        "next-auth.csrf-token",
        "__Host-next-auth.csrf-token",
        "next-auth.callback-url",
        "__Secure-next-auth.callback-url",
        ...request.cookies
          .getAll()
          .map((cookie) => cookie.name)
          .filter((name) =>
            /^(?:__Secure-)?next-auth\.session-token\.\d+$/.test(name),
          ),
      ]);
      for (const name of names)
        response.cookies.set(name, "", {
          httpOnly: true,
          sameSite: "lax",
          secure: name.startsWith("__"),
          path: "/",
          maxAge: 0,
          expires: new Date(0),
        });
    }
    return response;
  } catch (error) {
    if (error instanceof AccountDeletionError)
      return NextResponse.json(
        { error: error.message },
        {
          status: error.status,
          headers: {
            ...headers,
            ...(error.status === 429 ? { "Retry-After": "900" } : {}),
          },
        },
      );
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: "Enter your current password and type DELETE to confirm." },
        { status: 422, headers },
      );
    // No provider messages, stack traces, object keys, identifiers or request bodies.
    console.error("account_deletion_incomplete");
    return NextResponse.json(
      { error: deletionUnavailable },
      { status: 503, headers },
    );
  }
}
