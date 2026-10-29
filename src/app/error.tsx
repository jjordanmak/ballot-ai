"use client";

import { ErrorShell } from "@/components/ErrorShell";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorShell
      title="Something went wrong on our end"
      action={
        <button
          type="button"
          onClick={reset}
          className="font-mono-cap text-[11px] tracking-[0.16em] text-[var(--color-paper)] hover:text-[var(--color-accent)] transition-colors"
        >
          Try again
        </button>
      }
    >
      This page couldn{"’"}t load. It{"’"}s not a problem with your address. Please try again in a moment.
    </ErrorShell>
  );
}
