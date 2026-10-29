/**
 * The deprecated June 2, 2026 CA primary prototype, rendered from its frozen
 * snapshot (scripts/snapshot-deprecated.ts). Internal reference only: the
 * route 404s in production. A render test keeps shared-component changes
 * from silently breaking it.
 */
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { RaceHeader } from "@/components/RaceHeader";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CandidatesHeader } from "@/components/CandidatesHeader";
import { AboutGuide } from "@/components/AboutGuide";
import type { Race } from "@/data/types";
import snapshot from "@/data/deprecated/2026-06-02-ca-primary.json";

export interface DeprecatedBallot {
  jurisdiction: { zip: string; city: string | null; county: string | null; state: string; districts: Record<string, string | number | undefined> };
  races: Race[];
}

/** Whether deprecated pages may be shown in this deployment. */
export function deprecatedPagesEnabled(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env !== "production";
}

export function deprecatedBallot(electionId: string, zip: string): DeprecatedBallot | null {
  if (electionId !== snapshot.election.id) return null;
  return ((snapshot.ballots as Record<string, unknown>)[zip] as DeprecatedBallot | undefined) ?? null;
}

export function DeprecatedBallotView({ ballot }: { ballot: DeprecatedBallot }) {
  const { jurisdiction, races } = ballot;
  const election = snapshot.election;
  const zip = jurisdiction.zip;

  const totalCandidates = races.reduce(
    (n, r) => n + r.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended).length,
    0
  );

  const locationLabel = jurisdiction.city
    ? `${jurisdiction.city}, ${jurisdiction.state} · ${zip}`
    : `${jurisdiction.state} · ${zip}`;

  // Second line under the city/ZIP — shows county + the specific district
  // codes that determined which races appear on this ballot.
  const districtsLabel = (() => {
    const parts: string[] = [];
    if (jurisdiction.county) parts.push(`${jurisdiction.county} County`);
    const d = jurisdiction.districts;
    if (d.us_house != null) parts.push(`CA-${d.us_house}`);
    if (d.state_assembly != null) parts.push(`AD-${d.state_assembly}`);
    if (d.state_senate != null) parts.push(`SD-${d.state_senate}`);
    if (d.boe != null) parts.push(`BOE-${d.boe}`);
    return parts.join(" · ");
  })();

  const [y, m, d] = election.date.slice(0, 10).split("-").map(Number);
  const electionDate = new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col lg:flex-row">
      <MobileNav
        races={races}
        electionName={election.name}
        location={locationLabel}
        electionDate={electionDate}
      />
      <Sidebar
        races={races}
        productName="ballot.ai"
        location={locationLabel}
        electionName={election.name}
        electionDate={electionDate}
      />

      <main className="flex-1 min-w-0 px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1400px] pb-32">
        <div className="mt-6 rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">
          <span className="font-mono-cap text-[10px] tracking-[0.16em] text-[var(--color-paper-3)]">Deprecated · internal only</span>{" "}
          The June 2, 2026 primary prototype, frozen for internal reference. Not shown to voters.{" "}
          <Link href="/" className="underline hover:text-[var(--color-accent)]">Current ballot lookup</Link>.
        </div>
        <Cover
          races={races}
          totalCandidates={totalCandidates}
          locationLabel={locationLabel}
          districtsLabel={districtsLabel}
          electionName={election.name}
          electionDate={electionDate}
        />

        {races.map((race, i) => {
          const profileCandidates = race.candidates.filter((c) => !c.withdrawn);
          const activeCandidates = profileCandidates.filter((c) => !c.campaignSuspended);
          return (
            <section
              key={race.id}
              id={`race-${race.id}`}
              className="scroll-mt-4"
              data-race-id={race.id}
            >
              <RaceHeader race={race} index={i + 1} />

              {!race.unopposed && <ComparisonTable race={race} />}

              <CandidatesHeader
                profileCandidates={profileCandidates}
                activeCount={activeCandidates.length}
                suspendedCount={profileCandidates.filter((c) => c.campaignSuspended).length}
                raceId={race.id}
                unopposed={race.unopposed}
              />
            </section>
          );
        })}

        <AboutGuide />
      </main>
    </div>
  );
}

function Cover({
  races,
  totalCandidates,
  locationLabel,
  districtsLabel,
  electionName,
  electionDate,
}: {
  races: Race[];
  totalCandidates: number;
  locationLabel: string;
  districtsLabel: string;
  electionName: string;
  electionDate: string;
}) {
  return (
    <header className="pt-14 pb-10 border-b border-[var(--color-ink-3)]">
      <div className="font-mono-cap text-[11px] text-[var(--color-accent)] mb-3 tracking-[0.16em]">
        A guide to your ballot
      </div>

      <h1 className="font-display text-[44px] sm:text-[60px] xl:text-[76px] leading-[0.95] tracking-[-0.03em] text-balance">
        Voter{"’"}s Guide
      </h1>

      <p className="mt-6 max-w-2xl text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty no-auto-highlight">
        <mark>Every race, every candidate</mark> on your ballot. Compared side by side, profiled in depth, and continuously updated from verified public sources.
      </p>

      <h2 className="font-display italic font-light text-[22px] sm:text-[26px] mt-8 text-[var(--color-paper-2)] text-balance">
        {electionName}
        <span className="text-[var(--color-paper-3)]"> · {electionDate}</span>
      </h2>

      {/* Location below the election name — primary city/ZIP line +
          secondary line with county and district codes that determined
          which races are on this ballot. */}
      <div className="mt-1.5 font-mono-cap text-[15px] text-[var(--color-paper-2)] tracking-[0.18em]">
        {locationLabel}
      </div>
      {districtsLabel && (
        <div className="mt-1 font-mono-cap text-[11px] text-[var(--color-paper-4)] tracking-[0.18em]">
          {districtsLabel}
        </div>
      )}

      <div className="mt-12 flex flex-wrap items-end gap-x-10 gap-y-6">
        <Stat label="Races on your ballot" value={String(races.length)} />
        <Stat label="Active candidates" value={String(totalCandidates)} />
        <Stat label="Status" value="Frozen snapshot" />
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono-cap text-[var(--color-paper-4)] text-[9px] tracking-[0.18em]">
        {label}
      </div>
      <div className="text-[var(--color-paper)] text-[14px] mt-1 font-mono race-number tabular-nums">
        {value}
      </div>
    </div>
  );
}
