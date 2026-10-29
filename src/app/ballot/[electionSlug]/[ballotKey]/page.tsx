import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Columns3, ExternalLink, Info, ListChecks, Mail } from "lucide-react";
import { AddressForm } from "@/components/AddressForm";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { RaceHeader } from "@/components/RaceHeader";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CandidatesHeader } from "@/components/CandidatesHeader";
import { DistrictLine } from "@/components/ballot/DistrictLine";
import { MeasureCard } from "@/components/ballot/MeasureCard";
import { Researching } from "@/components/ballot/Citations";
import type { Race } from "@/data/types";
import { CATEGORY_LABEL, type ResolvedBallot } from "@/domain/ballot";
import { formatElectionDate, locationLabel, locationLine, STATUS_COPY } from "@/lib/ballot/copy";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { loadBallot } from "@/lib/ballot/loadBallot";
import { toRaces, type MeasureView } from "@/lib/ballot/toRaces";
import { districtsFrom } from "@/domain/districts";

// Reads a short-lived, address-free resolution per request.
export const dynamic = "force-dynamic";

type Params = Promise<{ electionSlug: string; ballotKey: string }>;

/** Measures are listed in the nav as two pseudo races (statewide / local), one row per measure. */
const MEASURE_GROUPS = [
  { id: "measures-state", statewide: true, title: "State propositions", eyebrow: "Statewide" },
  { id: "measures-local", statewide: false, title: "Local measures", eyebrow: "County, city and district" },
] as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { electionSlug, ballotKey } = await params;
  const result = await loadBallot(electionSlug, ballotKey);
  const where = result.state === "ok" ? locationLabel(result.ballot.location) : "";
  return {
    title: where ? `ballot.ai • your voting guide for ${where}` : "ballot.ai • your voting guide",
    // Address-derived pages are never indexed (PRD §17).
    robots: { index: false, follow: false },
  };
}

export default async function BallotPage({ params }: { params: Params }) {
  const { electionSlug, ballotKey } = await params;
  const result = await loadBallot(electionSlug, ballotKey);
  if (result.state !== "ok") return <ExpiredBallot />;

  const ballot = result.ballot;
  const { races, measures } = toRaces(ballot, getEnrichment(electionSlug));
  // Tab title stays "City, ST"; the sidebar and header add the ZIP.
  const location = locationLine(ballot.location);
  const onBallot = new Set(districtsFrom([], ballot.contests).map((d) => d.kind));
  const electionName = ballot.election?.name ?? "Your ballot";
  const electionDate = ballot.election ? formatElectionDate(ballot.election.date) : "";
  const measureGroups = MEASURE_GROUPS.map((g) => ({ ...g, items: measures.filter((m) => m.statewide === g.statewide) })).filter(
    (g) => g.items.length > 0,
  );
  const navRaces = [...races, ...measureGroups.map((g) => measuresNavRace(g.id, g.title, g.items))];
  const officialUrl = ballot.administration?.electionInfoUrl ?? ballot.administration?.ballotInfoUrl;
  const totalCandidates = races.reduce((n, r) => n + r.candidates.length, 0);

  return (
    <div className="flex flex-col lg:flex-row">
      <MobileNav races={navRaces} electionName={electionName} location={location} electionDate={electionDate} />
      <Sidebar
        races={navRaces}
        productName="ballot.ai"
        location={location}
        electionName={electionName}
        electionDate={electionDate}
        footer={`Live data · ${races.length} races · ${measures.length} measures`}
      />

      <main className="flex-1 min-w-0 px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1400px] pb-32">
        <Cover
          location={location}
          electionName={electionName}
          electionDate={electionDate}
          raceCount={races.length}
          measureCount={measures.length}
          candidateCount={totalCandidates}
          retrievedAt={ballot.retrievedAt}
          districtLine={
            <DistrictLine
              county={ballot.location.county}
              state={ballot.location.state}
              districts={ballot.districts ?? []}
              onBallot={onBallot}
            />
          }
        >
          <Notices ballot={ballot} officialUrl={officialUrl} />
        </Cover>

        {races.map((race, i) => (
          <section key={race.id} id={`race-${race.id}`} className="scroll-mt-4 pt-16" data-race-id={race.id}>
            <RaceHeader race={race} index={i + 1} />
            {race.issues.length > 0 && !race.unopposed ? (
              <ComparisonTable race={race} />
            ) : (
              race.candidates.length > 1 && <SideBySidePending />
            )}
            <CandidatesHeader
              profileCandidates={race.candidates}
              activeCount={race.candidates.length}
              suspendedCount={0}
              raceId={race.id}
              unopposed={race.unopposed}
              coverageNote="Every candidate on your ballot for this office has a profile. Sections fill in as we research them; every item links to its source, and nothing is published without one."
            />
          </section>
        ))}

        {measureGroups.map((g, gi) => (
          <section key={g.id} id={`race-${g.id}`} className="scroll-mt-4 pt-16" data-race-id={g.id}>
            <header className="pb-8 border-b border-[var(--color-ink-3)] mb-10">
              <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)] flex items-center gap-2 mb-6">
                <span className="race-number text-[var(--color-accent)] tabular-nums">
                  {String(races.length + gi + 1).padStart(2, "0")}
                </span>
                {g.eyebrow}
              </span>
              <h2 className="font-display text-[40px] sm:text-[50px] xl:text-[64px] leading-[0.95] tracking-[-0.025em]">
                {g.title}
              </h2>
              <div className="mt-5 font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 tracking-[0.16em]">
                <ListChecks size={12} className="text-[var(--color-accent)]" />
                {g.items.length} {g.items.length === 1 ? "measure" : "measures"} on your ballot
              </div>
            </header>
            <div className="space-y-5">
              {g.items.map((mv) => (
                <MeasureCard
                  key={mv.contest.id}
                  contest={mv.contest}
                  enrichment={mv.enrichment}
                  docs={mv.sourceDocs}
                  officialGuideUrl={officialUrl}
                  anchorId={`candidate-${g.id}-${mv.contest.id}`}
                />
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-20 pt-6 border-t border-[var(--color-ink-3)] text-[12px] leading-[1.6] text-[var(--color-paper-3)] max-w-2xl">
          ballot.ai is independent and nonpartisan. Which contests and candidates appear comes from official election data
          (sources listed on each race). Researched content is cited item by item. Your county elections office is the
          official source for your ballot.
        </footer>
      </main>
    </div>
  );
}

/** Same heading shape as ComparisonTable; shown until issue positions are researched and cited. */
function SideBySidePending() {
  return (
    <section className="mt-16 pt-8">
      <div className="mb-8 font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 tracking-[0.16em]">
        <Columns3 size={12} className="text-[var(--color-accent)]" />
        Side-by-side
      </div>
      <Researching what="The issue-by-issue comparison is" />
    </section>
  );
}

function measuresNavRace(id: string, office: string, measures: MeasureView[]): Race {
  return {
    id,
    office,
    group: CATEGORY_LABEL.measures,
    navLabel: `${measures.length} ${measures.length === 1 ? "measure" : "measures"}`,
    jurisdiction: "",
    format: "",
    formatExplainer: "",
    meta: [],
    unopposed: false,
    intro: { context: "", whyItMatters: "", bigPicture: "", whatsAtStake: "", polling: "" },
    issues: [],
    candidates: measures.map((mv) => ({
      id: mv.contest.id,
      name: mv.contest.measure?.identifier ?? mv.contest.title,
      party: "Nonpartisan",
      major: false,
      pollingStatus: "",
      currentRole: "",
      pastRoles: [],
      background: "",
      priorities: [],
      stances: [],
      strengths: [],
      criticisms: [],
      history: [],
      endorsements: [],
      voteForIf: [],
      bottomLine: "",
      issues: {},
    })),
  };
}

function Cover({
  location,
  electionName,
  electionDate,
  raceCount,
  measureCount,
  candidateCount,
  retrievedAt,
  districtLine,
  children,
}: {
  districtLine?: ReactNode;
  children?: ReactNode;
  location: string;
  electionName: string;
  electionDate: string;
  raceCount: number;
  measureCount: number;
  candidateCount: number;
  retrievedAt: string;
}) {
  return (
    <header className="pt-14 pb-10 border-b border-[var(--color-ink-3)]">
      <div className="font-mono-cap text-[11px] text-[var(--color-accent)] mb-3 tracking-[0.16em]">A guide to your ballot</div>
      <h1 className="font-display text-[44px] sm:text-[60px] xl:text-[76px] leading-[0.95] tracking-[-0.03em] text-balance">
        Voter{"’"}s Guide
      </h1>
      <p className="mt-6 max-w-3xl text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty no-auto-highlight">
        <mark>Every race, every candidate, every measure</mark> on your ballot, with every fact linked to its source.
      </p>
      <h2 className="font-display italic font-light text-[22px] sm:text-[26px] mt-8 text-[var(--color-paper-2)] text-balance">
        {electionName}
        {electionDate && <span className="text-[var(--color-paper-3)]"> · {electionDate}</span>}
      </h2>
      <div className="mt-1.5 font-mono-cap text-[15px] text-[var(--color-paper-2)] tracking-[0.18em]">{location}</div>
      {districtLine}
      <div className="mt-12 flex flex-wrap items-end gap-x-10 gap-y-6">
        <Stat label="Races on your ballot" value={String(raceCount)} />
        <Stat label="Candidates" value={String(candidateCount)} />
        <Stat label="Measures" value={String(measureCount)} />
        <Stat
          label="Ballot data retrieved"
          value={new Date(retrievedAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "America/Los_Angeles",
            timeZoneName: "short",
          })}
        />
      </div>
      {children}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono-cap text-[var(--color-paper-4)] text-[9px] tracking-[0.18em]">{label}</div>
      <div className="text-[var(--color-paper)] text-[14px] mt-1 font-mono race-number tabular-nums">{value}</div>
    </div>
  );
}

function Notices({ ballot, officialUrl }: { ballot: ResolvedBallot; officialUrl?: string }) {
  const admin = ballot.administration;
  return (
    <div className="mt-10 flex flex-col gap-3 max-w-3xl">
      {ballot.status === "PARTIAL" && (
        <div role="status" className="rounded-lg border border-[var(--color-accent-soft)] bg-[var(--color-ink-1)] px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] text-[var(--color-paper)] font-medium">
            <Info size={14} className="text-[var(--color-accent)]" aria-hidden /> {STATUS_COPY.PARTIAL.title}
          </p>
          <p className="mt-1 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">{STATUS_COPY.PARTIAL.body}</p>
        </div>
      )}
      {ballot.mailOnly && (
        <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3 flex items-center gap-2 text-[13px] text-[var(--color-paper-2)]">
          <Mail size={14} className="text-[var(--color-accent)]" aria-hidden /> Voters at this location vote by mail.
        </div>
      )}
      <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3 text-[13px] leading-[1.55] text-[var(--color-paper-2)]">
        Compare with your <span className="text-[var(--color-paper)]">official sample ballot</span>
        {admin?.name ? <> from {admin.name} election officials</> : null}
        {officialUrl ? (
          <>
            {" "}
            <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-[var(--color-accent)]">
              official site <ExternalLink size={11} aria-hidden />
            </a>
          </>
        ) : null}
        . Contests can differ by address within the same city or ZIP code.
      </div>
    </div>
  );
}

function ExpiredBallot() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <h1 className="font-display text-[44px] leading-none tracking-[-0.02em]">
        ballot<span className="text-[var(--color-paper-3)]">.ai</span>
      </h1>
      <p className="mt-8 max-w-md text-center text-[15px] leading-[1.6] text-[var(--color-paper-2)]">
        This ballot link has expired. To keep ballot information fresh and your address private, we only keep a looked-up
        ballot for a short time. Enter your address to see your current ballot.
      </p>
      <div className="mt-10 w-full flex justify-center">
        <AddressForm autoFocus />
      </div>
    </div>
  );
}
