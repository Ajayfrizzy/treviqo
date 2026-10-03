export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ status: "ok", service: "treviqo" }, { headers: { "Cache-Control": "no-store" } });
}
