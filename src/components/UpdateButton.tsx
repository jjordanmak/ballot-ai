"use client";

import { useState } from "react";
import { RefreshCw, Check } from "lucide-react";

/**
 * Update button — sits next to "Last updated" at the top of the page.
 *
 * v1: visual placeholder. Pressing it simulates a refresh cycle (3 seconds)
 *     and shows a "Up to date" success state. The eventual implementation
 *     will hit a Vercel Cron-fed JSON endpoint that pulls from CalMatters,
 *     Ballotpedia, Emerson, news feeds, etc., revalidates the page, and
 *     bumps the lastUpdated timestamp.
 */
export function UpdateButton() {
  const [state, setState] = useState<"idle" | "fetching" | "done">("idle");

  const onClick = async () => {
    if (state !== "idle") return;
    setState("fetching");
    // TODO(v2): replace with real fetch to /api/refresh-races
    await new Promise((r) => setTimeout(r, 1800));
    setState("done");
    setTimeout(() => setState("idle"), 2400);
  };

  return (
    <button
      onClick={onClick}
      disabled={state !== "idle"}
      className={`group inline-flex items-center gap-2 rounded-full border transition-all px-3.5 py-1.5 ${
        state === "done"
          ? "border-[var(--color-tint-green)] text-[var(--color-tint-green)] bg-[var(--color-tint-green-soft)]"
          : state === "fetching"
          ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-mute)] cursor-wait"
          : "border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-mute)]"
      }`}
      aria-label="Update voter guide data"
      title="Pull the latest news, polls, and endorsements"
    >
      {state === "done" ? (
        <Check size={12} />
      ) : (
        <RefreshCw
          size={12}
          className={state === "fetching" ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-700"}
        />
      )}
      <span className="font-mono-cap text-[10px] tracking-[0.16em]">
        {state === "done" ? "Up to date" : state === "fetching" ? "Updating…" : "Update now"}
      </span>
    </button>
  );
}
