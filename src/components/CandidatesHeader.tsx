"use client";

import { useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { Candidate } from "@/data/types";
import { CandidateProfile } from "./CandidateProfile";

interface Props {
  profileCandidates: Candidate[];
  activeCount: number;
  suspendedCount: number;
  raceId: string;
  unopposed: boolean;
  leaderPct: number;
}

/**
 * Heading + coverage explainer + the actual profile list. Owns the
 * expand/collapse-all state for the whole list — the per-card chevron
 * still works for individual toggling.
 */
export function CandidatesHeader({
  profileCandidates,
  activeCount,
  suspendedCount,
  raceId,
  unopposed,
  leaderPct,
}: Props) {
  // `forceOpen` is undefined until the user uses one of the all controls.
  // After that, it stays sticky until the user uses the other one. The
  // default behavior (active expanded, suspended collapsed) only applies on
  // initial mount.
  const [forceOpen, setForceOpen] = useState<boolean | undefined>(undefined);

  return (
    <section className="mt-20">
      <div className="font-mono-cap text-[11px] text-[var(--color-paper)] mb-4 flex items-center gap-2 tracking-[0.16em]">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        Candidate profiles
      </div>

      {/* Heading row: title + expand/collapse all controls */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <h3 className="font-display text-[28px] leading-tight">
          Meet the candidates
        </h3>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setForceOpen(true)}
            className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors"
          >
            <Maximize2 size={11} />
            Expand all
          </button>
          <button
            onClick={() => setForceOpen(false)}
            className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors"
          >
            <Minimize2 size={11} />
            Collapse all
          </button>
        </div>
      </div>

      {/* Coverage explainer — full-width, plain text. Subtle context for
          voters; no icon or highlights so it doesn't compete with the rest
          of the page. The auto-highlight algorithm is opted out via the
          `no-highlights` wrapper. */}
      <p className="mb-8 text-[13px] leading-[1.6] text-[var(--color-paper-3)] no-highlights">
        We profile every major qualifying candidate for this office — including
        those who have suspended their campaigns but remain on printed ballots.
        Long-shot candidates with no public-source coverage (no debate
        qualification, no major polling, and no campaign filings beyond the
        candidate statement) are not profiled in depth, but they still appear
        on your ballot. This race profiles {activeCount} active candidate
        {activeCount === 1 ? "" : "s"}
        {suspendedCount > 0 && (
          <>
            {" "}and {suspendedCount} suspended
          </>
        )}
        .
      </p>

      <div className="space-y-5">
        {profileCandidates.map((c) => (
          <CandidateProfile
            key={c.id}
            candidate={c}
            raceId={raceId}
            unopposed={unopposed}
            leaderPct={leaderPct}
            forceOpen={forceOpen}
          />
        ))}
      </div>
    </section>
  );
}
