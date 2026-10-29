"use client";

import "./globals.css";
import { ErrorShell } from "@/components/ErrorShell";

/** Last resort when the root layout itself fails; renders its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="bg-[var(--color-ink-0)] text-[var(--color-paper)]">
        <ErrorShell
          title="Something went wrong on our end"
          action={
            <button type="button" onClick={reset} className="font-mono-cap text-[11px] tracking-[0.16em] hover:text-[var(--color-accent)]">
              Try again
            </button>
          }
        >
          This page couldn{"’"}t load. It{"’"}s not a problem with your address. Please try again in a moment.
        </ErrorShell>
      </body>
    </html>
  );
}
