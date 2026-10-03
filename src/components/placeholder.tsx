export function Placeholder({ title, description }: { title: string; description: string }) {
  return <><p className="eyebrow">Your Treviqo</p><h1>{title}</h1><p className="intro">{description}</p><section className="card"><span className="badge">Coming soon</span><h2>A space for what comes next</h2><p>This area is being prepared. There is nothing to add here yet.</p></section></>;
}
