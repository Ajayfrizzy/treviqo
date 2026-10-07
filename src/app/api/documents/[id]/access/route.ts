import { documentRequest } from "@/modules/documents/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return documentRequest(request, (await context.params).id, true);
}
