import "server-only";
import { getDb } from "@/server/db/client";
import { profileSchema } from "./shared";
export const profileSelect = {
  firstName: true,
  lastName: true,
  preferredName: true,
  country: true,
  email: true,
} as const;
export function getProfile(userId: string) {
  return getDb().user.findUniqueOrThrow({
    where: { id: userId },
    select: profileSelect,
  });
}
export async function updateProfile(userId: string, input: unknown) {
  const data = profileSchema.parse(input);
  return getDb().$transaction(async (tx) => {
    // Serialize with deletion scheduling; disabled accounts cannot update their profile.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        deletionStartedAt: null,
        deletionScheduledFor: null,
      },
      data,
    });
    if (!updated.count) return null;
    await tx.auditEvent.create({ data: { userId, action: "profile_updated" } });
    return tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: profileSelect,
    });
  });
}
