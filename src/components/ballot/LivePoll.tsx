"use client";

/**
 * The newest published poll for a race, live from the page's feed. Falls
 * back to the server-rendered researched poll (children) until one exists.
 * Bars run highest to lowest (owner decision 2026-10-29); every poll shows
 * pollster, field dates, sample and margin of error, links the pollster's
 * release, and credits Wikipedia, where the poll list comes from.
 */
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { Party } from "@/data/types";
import { partyDot, partyLabel } from "@/components/PartyTag";
import { useContestRows, type FeedRow } from "./LiveFeed";

export interface PollPayload {
  pollster: string;
  start: string | null;
  end: string;
  sample: number | null;
  population: string | null;
  moe: number | null;
  results: { candidateId: string; name: string; pct: number }[];
  undecided: number | null;
  releaseUrl: string | null;
  wikipediaUrl: string;
}

export interface PollCandidate {
  candidateId: string;
  party: Party;
  partyName?: string;
}

function fieldDates(p: PollPayload): string {
  const fmt = (d: string, withYear: boolean) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });
  if (!p.start || p.start === p.end) return fmt(p.end, true);
  // Same month: "Oct 20–22, 2026"; otherwise "Sep 28–Oct 2, 2026".
  if (p.start.slice(0, 7) === p.end.slice(0, 7)) return `${fmt(p.start, false)}–${Number(p.end.slice(8, 10))}, ${p.end.slice(0, 4)}`;
  return `${fmt(p.start, false)}–${fmt(p.end, true)}`;
}

/** Newest published poll for a contest, from the live feed. */
export function useLatestPoll(contestId: string | undefined): PollPayload | undefined {
  const rows: FeedRow[] = useContestRows(contestId, "poll");
  return rows[0]?.payload as unknown as PollPayload | undefined;
}

export function LivePoll({
  contestId,
  candidates,
  className,
  children,
}: {
  contestId?: string;
  candidates: PollCandidate[];
  className?: string;
  children: ReactNode;
}) {
  const poll = useLatestPoll(contestId);
  if (!poll) return <>{children}</>;
  const byId = new Map(candidates.map((c) => [c.candidateId, c]));
  const results = [...poll.results].sort((a, b) => b.pct - a.pct);
  const max = Math.max(1, ...results.map((r) => r.pct));
  const label = [
    poll.pollster,
    fieldDates(poll),
    poll.sample ? `${poll.sample.toLocaleString("en-US")}${poll.population ? ` ${poll.population}` : ""}` : "",
    poll.moe ? `±${poll.moe}%` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const link = "font-mono-cap text-[9px] text-[var(--color-paper-4)] hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-1";

  return (
    <div className={className}>
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3 flex items-center gap-2">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        Latest polling
      </div>
      <div className="rounded-lg bg-[var(--color-ink-1)] p-4 space-y-2.5">
        {results.map((r) => {
          const c = byId.get(r.candidateId);
          const dot = c ? partyDot(c.party) : "bg-[var(--color-np)]";
          return (
            <div key={r.candidateId} className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-paper)] w-[150px] min-w-0 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                <span className="truncate">{r.name}</span>
                {c && <span className="shrink-0 text-[10px] text-[var(--color-paper-3)]">{partyLabel(c.party, c.partyName)}</span>}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[var(--color-ink-3)] overflow-hidden">
                <div className={`h-full rounded-full ${dot}`} style={{ width: `${(r.pct / max) * 100}%` }} />
              </div>
              <span className="font-mono race-number text-[12px] text-[var(--color-paper)] w-10 text-right tabular-nums">{r.pct}%</span>
            </div>
          );
        })}
        <div className="pt-2 mt-2 border-t border-[var(--color-ink-3)] flex items-center justify-between gap-3">
          {poll.releaseUrl ? (
            <a href={poll.releaseUrl} target="_blank" rel="noopener noreferrer" className={link}>
              {label} <ArrowUpRight size={10} className="opacity-80" />
            </a>
          ) : (
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)]">{label}</span>
          )}
          {poll.undecided != null && <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)] shrink-0">Undecided {poll.undecided}%</span>}
        </div>
        <a href={poll.wikipediaUrl} target="_blank" rel="noopener noreferrer" className={link}>
          Poll list via Wikipedia (CC BY-SA) <ArrowUpRight size={10} className="opacity-80" />
        </a>
      </div>
    </div>
  );
}
