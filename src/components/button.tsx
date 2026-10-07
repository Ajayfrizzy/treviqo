"use client";

import { useRef, useState, type ComponentProps, type MouseEvent } from "react";

type Props = Omit<ComponentProps<"button">, "onClick"> & {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
};

/** Keeps feedback beside the action, including when the page's status is offscreen. */
export function Button({
  onClick,
  disabled,
  children,
  "aria-busy": busy,
  ...props
}: Props) {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const working = pending || busy === true || busy === "true";
  return (
    <button
      {...props}
      disabled={disabled || working}
      aria-busy={working || undefined}
      onClick={async (event) => {
        if (inFlight.current || working) {
          event.preventDefault();
          return;
        }
        const result = onClick?.(event);
        if (
          result &&
          typeof (result as PromiseLike<unknown>).then === "function"
        ) {
          inFlight.current = true;
          setPending(true);
          try {
            await result;
          } finally {
            inFlight.current = false;
            setPending(false);
          }
        }
      }}
    >
      {children}
    </button>
  );
}
