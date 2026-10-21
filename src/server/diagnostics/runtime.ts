// Fixed categories only: never emit messages, stacks, metadata, URLs or record IDs.
const categories = {
  P1000: "database_authentication",
  P1001: "database_connectivity",
  P1002: "database_timeout",
  P1003: "database_missing",
  P1008: "database_timeout",
  P1010: "database_authorization",
  P1011: "database_tls",
  P1017: "database_connection_closed",
  P2002: "database_unique_constraint",
  P2021: "database_schema",
  P2022: "database_schema",
  P2024: "database_pool_timeout",
  P2028: "database_transaction",
  P2034: "database_transaction_conflict",
  ECONNREFUSED: "connection_refused",
  ECONNRESET: "connection_reset",
  ENOTFOUND: "dns",
  EAI_AGAIN: "dns",
  ETIMEDOUT: "timeout",
} as const;
const namedCategories = {
  TimeoutError: "timeout",
  ReadinessTimeout: "deadline",
  WorkerUnavailable: "worker_unhealthy",
  ReplyError: "redis_command",
} as const;
// Fixed Prisma names support errors crossing bundled module boundaries. Never emit
// a supplied name; these are inconclusive fallbacks, not inferred transport causes.
const prismaCategories = {
  PrismaClientInitializationError: "database_initialization",
  PrismaClientUnknownRequestError: "database_request_unknown",
  PrismaClientValidationError: "database_validation",
  PrismaClientRustPanicError: "database_engine_failure",
} as const;
function property(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}
export function runtimeCategory(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  const seen = new Set<object>();
  let current: unknown = error;
  // Inspect the outer error plus at most four causes. Only structured allowlisted
  // codes are considered in causes; messages, metadata and cause names are ignored.
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    for (const key of ["code", "errorCode"]) {
      const token = property(current, key);
      if (typeof token === "string" && Object.hasOwn(categories, token))
        return categories[token as keyof typeof categories];
    }
    if (depth < 4) current = property(current, "cause");
  }
  const name = property(error, "name");
  if (typeof name === "string") {
    if (Object.hasOwn(namedCategories, name))
      return namedCategories[name as keyof typeof namedCategories];
    if (Object.hasOwn(prismaCategories, name))
      return prismaCategories[name as keyof typeof prismaCategories];
  }
  return "unknown";
}
export type RuntimeOperation =
  | "readiness_database"
  | "readiness_redis"
  | "readiness_storage"
  | "readiness_worker"
  | "readiness_auth"
  | "worker_tick"
  | "worker_health"
  | "worker_database"
  | "worker_redis"
  | "worker_job";
export function logRuntimeFailure(operation: RuntimeOperation, error: unknown) {
  // React replays console calls made during Server Component rendering in the
  // browser. Operational diagnostics belong only in the server log stream.
  process.stderr.write(
    `runtime_failed operation=${operation} category=${runtimeCategory(error)}\n`,
  );
}
