export function PageSkeleton({
  label = "Loading your records…",
}: {
  label?: string;
}) {
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <p className="eyebrow">Your Treviqo</p>
      <p>{label}</p>
      <div aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton" />
        <div className="employment-list">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </div>
  );
}
