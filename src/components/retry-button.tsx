"use client";
import { useTransition } from "react";
import { Button } from "./button";
export function RetryButton({ reset }: { reset: () => void }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button aria-busy={pending} onClick={() => startTransition(reset)}>
      {pending ? "Trying again…" : "Try again"}
    </Button>
  );
}
