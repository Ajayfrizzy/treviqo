import { documentRequest } from "@/modules/documents/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return documentRequest(request, (await context.params).id);
}
export async function DELETE(request: Request, context: Context) {
  return documentRequest(request, (await context.params).id);
}
