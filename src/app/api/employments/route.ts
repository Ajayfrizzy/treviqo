import { employmentRequest } from "@/modules/employments/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => employmentRequest(request);
export const POST = (request: Request) => employmentRequest(request);
