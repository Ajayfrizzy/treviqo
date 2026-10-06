import { passportRequest } from "@/modules/passport/http";
export const runtime = "nodejs";
export const GET = (request: Request) => passportRequest(request);
