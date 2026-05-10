"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, ArrowUp, MapPin } from "lucide-react";
import { partyDot } from "./PartyTag";
import type { Race } from "@/data/types";
import { useScrollSpy } from "@/hooks/useScrollSpy";

interface SidebarProps {
  races: Race[];
  /** Branding + ballot context — passed through from the page so the
   * sidebar header can show the right ZIP / election. Optional so older
   * uses (the static page) keep working with sensible defaults. */
  productName?: string;
  location?: string;
  electionName?: string;
  electionDate?: string;
}

export function Sidebar({
  races,
  productName = "ballot.ai",
  location = "Daly City, CA · 94015",
  electionName = "Statewide Direct Primary",
  electionDate = "Jun 2, 2026",
}: SidebarProps) {
  // Hover-driven expansion: which race the cursor is over. Distinct from
  // active (scroll-spy) so the active highlight stays put as the user
  // scrolls but the dropdown only opens when the cursor is on the row.
  const [hoveredRaceId, setHoveredRaceId] = useState<string | null>(null);
  const { activeRaceId, activeCandidateId, showBackToTop } = useScrollSpy(races);

  return (
    <aside className="hidden lg:flex sticky top-0 left-0 h-screen w-[300px] xl:w-[340px] flex-col border-r border-[var(--color-ink-3)] bg-[var(--color-ink-0)]">
      {/* SITE HEADER — product brand + jurisdiction + election */}
      <div className="p-6 pb-5 border-b border-[var(--color-ink-3)]">
        <h1 className="font-display text-[28px] leading-none tracking-[-0.02em]">
          {productName.includes(".")
            ? (() => {
                const i = productName.indexOf(".");
                return (
                  <>
                    {productName.slice(0, i)}
                    <span className="text-[var(--color-paper-3)]">{productName.slice(i)}</span>
                  </>
                );
              })()
            : productName}
        </h1>
        <div className="font-mono-cap text-[10px] text-[var(--color-accent)] mt-3 tracking-[0.16em]">
          {location}
        </div>
        <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mt-1.5 leading-relaxed tracking-[0.14em]">
          {electionName}
          <br />
          {/* Date sits between paper-3 (election name) and paper-4 — lighter
              than before, still recessed from the election name above. */}
          <span
            style={{
              color:
                "color-mix(in oklch, var(--color-paper-3) 60%, var(--color-paper-4))",
            }}
          >
            {electionDate}
          </span>
        </div>

        {/* Quick actions: Top + Change location. Top is ALWAYS visible —
            disabled (muted) when already at the top. */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            disabled={!showBackToTop}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all font-mono-cap text-[9px] tracking-[0.18em] ${
              showBackToTop
                ? "border-[var(--color-ink-3)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)]"
                : "border-[var(--color-ink-3)] text-[var(--color-paper-4)] cursor-default"
            }`}
            aria-label="Back to top"
          >
            <ArrowUp size={10} />
            Top
          </button>
          {/* Change → back to the landing page so the user can re-pick
              ZIP + election. The landing page lives at /. */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ink-3)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)] px-2.5 py-1 transition-all font-mono-cap text-[9px] tracking-[0.18em]"
            aria-label="Change location or election"
          >
            <MapPin size={10} />
            Change
          </Link>
        </div>
      </div>

      {/* Race nav */}
      <nav className="flex-1 overflow-y-auto p-3 pr-2">
        <ol className="flex flex-col gap-0.5">
          {races.map((race, i) => (
            <RaceNavItem
              key={race.id}
              race={race}
              index={i + 1}
              // Expand when EITHER the cursor is over the row OR the
              // user has scrolled to this race's section. Collapse only
              // when neither is true.
              expanded={hoveredRaceId === race.id || activeRaceId === race.id}
              active={activeRaceId === race.id}
              activeCandidateId={activeCandidateId}
              onMouseEnter={() => setHoveredRaceId(race.id)}
              onMouseLeave={() =>
                setHoveredRaceId((prev) => (prev === race.id ? null : prev))
              }
            />
          ))}
        </ol>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--color-ink-3)] text-[11px] text-[var(--color-paper-3)] font-mono-cap tracking-[0.16em]">
        Live data · {races.length} races
      </div>
    </aside>
  );
}

function RaceNavItem({
  race,
  index,
  expanded,
  active,
  activeCandidateId,
  onMouseEnter,
  onMouseLeave,
}: {
  race: Race;
  index: number;
  expanded: boolean;
  active: boolean;
  activeCandidateId: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const activeCount = race.candidates.filter(
    (c) => !c.withdrawn && !c.campaignSuspended
  ).length;

  // When a candidate inside this race is the active scroll-spy target,
  // we suppress the race row's own active highlight — the candidate
  // highlight is the more specific signal, and showing both at once
  // looks doubled-up.
  const candidateInThisRace = activeCandidateId?.startsWith(`candidate-${race.id}-`) ?? false;
  const showRaceActive = active && !candidateInThisRace;

  return (
    <li onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <a
        href={`#race-${race.id}`}
        className={`group flex items-start gap-2.5 rounded-md px-3 py-2.5 transition-colors ${
          showRaceActive
            ? "bg-[var(--color-ink-2)] text-[var(--color-paper)]"
            : "text-[var(--color-paper-2)] hover:bg-[var(--color-ink-1)] hover:text-[var(--color-paper)]"
        }`}
      >
        <span className="font-mono race-number text-[10px] text-[var(--color-paper-3)] mt-1 w-5 shrink-0">
          {String(index).padStart(2, "0")}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-medium leading-tight text-balance">
            {race.office}
          </span>
          <span className="block text-[10px] font-mono-cap text-[var(--color-paper-3)] mt-1 tracking-[0.14em]">
            {race.unopposed ? "Unopposed" : `${activeCount} active`}
          </span>
        </span>
        <ChevronRight
          size={14}
          className={`mt-1 shrink-0 text-[var(--color-paper-3)] transition-transform ${
            expanded ? "rotate-90 text-[var(--color-accent)]" : ""
          }`}
        />
      </a>

      {/* Expanded candidate list */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <ul className="ml-7 mt-0.5 mb-1 border-l border-[var(--color-ink-3)] pl-2">
            {race.candidates
              .filter((c) => !c.withdrawn)
              .map((cand) => {
                const candId = `candidate-${race.id}-${cand.id}`;
                const isActive = activeCandidateId === candId;
                return (
                  <li key={cand.id}>
                    <a
                      href={`#${candId}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors ${
                        isActive
                          ? "bg-[var(--color-ink-2)] text-[var(--color-paper)]"
                          : "text-[var(--color-paper-3)] hover:text-[var(--color-paper)] hover:bg-[var(--color-ink-1)]"
                      }`}
                    >
                      <span className={`w-1 h-1 rounded-full ${partyDot(cand.party)}`} />
                      <span className="truncate flex-1">{cand.name}</span>
                      <CandidateNavStat candidate={cand} />
                    </a>
                  </li>
                );
              })}
          </ul>
        </div>
      </div>
    </li>
  );
}

/**
 * Polling % colored by trend in the sidebar candidate list.
 *   up   → green
 *   flat → light gray (lighter than the suspended pill)
 *   down → muted red (same as the trending-down arrow)
 *   suspended → "susp." in the existing muted-paper-4
 */
function CandidateNavStat({ candidate }: { candidate: Race["candidates"][number] }) {
  if (candidate.campaignSuspended) {
    return (
      <span className="font-mono-cap text-[8px] text-[var(--color-paper-4)] tracking-[0.18em]">
        susp.
      </span>
    );
  }
  if (candidate.pollingPct == null) return null;

  const tone =
    candidate.trend === "up"
      ? "text-[var(--color-tint-green)]"
      : candidate.trend === "down"
      ? "text-[var(--color-trend-down)]"
      : "text-[var(--color-paper-3)]";

  return (
    <span
      className={`font-mono race-number text-[10px] tabular-nums ${tone}`}
      aria-label={`Polling ${candidate.pollingPct} percent`}
    >
      {candidate.pollingPct}%
    </span>
  );
}
