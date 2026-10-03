import { exitRequest } from "@/modules/exits/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return exitRequest(request, (await context.params).id); }
export async function PUT(request: Request, context: Context) { return exitRequest(request, (await context.params).id); }
