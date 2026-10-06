import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db/client";
import { hashPassword, verifyPassword, verifyMissingPassword } from "./password";
import { allowCredentialAttempt } from "./rate-limit";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Passphrases are encouraged. Do not trim or silently truncate passwords.
  password: z.string().min(15).max(128),
});
export class RegistrationError extends Error {
  constructor() { super("Unable to create an account with these details. Try signing in or use different details."); }
}
export async function registerUser(input: unknown): Promise<{ id: string }> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) throw new RegistrationError();
  const { email, password } = parsed.data;
  let allowed: boolean;
  try { allowed = await allowCredentialAttempt(email); }
  catch (error) { console.error("registration_account_limiter_failed"); throw error; }
  if (!allowed) throw new RegistrationError();
  let passwordHash: string;
  try { passwordHash = await hashPassword(password); }
  catch (error) { console.error("registration_password_hash_failed"); throw error; }
  try {
    return await getDb().user.create({ data: { email, passwordHash }, select: { id: true } });
  } catch (error) {
    const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code
      : error instanceof Prisma.PrismaClientInitializationError ? error.errorCode : undefined;
    // Never serialize provider messages, metadata, stacks, or arbitrary error.code values.
    console.error("registration_database_create_failed", typeof code === "string" && /^P\d{4}$/.test(code) ? code : "unknown");
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new RegistrationError();
    throw error;
  }
}
export async function authenticateCredentials(input: unknown): Promise<{ id: string } | null> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  if (!await allowCredentialAttempt(email)) return null;
  const user = await getDb().user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (!user?.passwordHash) { await verifyMissingPassword(password); return null; }
  if (!await verifyPassword(user.passwordHash, password)) return null;
  return { id: user.id };
}
