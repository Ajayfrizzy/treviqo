import { PageSkeleton } from "@/components/page-skeleton";
export default function Loading() {
  return (
    <main id="main" className="content">
      <PageSkeleton label="Loading your space…" />
    </main>
  );
}
