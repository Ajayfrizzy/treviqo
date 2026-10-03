import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/session";
import { Navigation } from "@/components/navigation";
export const dynamic = "force-dynamic";
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!await getCurrentUser()) redirect("/sign-in");
  return <div className="app-shell"><header className="brand">treviqo<span>Your working life, together.</span></header><Navigation /><main id="main" className="content">{children}</main></div>;
}
