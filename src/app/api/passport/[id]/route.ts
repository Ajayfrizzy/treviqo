import { passportRequest } from "@/modules/passport/http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return passportRequest(request, (await params).id);
}
export const POST = GET;
