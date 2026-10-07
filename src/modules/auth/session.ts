import "server-only";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { authConfigured, getAuthOptions } from "./options";
// React cache is scoped to a server render, never shared between requests/users.
export const getCurrentUser = cache(async function getCurrentUser() {
  if (!authConfigured()) return null;
  const session = await getServerSession(getAuthOptions());
  return session?.user ?? null;
});
export function assertOwner(userId: string, ownerId: string) {
  if (!userId || userId !== ownerId) throw new Error("Forbidden");
}
