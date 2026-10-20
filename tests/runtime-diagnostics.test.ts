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
