import { Sidebar } from "@/components/Sidebar";
import { RaceHeader } from "@/components/RaceHeader";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CandidatesHeader } from "@/components/CandidatesHeader";
import { AboutGuide } from "@/components/AboutGuide";
import { UpdateBar } from "@/components/UpdateBar";
import { getBallot } from "@/lib/db/getBallot";

/**
 * For now, the home page hard-codes ZIP=94015 + ca-2026-primary so we can
 * verify the DB-powered render. Phase 2 introduces a landing page that
 * collects a ZIP from the user and routes to /ballot/[zip]/[electionId].
 */
const DEFAULT_ZIP = "94015";
const DEFAULT_ELECTION_ID = "ca-2026-primary";

const BALLOT_CONTEXT = {
  product: "Ballot.ai",
  jurisdiction: "Daly City, CA · 94015",
  county: "San Mateo County",
  electionName: "Statewide Direct Primary Election",
  electionDate: "June 2, 2026",
};

// Disable static optimization — this page reads from Supabase on each
// request so the data is fresh after seed updates / cron writes.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Fetches all races for the voter's ballot from Supabase, including
  // candidates / endorsements / news.
  const races = await getBallot(DEFAULT_ZIP, DEFAULT_ELECTION_ID);

  const totalCandidates = races.reduce(
    (n, r) => n + r.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended).length,
    0
  );

  return (
    <div className="flex">
      <Sidebar races={races} />

      <main className="flex-1 min-w-0 px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1400px] pb-32">
        <Cover races={races} totalCandidates={totalCandidates} />

        {races.map((race, i) => {
          const profileCandidates = race.candidates.filter((c) => !c.withdrawn);
          const activeCandidates = profileCandidates.filter((c) => !c.campaignSuspended);
          const leaderPct = Math.max(0, ...activeCandidates.map((c) => c.pollingPct ?? 0));
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
                leaderPct={leaderPct}
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
}: {
  races: Awaited<ReturnType<typeof getBallot>>;
  totalCandidates: number;
}) {
  return (
    <header className="pt-14 pb-10 border-b border-[var(--color-ink-3)]">
      <div className="font-mono-cap text-[11px] text-[var(--color-accent)] mb-3 flex items-center gap-2 tracking-[0.16em]">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        {BALLOT_CONTEXT.jurisdiction}
      </div>

      <h1 className="font-display text-[64px] sm:text-[88px] xl:text-[108px] leading-[0.92] tracking-[-0.03em] text-balance">
        Voter{"’"}s Guide
      </h1>
      <h2 className="font-display italic font-light text-[22px] sm:text-[26px] mt-4 text-[var(--color-paper-2)] text-balance">
        {BALLOT_CONTEXT.electionName}
        <span className="text-[var(--color-paper-3)]"> · {BALLOT_CONTEXT.electionDate}</span>
      </h2>

      <p className="mt-8 max-w-2xl text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty no-auto-highlight">
        <mark>Every race. Every candidate.</mark> Compared side by side, profiled in depth, and continuously updated from verified public sources.
      </p>

      <div className="mt-12 flex flex-wrap items-end gap-x-10 gap-y-6">
        <Stat label="Races on your ballot" value={String(races.length)} />
        <Stat label="Active candidates" value={String(totalCandidates)} />
        <Stat label="Election day" value={BALLOT_CONTEXT.electionDate} />
        <UpdateBar />
      </div>
    </header>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
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
