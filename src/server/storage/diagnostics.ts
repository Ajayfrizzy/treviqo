type StorageOperation =
  | "initialize"
  | "head_bucket"
  | "put_object"
  | "get_object"
  | "delete_object"
  | "purge_object"
  | "sign_download";
const categories = {
  AbortError: "timeout",
  TimeoutError: "timeout",
  RequestTimeout: "timeout",
  ETIMEDOUT: "timeout",
  ESOCKETTIMEDOUT: "timeout",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  ECONNRESET: "network",
  ECONNREFUSED: "network",
  EPIPE: "network",
  ENETUNREACH: "network",
  CredentialsProviderError: "authentication",
  InvalidAccessKeyId: "authentication",
  SignatureDoesNotMatch: "authentication",
  ExpiredToken: "authentication",
  InvalidToken: "authentication",
  AccessDenied: "authorization",
  Forbidden: "authorization",
  AccessControlListNotSupported: "incompatible_request",
  InvalidArgument: "incompatible_request",
  InvalidRequest: "incompatible_request",
  NotImplemented: "incompatible_request",
  AuthorizationHeaderMalformed: "incompatible_request",
  NoSuchBucket: "not_found",
  NoSuchKey: "not_found",
  NotFound: "not_found",
  SlowDown: "throttled",
  InternalError: "provider",
  ServiceUnavailable: "provider",
} as const;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
/** Only allowlisted tokens and a bounded HTTP status cross the logging boundary. */
export function storageDiagnostic(error: unknown) {
  const outer = record(error);
  const status = record(outer.$metadata).httpStatusCode;
  const http =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : "unknown";
  let code: keyof typeof categories | undefined;
  let current = outer;
  for (let depth = 0; depth < 3 && !code; depth++) {
    // Smithy may name a socket-reset error TimeoutError; its concrete transport
    // code is more specific and must win over that generic wrapper name.
    for (const token of [current.code, current.name]) {
      if (typeof token === "string" && Object.hasOwn(categories, token)) {
        code = token as keyof typeof categories;
        break;
      }
    }
    current = record(current.cause);
  }
  const category = code
    ? categories[code]
    : http === 401
      ? "authentication"
      : http === 403
        ? "authorization"
        : typeof http === "number" && http >= 500
          ? "provider"
          : "unknown";
  return { category, http, code: code ?? "unknown" };
}
export function logStorageFailure(operation: StorageOperation, error: unknown) {
  const safe = storageDiagnostic(error);
  console.error(
    `storage_failed operation=${operation} category=${safe.category} http=${safe.http} code=${safe.code}`,
  );
}
export function diagnoseStorage<Args extends unknown[], Result>(
  operation: StorageOperation,
  action: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  return async (...args) => {
    try {
      return await action(...args);
    } catch (error) {
      logStorageFailure(operation, error);
      throw error;
    }
  };
}
