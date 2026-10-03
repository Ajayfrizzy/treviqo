import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { documentTypes } from "./shared";
export class DocumentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const uploadMetadata = z.object({ employmentId: z.string().min(1).max(100), documentType: z.enum(Object.keys(documentTypes) as [keyof typeof documentTypes, ...(keyof typeof documentTypes)[]]).default("other") }).strict();
export function sanitizeFilename(name: string, extension: string) {
  const base = name.split(String.fromCharCode(92)).join("/").split("/").pop() ?? "document";
  const stem = base.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
  return `${stem || "document"}.${extension}`;
}
export function objectKey(userId: string, employmentId: string, documentId: string, extension: string) {
  for (const part of [userId, employmentId, documentId, extension]) if (!/^[a-zA-Z0-9_-]+$/.test(part)) throw new DocumentError("Invalid storage identifier.");
  return `users/${userId}/employments/${employmentId}/documents/${documentId}/${randomUUID()}.${extension}`;
}
export function validateFile(bytes: Buffer, filename: string, declaredMime: string, limit: number) {
  if (!bytes.length) throw new DocumentError("Choose a non-empty file.");
  if (bytes.length > limit) throw new DocumentError(`File exceeds the ${limit / 1048576} MiB limit.`, 413);
  if (!filename || filename.length > 255 || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(filename)) throw new DocumentError("Use a filename without control characters (255 characters maximum).");
  let mime: string; let extension: string;
  if (bytes.subarray(0, 5).toString() === "%PDF-" && /%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))) { mime = "application/pdf"; extension = "pdf"; }
  else if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.length >= 45 && bytes.subarray(12, 16).toString() === "IHDR" && bytes.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]))) { mime = "image/png"; extension = "png"; }
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) { mime = "image/jpeg"; extension = "jpg"; }
  else throw new DocumentError("Choose a valid PDF, JPEG, or PNG file.");
  const supplied = declaredMime.split(";")[0]?.trim().toLowerCase();
  if (supplied && supplied !== "application/octet-stream" && supplied !== mime) throw new DocumentError("The file content does not match its file type.");
  const suffix = filename.split(".").pop()?.toLowerCase();
  if (!(extension === "jpg" ? ["jpg", "jpeg"] : [extension]).includes(suffix ?? "")) throw new DocumentError("The filename extension does not match the file content.");
  return { originalFilename: filename, sanitizedFilename: sanitizeFilename(filename, extension), mimeType: mime, fileSize: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex"), extension };
}
export async function readUpload(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new DocumentError(`File exceeds the ${limit / 1048576} MiB limit.`, 413);
  const reader = request.body?.getReader(); if (!reader) throw new DocumentError("Choose a file.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new DocumentError(`File exceeds the ${limit / 1048576} MiB limit.`, 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
