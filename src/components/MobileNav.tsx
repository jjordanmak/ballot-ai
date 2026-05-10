"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowUp, MapPin, ChevronRight } from "lucide-react";
import type { Race } from "@/data/types";
import { partyDot } from "./PartyTag";
import { useScrollSpy } from "@/hooks/useScrollSpy";

interface MobileNavProps {
  races: Race[];
  electionName: string;
  location: string;
  electionDate: string;
}

export function MobileNav({ races, electionName, location, electionDate }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { activeRaceId, activeCandidateId, showBackToTop } = useScrollSpy(races);

  const scrollToRace = (raceId: string) => {
    setIsOpen(false);
    // Small delay so drawer close animation starts before scroll
    setTimeout(() => {
      document.getElementById(`race-${raceId}`)?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  return (
    <>
      {/* Top bar — mobile only */}
      <nav className="sticky top-0 z-50 h-14 flex items-center justify-between px-5 border-b border-[var(--color-ink-3)] bg-[var(--color-ink-0)] lg:hidden">
        {/* Brand */}
        <span className="font-display text-[22px] leading-none tracking-[-0.02em]">
          ballot<span className="text-[var(--color-paper-3)]">.ai</span>
        </span>

        {/* Election context */}
        <span className="flex-1 mx-4 font-mono-cap text-[9px] text-[var(--color-paper-3)] tracking-[0.14em] truncate text-right">
          {location}
        </span>

        {/* Hamburger */}
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-paper-2)] hover:text-[var(--color-paper)] hover:bg-[var(--color-ink-1)] transition-colors"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
      </nav>

      {/* Drawer overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[200] lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />

          {/* Drawer panel */}
          <aside className="absolute inset-y-0 left-0 w-[300px] flex flex-col bg-[var(--color-ink-0)] border-r border-[var(--color-ink-3)]">
            {/* Drawer header */}
            <div className="p-6 pb-5 border-b border-[var(--color-ink-3)]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-display text-[28px] leading-none tracking-[-0.02em]">
                    ballot<span className="text-[var(--color-paper-3)]">.ai</span>
                  </h2>
                  <div className="font-mono-cap text-[10px] text-[var(--color-accent)] mt-3 tracking-[0.16em]">
                    {location}
                  </div>
                  <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mt-1.5 leading-relaxed tracking-[0.14em]">
                    {electionName}
                    <br />
                    <span
                      style={{
                        color: "color-mix(in oklch, var(--color-paper-3) 60%, var(--color-paper-4))",
                      }}
                    >
                      {electionDate}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-paper-3)] hover:text-[var(--color-paper)] hover:bg-[var(--color-ink-1)] transition-colors mt-0.5"
                  aria-label="Close navigation"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Race nav */}
            <nav className="flex-1 overflow-y-auto p-3 pr-2">
              <ol className="flex flex-col gap-0.5">
                {races.map((race, i) => {
                  const active = activeRaceId === race.id;
                  const candidateInThisRace =
                    activeCandidateId?.startsWith(`candidate-${race.id}-`) ?? false;
                  const showRaceActive = active && !candidateInThisRace;
                  const activeCount = race.candidates.filter(
                    (c) => !c.withdrawn && !c.campaignSuspended
                  ).length;

                  return (
                    <li key={race.id}>
                      <button
                        onClick={() => scrollToRace(race.id)}
                        className={`w-full flex items-start gap-2.5 rounded-md px-3 py-2.5 transition-colors text-left ${
                          showRaceActive
                            ? "bg-[var(--color-ink-2)] text-[var(--color-paper)]"
                            : "text-[var(--color-paper-2)] hover:bg-[var(--color-ink-1)] hover:text-[var(--color-paper)]"
                        }`}
                      >
                        <span className="font-mono race-number text-[10px] text-[var(--color-paper-3)] mt-1 w-5 shrink-0">
                          {String(i + 1).padStart(2, "0")}
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
                            active ? "rotate-90 text-[var(--color-accent)]" : ""
                          }`}
                        />
                      </button>

                      {/* Active candidate highlight */}
                      {active && activeCandidateId && candidateInThisRace && (
                        <ul className="ml-7 mt-0.5 mb-1 border-l border-[var(--color-ink-3)] pl-2">
                          {race.candidates
                            .filter((c) => !c.withdrawn)
                            .map((cand) => {
                              const candId = `candidate-${race.id}-${cand.id}`;
                              const isActive = activeCandidateId === candId;
                              return (
                                <li key={cand.id}>
                                  <button
                                    onClick={() => {
                                      setIsOpen(false);
                                      setTimeout(() => {
                                        document
                                          .getElementById(candId)
                                          ?.scrollIntoView({ behavior: "smooth" });
                                      }, 50);
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors text-left ${
                                      isActive
                                        ? "bg-[var(--color-ink-2)] text-[var(--color-paper)]"
                                        : "text-[var(--color-paper-3)] hover:text-[var(--color-paper)] hover:bg-[var(--color-ink-1)]"
                                    }`}
                                  >
                                    <span className={`w-1 h-1 rounded-full shrink-0 ${partyDot(cand.party)}`} />
                                    <span className="truncate flex-1">{cand.name}</span>
                                  </button>
                                </li>
                              );
                            })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Footer actions */}
            <div className="p-4 border-t border-[var(--color-ink-3)] flex items-center gap-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
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
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-ink-3)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] text-[var(--color-paper-3)] px-2.5 py-1 transition-all font-mono-cap text-[9px] tracking-[0.18em]"
                aria-label="Change location or election"
              >
                <MapPin size={10} />
                Change
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
