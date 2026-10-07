"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span className="link-feedback" data-pending={pending} aria-hidden="true">
      <span className="activity-spinner" />
    </span>
  );
}

export default function ActionLink({
  children,
  className = "",
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`action-link ${className}`}>
      <span className="link-content">{children}</span>
      <PendingHint />
    </Link>
  );
}
