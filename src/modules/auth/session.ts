import "server-only";
import { getServerSession } from "next-auth";
import { authConfigured, getAuthOptions } from "./options";
export async function getCurrentUser() {
  if (!authConfigured()) return null;
  const session = await getServerSession(getAuthOptions());
  return session?.user ?? null;
}
export function assertOwner(userId: string, ownerId: string) {
  if (!userId || userId !== ownerId) throw new Error("Forbidden");
}
