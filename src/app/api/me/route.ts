import { getCurrentUser } from "@/modules/auth/session";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json(user ? { user } : { error: "Unauthorized" }, { status: user ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Service unavailable" }, { status: 503 }); }
}
