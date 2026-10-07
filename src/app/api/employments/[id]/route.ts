import { employmentRequest } from "@/modules/employments/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return employmentRequest(request, (await context.params).id);
}
// PUT replaces editable fields; ownership and timestamps are never client-controlled.
export async function PUT(request: Request, context: Context) {
  return employmentRequest(request, (await context.params).id);
}
