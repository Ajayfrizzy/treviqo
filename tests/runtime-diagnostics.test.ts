import { Prisma } from "@prisma/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  logRuntimeFailure,
  runtimeCategory,
} from "@/server/diagnostics/runtime";
afterEach(() => vi.restoreAllMocks());
it.each([
  [{ code: "P1001" }, "database_connectivity"],
  [{ errorCode: "P1000" }, "database_authentication"],
  [{ code: "P2024" }, "database_pool_timeout"],
  [{ code: "P2028" }, "database_transaction"],
  [{ code: "P2034" }, "database_transaction_conflict"],
  [{ code: "P2021" }, "database_schema"],
  [{ code: "ECONNREFUSED" }, "connection_refused"],
  [{ name: "ReplyError" }, "redis_command"],
  [{ name: "ReadinessTimeout" }, "deadline"],
  [null, "unknown"],
])("classifies only structured allowlisted evidence", (error, category) => {
  expect(runtimeCategory(error)).toBe(category);
});
it("never serializes messages, stacks, metadata or unrecognized codes", () => {
  const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const secret = "postgres://private:password@host/user-document";
  logRuntimeFailure(
    "worker_job",
    Object.assign(new Error(secret), {
      code: secret,
      errorCode: secret,
      name: secret,
      meta: { query: secret },
    }),
  );
  expect(console.error).not.toHaveBeenCalled();
  expect(spy.mock.calls).toEqual([
    ["runtime_failed operation=worker_job category=unknown\n"],
  ]);
});

const secret = "postgresql://private:password@host/db SELECT user_payload";
it.each([
  [
    new Prisma.PrismaClientInitializationError(secret, "test"),
    "database_initialization",
  ],
  [
    new Prisma.PrismaClientUnknownRequestError(secret, {
      clientVersion: "test",
    }),
    "database_request_unknown",
  ],
  [
    new Prisma.PrismaClientValidationError(secret, { clientVersion: "test" }),
    "database_validation",
  ],
  [
    new Prisma.PrismaClientRustPanicError(secret, "test"),
    "database_engine_failure",
  ],
])(
  "classifies Prisma fallbacks without leaking error content",
  (error, expected) => {
    const log = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    logRuntimeFailure("readiness_database", error);
    expect(log.mock.calls).toEqual([
      [`runtime_failed operation=readiness_database category=${expected}\n`],
    ]);
  },
);
it("prefers outer recognized codes, then cause codes, over generic Prisma classes", () => {
  const error = new Prisma.PrismaClientInitializationError(
    secret,
    "test",
    "P1011",
  );
  Object.assign(error, { cause: { code: "ECONNRESET" } });
  expect(runtimeCategory(error)).toBe("database_tls");
  error.errorCode = undefined;
  expect(runtimeCategory(error)).toBe("connection_reset");
  Object.assign(error, { code: "P2028", errorCode: "P1001" });
  expect(runtimeCategory(error)).toBe("database_transaction");
});
it("bounds cause depth and terminates cycles", () => {
  const nested = (count: number): unknown => {
    let error: unknown = { code: "P1001" };
    for (let n = 0; n < count; n++) error = { cause: error };
    return error;
  };
  expect(runtimeCategory(nested(4))).toBe("database_connectivity");
  expect(runtimeCategory(nested(5))).toBe("unknown");
  const a: { cause?: unknown } = {},
    b = { cause: a };
  a.cause = b;
  expect(runtimeCategory(a)).toBe("unknown");
  Object.assign(b, { errorCode: "P1011" });
  expect(runtimeCategory(a)).toBe("database_tls");
});
it("ignores cause names, messages, metadata and arbitrary class names", () => {
  expect(
    runtimeCategory({
      name: secret,
      message: "P1011",
      meta: { code: "P1001" },
      cause: { name: "PrismaClientRustPanicError", code: secret },
    }),
  ).toBe("unknown");
  expect(runtimeCategory({ cause: { code: "WorkerUnavailable" } })).toBe(
    "unknown",
  );
  expect(
    runtimeCategory({
      name: "PrismaClientUnknownRequestError",
      cause: { message: "TLS certificate failed P1011" },
    }),
  ).toBe("database_request_unknown");
});
it("does not let inaccessible diagnostic properties replace the original failure", () => {
  const error = {
    name: "PrismaClientInitializationError",
    get cause() {
      throw new Error(secret);
    },
    get code() {
      throw new Error(secret);
    },
  };
  expect(runtimeCategory(error)).toBe("database_initialization");
});
