import "server-only";
import { registrationSchema, signInSchema } from "./validation";
export { credentialsSchema } from "./validation";
import { Prisma } from "@prisma/client";
import { getDb } from "@/server/db/client";
import {
  hashPassword,
  verifyPassword,
  verifyMissingPassword,
} from "./password";
import { CredentialStateError } from "./sign-in-state";
import { allowCredentialAttempt } from "./rate-limit";

export class RegistrationError extends Error {
  constructor() {
    super(
      "Unable to create an account with these details. Try signing in or use different details.",
    );
  }
}
export async function registerUser(input: unknown): Promise<{ id: string }> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new RegistrationError();
  const { email, password, firstName, lastName, preferredName, country } =
    parsed.data;
  let allowed: boolean;
  try {
    allowed = await allowCredentialAttempt(email);
  } catch (error) {
    console.error("registration_account_limiter_failed");
    throw error;
  }
  if (!allowed) throw new RegistrationError();
  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (error) {
    console.error("registration_password_hash_failed");
    throw error;
  }
  let databaseStage:
    | "registration_database_client_init_failed"
    | "registration_database_user_create_failed" =
    "registration_database_client_init_failed";
  try {
    const db = getDb();
    // Prisma connects lazily: connection errors during the query belong to this stage.
    databaseStage = "registration_database_user_create_failed";
    return await db.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        preferredName,
        country,
      },
      select: { id: true },
    });
  } catch (error) {
    const code =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? error.code
        : error instanceof Prisma.PrismaClientInitializationError
          ? error.errorCode
          : undefined;
    // Never serialize provider messages, metadata, stacks, or arbitrary error.code values.
    console.error(
      databaseStage,
      typeof code === "string" && /^P\d{4}$/.test(code) ? code : "unknown",
    );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new RegistrationError();
    throw error;
  }
}
export async function authenticateCredentials(
  input: unknown,
): Promise<{ id: string } | null> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  if (!(await allowCredentialAttempt(email)))
    throw new CredentialStateError("SignInUnavailable");
  const user = await getDb().user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    await verifyMissingPassword(password);
    return null;
  }
  if (!(await verifyPassword(user.passwordHash, password))) return null;
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || current.passwordHash !== user.passwordHash) return null;
    if (
      current.deletionStartedAt ||
      (current.deletionScheduledFor &&
        current.deletionScheduledFor <= new Date())
    )
      throw new CredentialStateError("DeletionProcessing");
    if (current.deletionScheduledFor) {
      const cancel =
        typeof input === "object" &&
        input !== null &&
        "cancelDeletion" in input &&
        input.cancelDeletion === "true";
      if (!cancel)
        throw new CredentialStateError(
          `DeletionPending:${current.deletionScheduledFor.toISOString()}`,
        );
      // The account lock serializes cancellation with the worker and scheduling.
      await tx.user.update({
        where: { id: user.id },
        data: {
          deletionScheduledFor: null,
          deletionRetryAt: null,
          deletionAttempts: 0,
        },
      });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({
        data: { userId: user.id, action: "account_deletion_cancelled" },
      });
    }
    return { id: user.id };
  });
}
