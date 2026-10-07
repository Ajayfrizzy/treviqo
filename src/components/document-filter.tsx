"use client";
import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./button";
export function DocumentFilter({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="employment-form document-filter"
      action="/documents"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const employmentId = String(
          new FormData(event.currentTarget).get("employmentId") ?? "",
        );
        const query = new URLSearchParams({ employmentId });
        startTransition(() => router.push(`/documents?${query}`));
      }}
    >
      {children}
      <Button className="secondary" type="submit" aria-busy={pending}>
        {pending ? "Applying filter…" : "Apply filter"}
      </Button>
    </form>
  );
}
