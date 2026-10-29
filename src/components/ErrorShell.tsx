import Link from "next/link";
import type { ReactNode } from "react";

/** Shared layout for error and not-found pages: brand, message, a way back. */
export function ErrorShell({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <Link href="/" className="font-display text-[44px] leading-none tracking-[-0.02em]">
        ballot<span className="text-[var(--color-paper-3)]">.ai</span>
      </Link>
      <h1 className="mt-10 text-[20px] text-[var(--color-paper)]">{title}</h1>
      <div className="mt-3 max-w-md text-[15px] leading-[1.6] text-[var(--color-paper-2)]">{children}</div>
      <div className="mt-8 flex items-center gap-4">
        {action}
        <Link
          href="/"
          className="font-mono-cap text-[11px] tracking-[0.16em] text-[var(--color-paper-2)] hover:text-[var(--color-accent)] transition-colors"
        >
          Look up your ballot
        </Link>
      </div>
      <p className="mt-10 max-w-md text-[12px] leading-[1.6] text-[var(--color-paper-4)]">
        Your local election office is always the official source for your ballot. You can also find it through{" "}
        <a href="https://www.vote.gov/" target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-accent)]">
          vote.gov
        </a>
        .
      </p>
    </div>
  );
}
