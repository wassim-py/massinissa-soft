"use client";

import { useLinkStatus } from "next/link";

/**
 * Subtle debounced spinner shown inside sidebar navigation links when a route
 * transition takes >150ms (e.g., on slow internet connections).
 * Fast/cached transitions complete before the delay so there is zero flicker.
 */
export default function NavPendingIndicator() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`ms-auto w-3.5 h-3.5 rounded-full border-2 border-primary/25 border-t-primary animate-spin shrink-0 transition-opacity duration-150 ${
        pending ? "opacity-100 delay-150" : "opacity-0 pointer-events-none"
      }`}
    />
  );
}
