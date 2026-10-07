import { expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { credentialsSchema } from "@/modules/auth/credentials";
it("uses salted Argon2id and rejects wrong passwords", async () => {
  const password = "A long fixture passphrase";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  expect(first).toMatch(/^\$argon2id\$v=19\$/);
  expect(first.split("$")[3]?.split(",").sort()).toEqual([
    "m=65536",
    "p=1",
    "t=3",
  ]);
  expect(first).not.toBe(second);
  expect(await verifyPassword(first, password)).toBe(true);
  expect(await verifyPassword(first, password + "wrong")).toBe(false);
});
it("normalizes email but preserves passwords and enforces length", () => {
  const password = " A long passphrase 7! ";
  expect(
    credentialsSchema.parse({ email: " USER@Example.test ", password }),
  ).toEqual({ email: "user@example.test", password });
  for (const value of ["short", "x".repeat(129)])
    expect(
      credentialsSchema.safeParse({ email: "a@example.test", password: value })
        .success,
    ).toBe(false);
});

it("requires each password category and accepts the inclusive length boundaries", () => {
  for (const password of [
    "Abcde1!",
    "a".repeat(125) + "A1!x",
    "abcdefgh1!",
    "ABCDEFGH1!",
    "Abcdefgh!",
    "Abcdefgh1",
    "Abcdefg1 ",
  ]) {
    expect(
      credentialsSchema.safeParse({ email: "a@example.test", password })
        .success,
    ).toBe(false);
  }
  for (const password of [
    "Abcdef1!",
    "a".repeat(125) + "A1!",
    " A valid 7! password ",
  ]) {
    expect(
      credentialsSchema.parse({ email: "a@example.test", password }).password,
    ).toBe(password);
  }
});
