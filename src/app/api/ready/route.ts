import { isReady } from "@/server/readiness";
export const dynamic = "force-dynamic";
export async function GET() {
  const ready = await isReady();
  return Response.json({ status: ready ? "ready" : "unavailable" }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
