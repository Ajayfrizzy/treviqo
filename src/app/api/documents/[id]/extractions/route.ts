import { extractionRequest } from "@/modules/extractions/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return extractionRequest(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return extractionRequest(request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return extractionRequest(request, (await context.params).id); }
