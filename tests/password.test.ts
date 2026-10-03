import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { credentialsSchema } from "@/modules/auth/credentials";
it("uses salted Argon2id and rejects wrong passwords", async () => {
  const password = "A long fixture passphrase";
  const first = await hashPassword(password); const second = await hashPassword(password);
  expect(first).toMatch(/^\$argon2id\$v=19\$/); expect(first.split("$")[3]?.split(",").sort()).toEqual(["m=65536", "p=1", "t=3"]); expect(first).not.toBe(second);
  expect(await verifyPassword(first, password)).toBe(true); expect(await verifyPassword(first, password + "wrong")).toBe(false);
});
it("normalizes email but preserves passwords and enforces length", () => {
  const password = " a long passphrase "; expect(credentialsSchema.parse({ email: " USER@Example.test ", password })).toEqual({ email: "user@example.test", password });
  for (const value of ["short", "x".repeat(129)]) expect(credentialsSchema.safeParse({ email: "a@example.test", password: value }).success).toBe(false);
});
