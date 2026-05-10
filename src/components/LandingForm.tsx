"use client";

import { useEffect, useState } from "react";
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
  /** Server Action that takes (zip, electionId) and redirects. */
  action: (formData: FormData) => Promise<void>;
}

export function LandingForm({ action }: LandingFormProps) {
  const [zip, setZip] = useState("");
  const [pending, setPending] = useState(false);

  // Elections are loaded lazily after the zip resolves.
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  const validZip = /^\d{5}$/.test(zip);

  useEffect(() => {
    if (!validZip) {
      setElections([]);
      setElectionId("");
      setZipError(null);
      setZipLoading(false);
      return;
    }

    setZipLoading(true);
    setZipError(null);

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/zip/${zip}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setZipLoading(false);
            setElections([]);
            setElectionId("");
            setZipError(res.status === 404 ? "ZIP code not found." : "Could not verify ZIP.");
          }
          return;
        }
        const data = (await res.json()) as {
          state?: string;
          elections?: Election[];
        };
        if (!cancelled) {
          const loaded = data.elections ?? [];
          setElections(loaded);
          setElectionId(loaded[0]?.id ?? "");
          setZipLoading(false);
          setZipError(loaded.length === 0 ? "No upcoming elections found for your area." : null);
        }
      } catch {
        if (!cancelled) {
          setZipLoading(false);
          setElections([]);
          setElectionId("");
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [zip, validZip]);

  const canSubmit = validZip && !zipLoading && elections.length > 0 && !!electionId && !pending;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Brand */}
      <div className="font-mono-cap text-[11px] text-[var(--color-paper-3)] mb-4 tracking-[0.18em]">
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
              type="tel"
              autoComplete="postal-code"
              autoCorrect="off"
              autoCapitalize="off"
              placeholder="94015"
              required
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg pl-10 pr-4 py-3 text-[18px] font-mono tabular-nums text-[var(--color-paper)] placeholder:text-[var(--color-paper-4)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
          {zipError && (
            <p className="text-[11px] font-mono-cap text-[var(--color-trend-down)] tracking-[0.12em]">
              {zipError}
            </p>
          )}
        </div>

        {/* Election — only shown once elections load */}
        {elections.length > 0 && (
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
              className="w-full bg-[var(--color-ink-1)] border border-[var(--color-ink-3)] rounded-lg px-4 py-3 text-[15px] text-[var(--color-paper)] focus:outline-none focus:border-[var(--color-accent)] transition-colors appearance-none bg-no-repeat bg-[length:14px] bg-[position:right_1rem_center]"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2378736d' stroke-width='2'><path d='m6 9 6 6 6-6'/></svg>\")",
              }}
            >
              {elections.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {formatBallotDate(e.date)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed text-[var(--color-ink-0)] font-medium px-5 py-3 text-[14px] transition-all"
        >
          {pending ? "Loading your ballot…" : zipLoading ? "Checking ZIP…" : "Get Started"}
          {!pending && !zipLoading && <ArrowRight size={14} />}
        </button>

        <p className="mt-3 text-center text-[11px] text-[var(--color-paper-4)] font-mono-cap tracking-[0.16em]">
          Demo data · ZIP 94015 (Daly City, CA) is fully wired
        </p>
      </form>
    </div>
  );
}
