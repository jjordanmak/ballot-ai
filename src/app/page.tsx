import { Sidebar } from "@/components/Sidebar";
import { RaceHeader } from "@/components/RaceHeader";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CandidateProfile } from "@/components/CandidateProfile";
import { CandidatesHeader } from "@/components/CandidatesHeader";
import { AboutGuide } from "@/components/AboutGuide";
import { UpdateBar } from "@/components/UpdateBar";
import { races } from "@/data/races";

/** TODO(v2): replace with a per-user lookup driven by ZIP. The Cover and
 * filtering of races will then key off this object. */
const BALLOT_CONTEXT = {
  product: "Ballot.ai",
  jurisdiction: "Daly City, CA · 94015",
  county: "San Mateo County",
  electionName: "Statewide Direct Primary Election",
  electionDate: "June 2, 2026",
};

export default function Home() {
  return (
    <div className="flex">
      <Sidebar races={races} />

      <main className="flex-1 min-w-0 px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1400px] pb-32">
        {/* Cover */}
        <Cover />

        {/* Each race */}
        {races.map((race, i) => {
          // Profiles still RENDER suspended candidates (with the suspended
          // banner) but aren't counted in the headline candidate number.
          const profileCandidates = race.candidates.filter((c) => !c.withdrawn);
          const activeCandidates = profileCandidates.filter((c) => !c.campaignSuspended);
          // Leader polling % drives the relative scaling of every candidate's bar.
          const leaderPct = Math.max(
            0,
            ...activeCandidates.map((c) => c.pollingPct ?? 0)
          );
          return (
            <section
              key={race.id}
              id={`race-${race.id}`}
              className="scroll-mt-4"
              data-race-id={race.id}
            >
              <RaceHeader race={race} index={i + 1} />

              {!race.unopposed && <ComparisonTable race={race} />}

              {/* Profiles — wrapped in a client component that owns
                  expand-all / collapse-all state for the whole list. */}
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

function Cover() {
  const totalCandidates = races.reduce(
    (n, r) => n + r.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended).length,
    0
  );

  return (
    <header className="pt-14 pb-10 border-b border-[var(--color-ink-3)]">
      {/* Eyebrow = location (mirrors site header in sidebar) */}
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
