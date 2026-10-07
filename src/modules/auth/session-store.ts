import "server-only";
import { getDb } from "@/server/db/client";
export const SESSION_SECONDS = 8 * 60 * 60;
export async function createAuthSession(userId: string) {
  return getDb().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { deletionScheduledFor: true, deletionStartedAt: true },
    });
    if (!user || user.deletionScheduledFor || user.deletionStartedAt)
      throw new Error("SignInUnavailable");
    return tx.authSession.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      },
      select: { id: true },
    });
  });
}
export async function isAuthSessionActive(
  id: unknown,
  userId: unknown,
): Promise<boolean> {
  if (typeof id !== "string" || typeof userId !== "string") return false;
  const session = await getDb().authSession.findUnique({
    where: { id },
    select: {
      userId: true,
      expiresAt: true,
      user: { select: { deletionScheduledFor: true, deletionStartedAt: true } },
    },
  });
  return Boolean(
    session &&
    session.userId === userId &&
    !session.user.deletionScheduledFor &&
    !session.user.deletionStartedAt &&
    session.expiresAt.getTime() > Date.now(),
  );
}
export async function revokeAuthSession(id: unknown) {
  if (typeof id === "string")
    await getDb().authSession.deleteMany({ where: { id } });
}
