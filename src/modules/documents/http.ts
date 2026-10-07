import { limitWorkflow, limitResponse } from "@/server/rate-limit";
import "server-only";
import { ZodError } from "zod";
import { getCurrentUser } from "@/modules/auth/session";
import { sameOrigin } from "@/modules/auth/request";
import { getEnv } from "@/server/config/env";
import { documentService } from "./service";
import { DocumentError, readUpload, uploadMetadata } from "./validation";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
export async function documentRequest(
  request: Request,
  id?: string,
  access = false,
) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new DocumentError("Sign in to access documents.", 401);
    const service = documentService();
    if (request.method === "GET") {
      if (id) return json({ document: await service.detail(user.id, id) });
      const employmentId =
        new URL(request.url).searchParams.get("employmentId") || undefined;
      return json({ documents: await service.list(user.id, employmentId) });
    }
    if (!sameOrigin(request)) throw new DocumentError("Request rejected.", 403);
    await limitWorkflow(
      user.id,
      access ? "signed_access" : id ? "write" : "upload",
    );
    if (id && access) return json(await service.access(user.id, id));
    if (id && request.method === "DELETE") {
      await service.remove(user.id, id);
      return json({ success: true });
    }
    const metadata = uploadMetadata.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    await service.employment(user.id, metadata.employmentId); // Reject foreign ownership before reading any file bytes.
    const max = getEnv().DOCUMENT_MAX_FILE_MB * 1048576;
    let filename: string;
    try {
      filename = decodeURIComponent(request.headers.get("x-file-name") ?? "");
    } catch {
      throw new DocumentError("Invalid filename.");
    }
    const bytes = await readUpload(request, max);
    return json(
      {
        document: await service.upload(
          user.id,
          metadata,
          bytes,
          filename,
          request.headers.get("content-type") ?? "",
          max,
        ),
      },
      201,
    );
  } catch (error) {
    const limited = limitResponse(error);
    if (limited) return limited;
    if (error instanceof DocumentError)
      return json({ error: error.message }, error.status);
    if (error instanceof ZodError)
      return json(
        { error: "Choose a valid employment and document category." },
        422,
      );
    return json(
      {
        error:
          "The document request could not complete. Check Documents and retry; a pending deletion can be retried safely.",
      },
      503,
    );
  }
}
