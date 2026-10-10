import Link from "@/components/action-link";
export function AuthLayout({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="auth-layout">
      <aside className="auth-story">
        <Link className="public-brand" href="/" aria-label="Treviqo home">
          treviqo<span className="brand-dot">.</span>
        </Link>
        <p className="eyebrow">Your records. Your next chapter.</p>
        <h2>
          Your working life.
          <br />
          Yours to keep.
        </h2>
        <p>
          One personal space for the records you build, the decisions you
          review, and the benefits you carry forward.
        </p>
        <ul>
          <li>Keep your employment history together.</li>
          <li>Review important details with confidence.</li>
          <li>Stay on top of your next step.</li>
        </ul>
        <Link className="touch-link" href="/">
          ← Discover Treviqo
        </Link>
      </aside>
      <section className="auth-panel" aria-labelledby="auth-heading">
        <h1 id="auth-heading">{title}</h1>
        <p className="intro">{intro}</p>
        {children}
      </section>
    </main>
  );
}
