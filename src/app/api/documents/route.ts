import { documentRequest } from "@/modules/documents/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => documentRequest(request);
export const POST = (request: Request) => documentRequest(request);
