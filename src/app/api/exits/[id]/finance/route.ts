import { financeRequest } from "@/modules/finance/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return financeRequest(request, (await context.params).id);
}
export async function POST(request: Request, context: Context) {
  return financeRequest(request, (await context.params).id);
}
