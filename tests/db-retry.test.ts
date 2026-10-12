import { afterEach, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  readDatabase,
  retryIdempotentDatabaseOperation,
  DatabaseUnavailableError,
  transientDatabaseError,
} from "@/server/db/retry";
const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("private-host private-credentials", {
    code,
    clientVersion: "test",
  });
afterEach(() => vi.useRealTimers());
it("retries a P1001 read exactly once after a short backoff", async () => {
  vi.useFakeTimers();
  const read = vi
    .fn()
    .mockRejectedValueOnce(error("P1001"))
    .mockResolvedValue("ready");
  const pending = readDatabase(read);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(199);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await pending).toBe("ready");
  expect(read).toHaveBeenCalledTimes(2);
});
it("returns only safe temporary text after a second connectivity failure", async () => {
  const read = vi.fn().mockRejectedValue(error("P1001"));
  await expect(readDatabase(read)).rejects.toMatchObject({
    status: 503,
    message:
      "Treviqo temporarily lost connection to the database. Please retry.",
  });
  expect(read).toHaveBeenCalledTimes(2);
});
it.each(["P2028", "P2002", "P2003", "P2034", "P2025"])(
  "does not retry %s",
  async (code) => {
    const failure = error(code);
    const read = vi.fn().mockRejectedValue(failure);
    await expect(readDatabase(read)).rejects.toBe(failure);
    expect(read).toHaveBeenCalledTimes(1);
  },
);
it("recognizes only explicit transport/connectivity codes and prevents nested budgets", async () => {
  expect(
    transientDatabaseError(
      Object.assign(new Error("private"), { code: "ECONNRESET" }),
    ),
  ).toBe(true);
  expect(transientDatabaseError(new Error("P1001 database private-host"))).toBe(
    false,
  );
  const read = vi.fn().mockRejectedValue(new DatabaseUnavailableError());
  await expect(readDatabase(read)).rejects.toBeInstanceOf(
    DatabaseUnavailableError,
  );
  expect(read).toHaveBeenCalledTimes(1);
});
it("allows the same bounded retry for an explicitly idempotent write", async () => {
  const write = vi
    .fn()
    .mockRejectedValueOnce(error("P1017"))
    .mockResolvedValue("same-id");
  expect(await retryIdempotentDatabaseOperation(write)).toBe("same-id");
  expect(write).toHaveBeenCalledTimes(2);
});
