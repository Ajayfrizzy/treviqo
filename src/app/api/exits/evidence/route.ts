import { exitRequest } from "@/modules/exits/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => exitRequest(request, undefined, true);
