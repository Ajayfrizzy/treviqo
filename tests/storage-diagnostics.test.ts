import { expect, it, vi } from "vitest";
import {
  logStorageFailure,
  storageDiagnostic,
} from "@/server/storage/diagnostics";
it.each([
  ["AccessControlListNotSupported", 400, "incompatible_request"],
  ["AccessDenied", 403, "authorization"],
  ["SignatureDoesNotMatch", 403, "authentication"],
  ["AbortError", undefined, "timeout"],
  ["TimeoutError", undefined, "timeout"],
  ["ENOTFOUND", undefined, "dns"],
  ["ECONNRESET", undefined, "network"],
  ["SlowDown", 503, "throttled"],
])("categorizes %s without provider text", (name, status, category) => {
  expect(
    storageDiagnostic({
      name,
      message: "secret",
      $metadata: { httpStatusCode: status },
    }),
  ).toEqual({ category, http: status ?? "unknown", code: name });
});
it("recognizes bounded transport causes", () => {
  expect(
    storageDiagnostic({ name: "Error", cause: { code: "EAI_AGAIN" } }).category,
  ).toBe("dns");
});
it("never emits arbitrary names, messages, metadata or connection values", () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    logStorageFailure("put_object", {
      name: "https://secret-endpoint/bucket/key",
      code: "credential",
      message: "source text",
      stack: "secret",
      cause: { message: "secret" },
      $metadata: { httpStatusCode: "403 secret", requestId: "secret" },
    });
    expect(log.mock.calls).toEqual([
      [
        "storage_failed operation=put_object category=unknown http=unknown code=unknown",
      ],
    ]);
  } finally {
    log.mockRestore();
  }
});
