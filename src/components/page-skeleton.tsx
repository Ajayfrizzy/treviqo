export function PageSkeleton({
  label = "Loading your records…",
}: {
  label?: string;
}) {
  return (
    <div className="skeleton-page" role="status" aria-live="polite">
      <div className="loading-heading">
        <span className="loading-symbol" aria-hidden="true">
          <span className="activity-spinner" />
        </span>
        <div>
          <p className="eyebrow">Your Treviqo</p>
          <h2>{label}</h2>
          <p className="field-hint">
            Getting your latest information ready. You can still use the
            navigation.
          </p>
        </div>
      </div>
      <div className="loading-track" aria-hidden="true" />
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
