"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import type { Election } from "@/lib/db/getElection";

/** Format a YYYY-MM-DD date string locally — date-only values from
 * Postgres should NOT round-trip through UTC, which can shift them by a
 * day in negative timezones. */
function formatBallotDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface LandingFormProps {
  elections: Election[];
  defaultElectionId: string;
  /** Server Action that takes (zip, electionId) and redirects. */
  action: (formData: FormData) => Promise<void>;
}

export function LandingForm({ elections, defaultElectionId, action }: LandingFormProps) {
  const [zip, setZip] = useState("");
  const [electionId, setElectionId] = useState(defaultElectionId);
  const [pending, setPending] = useState(false);
  // Resolved state for the current ZIP (drives the election dropdown).
  const [zipState, setZipState] = useState<string | null>(null);

  const validZip = /^\d{5}$/.test(zip);

  // When a valid 5-digit ZIP is typed, resolve to a state so we can
  // filter the election dropdown. Light debounce so we don't hammer the
  // endpoint on every keystroke.
  useEffect(() => {
    if (!validZip) {
      setZipState(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/zip/${zip}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { state?: string };
        if (data.state) setZipState(data.state);
      } catch {
        /* swallow */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [zip, validZip]);

  // Filter elections by the resolved state. Until a ZIP resolves, show
  // every election in the catalog.
  const visibleElections = useMemo(() => {
    if (!zipState) return elections;
    return elections.filter((e) => e.state === zipState);
  }, [elections, zipState]);

  // If the current selection drops out of the filtered list, reset.
  useEffect(() => {
    if (visibleElections.length === 0) return;
    if (!visibleElections.some((e) => e.id === electionId)) {
      setElectionId(visibleElections[0].id);
    }
  }, [visibleElections, electionId]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Brand */}
      <div className="font-mono-cap text-[11px] text-[var(--color-paper-3)] mb-4 tracking-[0.18em] flex items-center gap-2">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        A guide to your ballot
      </div>

      <h1 className="font-display text-[64px] sm:text-[96px] xl:text-[120px] leading-[0.92] tracking-[-0.03em] text-balance text-center">
        ballot<span className="text-[var(--color-paper-3)]">.ai</span>
      </h1>

      <p className="mt-6 max-w-xl text-center text-[16px] sm:text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty">
        <mark>Every race, every candidate</mark> on your ballot. Compared side by side, profiled in depth, and continuously updated from verified public sources.
      </p>

      {/* The form */}
      <form
        action={action}
        onSubmit={() => setPending(true)}
        className="mt-14 w-full max-w-md flex flex-col gap-4"
      >
        {/* ZIP */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="zip"
            className="font-mono-cap text-[10px] text-[var(--color-paper-3)] tracking-[0.18em]"
          >
            Your ZIP code
          </label>
          <div className="relative">
            <MapPin
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-paper-3)] pointer-events-none"
            />
            <input
              id="zip"
              name="zip"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              placeholder="94015"
              required
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg pl-10 pr-4 py-3 text-[18px] font-mono tabular-nums text-[var(--color-paper)] placeholder:text-[var(--color-paper-4)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
        </div>

        {/* Election */}
        <div className="flex flex-col gap-2">
          <label
            htmlFor="electionId"
            className="font-mono-cap text-[10px] text-[var(--color-paper-3)] tracking-[0.18em]"
          >
            Pick an election
          </label>
          <select
            id="electionId"
            name="electionId"
            required
            value={electionId}
            onChange={(e) => setElectionId(e.target.value)}
            disabled={visibleElections.length === 0}
            className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg px-4 py-3 text-[15px] text-[var(--color-paper)] focus:outline-none focus:border-[var(--color-accent)] transition-colors appearance-none bg-no-repeat bg-[length:14px] bg-[position:right_1rem_center] disabled:opacity-50"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378736d' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>\")",
            }}
          >
            {visibleElections.length === 0 && (
              <option value="">
                {zipState ? `No elections found for ${zipState}` : "No elections available"}
              </option>
            )}
            {visibleElections.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {formatBallotDate(e.date)}
              </option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!validZip || pending}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-ink-0)] font-medium px-5 py-3 text-[14px] transition-all"
        >
          {pending ? "Loading your ballot…" : "Get Started"}
          {!pending && <ArrowRight size={14} />}
        </button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-paper-4)] font-mono-cap tracking-[0.16em]">
          Demo data · ZIP 94015 (Daly City, CA) is fully wired
        </p>
      </form>
    </div>
  );
}
