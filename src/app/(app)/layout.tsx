import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/auth/session";
import { Navigation } from "@/components/navigation";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getCurrentUser())) redirect("/sign-in");
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <header className="brand">
          treviqo<b className="brand-dot">.</b>
          <span>Your working life, together.</span>
        </header>
        <Navigation />
        <p className="sidebar-note">
          Your records.
          <br />
          Your next chapter.
        </p>
      </aside>
      <main id="main" className="content">
        {children}
      </main>
    </div>
  );
}
