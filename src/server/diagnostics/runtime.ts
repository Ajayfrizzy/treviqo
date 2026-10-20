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
  TimeoutError: "timeout",
  ReadinessTimeout: "deadline",
  WorkerUnavailable: "worker_unhealthy",
  ReplyError: "redis_command",
} as const;
export function runtimeCategory(error: unknown): string {
  if (!error || typeof error !== "object") return "unknown";
  // Prisma initialization uses errorCode; known query errors use code.
  const value = error as {
    code?: unknown;
    errorCode?: unknown;
    name?: unknown;
  };
  for (const token of [value.code, value.errorCode, value.name]) {
    if (typeof token === "string" && Object.hasOwn(categories, token))
      return categories[token as keyof typeof categories];
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
  console.error(
    `runtime_failed operation=${operation} category=${runtimeCategory(error)}`,
  );
}
