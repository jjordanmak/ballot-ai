"use client";

import { useRef, useState } from "react";
import { Info, Maximize2, Minimize2, Users } from "lucide-react";
import type { Candidate } from "@/data/types";
import { CandidateProfile } from "./CandidateProfile";

interface Props {
  profileCandidates: Candidate[];
  activeCount: number;
  suspendedCount: number;
  raceId: string;
  unopposed: boolean;
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
}: Props) {
  // `forceOpen` is undefined until the user uses one of the all controls.
  // After that, it stays sticky until the user uses the other one. The
  // default behavior (active expanded, suspended collapsed) only applies on
  // initial mount.
  const [forceOpen, setForceOpen] = useState<boolean | undefined>(undefined);
  const sectionRef = useRef<HTMLElement>(null);

  const collapseAll = () => {
    setForceOpen(false);
    requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section ref={sectionRef} className="mt-20">
      {/* SECTION HEADER (sticky) — eyebrow + heading row + coverage
          explainer all pin at the top of the viewport while scrolling
          through the profile list. The pb is INSIDE this div so the
          visual gap between the explainer and the first profile stays
          part of the header's opaque bg while pinned (rather than being
          external margin where body content could leak through). */}
      <div className="relative sticky top-0 z-[100] pt-8 pb-8">
        {/* Background layer — behind the content (z:-10) so the masked
            fade applies ONLY to the bg paint, not to descendants like
            the Info tooltip popup. Putting bg + mask + backdrop-blur
            on a separate absolute layer lets the eyebrow row render
            on top, fully visible, and tooltips that extend below the
            icon stay unclipped. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background:
              "color-mix(in oklch, var(--color-ink-0) 88%, transparent)",
            backdropFilter: "blur(14px) saturate(140%)",
            WebkitBackdropFilter: "blur(14px) saturate(140%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 60%, rgba(0,0,0,0.65) 78%, rgba(0,0,0,0.25) 92%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 60%, rgba(0,0,0,0.65) 78%, rgba(0,0,0,0.25) 92%, transparent 100%)",
          }}
        />
        {/* Eyebrow alone is the header (matches news section), with
            Expand/Collapse on the same line. */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 tracking-[0.16em]">
            <Users size={12} className="text-[var(--color-accent)]" />
            Candidate profiles
            <span
              tabIndex={0}
              className="relative inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[var(--color-paper-3)] hover:text-[var(--color-paper)] focus:text-[var(--color-paper)] cursor-help group/tip ml-0.5"
              aria-label="About profile coverage"
            >
              <Info size={11} />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-0 top-full mt-2 w-[320px] z-50 opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity duration-150 rounded-lg bg-[var(--color-ink-0)] border border-[var(--color-ink-3)] shadow-xl p-3 text-left"
              >
                <span className="block text-[11px] text-[var(--color-paper-2)] leading-snug normal-case tracking-normal">
                  We profile every major qualifying candidate for this
                  office — including those who have suspended their
                  campaigns but remain on printed ballots. Long-shot
                  candidates with no public-source coverage (no debate
                  qualification, no major polling, and no campaign
                  filings beyond the candidate statement) are not
                  profiled in depth, but they still appear on your
                  ballot. This race profiles {activeCount} active
                  candidate{activeCount === 1 ? "" : "s"}
                  {suspendedCount > 0 && (
                    <>
                      {" "}and {suspendedCount} suspended
                    </>
                  )}
                  .
                </span>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setForceOpen(true)}
              className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors"
            >
              <Maximize2 size={11} />
              Expand all
            </button>
            <button
              onClick={collapseAll}
              className="font-mono-cap text-[10px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] flex items-center gap-1.5 tracking-[0.18em] transition-colors"
            >
              <Minimize2 size={11} />
              Collapse all
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {profileCandidates.map((c) => (
          <CandidateProfile
            key={c.id}
            candidate={c}
            raceId={raceId}
            unopposed={unopposed}
            forceOpen={forceOpen}
          />
        ))}
      </div>
    </section>
  );
}
