import "server-only";
import { argon2id, hash, verify } from "argon2";
import { randomBytes } from "node:crypto";
// Argon2id: 64 MiB, three passes, one lane. Benchmark on Rumpty before launch.
const options = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;
export const hashPassword = (password: string) => hash(password, options);
export const verifyPassword = (encoded: string, password: string) =>
  verify(encoded, password);
let dummyHash: Promise<string> | undefined;
export async function verifyMissingPassword(password: string) {
  // Similar verification work for absent accounts; never skip password hashing.
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  await verifyPassword(await dummyHash, password);
}
