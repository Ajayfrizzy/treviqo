import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/session";
export async function documentPageUser() { const user = await getCurrentUser(); if (!user) redirect("/sign-in"); return user; }
