import type { Metadata } from "next";
import { cache } from "react";
import type { ReactNode } from "react";
import { Columns3, ExternalLink, Info, ListChecks, Mail, MapPin, Scale } from "lucide-react";
import { AddressForm } from "@/components/AddressForm";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { RaceHeader } from "@/components/RaceHeader";
import { ComparisonTable } from "@/components/ComparisonTable";
import { CandidatesHeader } from "@/components/CandidatesHeader";
import { DistrictLine } from "@/components/ballot/DistrictLine";
import { LastUpdated } from "@/components/ballot/LastUpdated";
import { LiveFeedProvider } from "@/components/ballot/LiveFeed";
import { MeasureCard } from "@/components/ballot/MeasureCard";
import { RetentionCard } from "@/components/ballot/RetentionCard";
import { Researching } from "@/components/ballot/Citations";
import type { Race } from "@/data/types";
import { CATEGORY_LABEL, type ResolvedBallot } from "@/domain/ballot";
import { formatElectionDate, locationLabel, locationLine, STATE_LOOKUP_FALLBACK, STATUS_COPY } from "@/lib/ballot/copy";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { electionChoices, type ElectionChoice } from "@/lib/ballot/electionChoices";
import { loadBallot as loadStoredBallot } from "@/lib/ballot/loadBallot";
import { statewideMeasuresHeading, toRaces, type MeasureView } from "@/lib/ballot/toRaces";
import { discoveredLinks, initialFeed, type DiscoveredLink } from "@/lib/feeds/read";
import { districtsFrom } from "@/domain/districts";

// Reads a short-lived, address-free resolution per request.
export const dynamic = "force-dynamic";

type Params = Promise<{ electionSlug: string; ballotKey: string }>;

/** Measures are listed in the nav as two pseudo races (statewide / local), one row per measure. */
/** Metadata and the page read the same stored ballot once per request. */
const loadBallot = cache(loadStoredBallot);

const MEASURE_GROUPS = [
  { id: "measures-state", statewide: true, title: "Statewide measures", eyebrow: "Statewide" },
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
  if (result.state !== "ok") return <ExpiredBallot unavailable={result.state === "unavailable"} elections={await electionChoices()} />;

  const ballot = result.ballot;
  const { races, measures } = toRaces(ballot, getEnrichment(electionSlug));
  // Tab title stays "City, ST"; the sidebar and header add the ZIP.
  const location = locationLine(ballot.location);
  const onBallot = new Set(districtsFrom([], ballot.contests, ballot.location.state).map((d) => d.kind));
  const contestIds = ballot.contests.flatMap((c) => (c.durableId ? [c.durableId] : []));
  const electionId = ballot.election?.id ?? "";
  const candidateIds = races.flatMap((r) => r.candidates.flatMap((c) => (c.feed?.candidateId ? [c.feed.candidateId] : [])));
  const [feed, links] = await Promise.all([initialFeed(electionId, contestIds), discoveredLinks(candidateIds)]);
  addDiscoveredLinks(races, links);
  const electionName = ballot.election?.name ?? "Your ballot";
  const electionDate = ballot.election ? formatElectionDate(ballot.election.date) : "";
  const measureGroups = MEASURE_GROUPS.map((g) => ({
    ...g,
    title: g.statewide ? statewideMeasuresHeading(measures) : g.title,
    items: measures.filter((m) => m.statewide === g.statewide),
  })).filter(
    (g) => g.items.length > 0,
  );
  // Retention questions (Yes/No on one judge) read like measures: one group of cards after the races.
  const contestRaces = races.filter((r) => !r.retention);
  const retentionRaces = races.filter((r) => r.retention);
  const navRaces = [
    ...contestRaces,
    ...(retentionRaces.length ? [retentionNavRace(retentionRaces)] : []),
    ...measureGroups.map((g) => measuresNavRace(g.id, g.title, g.items)),
  ];
  const groupOffset = contestRaces.length + (retentionRaces.length ? 1 : 0);
  const officialUrl = ballot.administration?.electionInfoUrl ?? ballot.administration?.ballotInfoUrl;
  const totalCandidates = races.reduce((n, r) => n + r.candidates.length, 0);

  return (
    <LiveFeedProvider electionId={electionId} state={ballot.location.state} contestIds={contestIds} initial={feed}>
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

          {contestRaces.map((race, i) => (
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

          {retentionRaces.length > 0 && (
            <section id={`race-${RETENTION_ID}`} className="scroll-mt-4 pt-16" data-race-id={RETENTION_ID}>
              <header className="pb-8 border-b border-[var(--color-ink-3)] mb-10">
                <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)] flex items-center gap-2 mb-6">
                  <span className="race-number text-[var(--color-accent)] tabular-nums">
                    {String(contestRaces.length + 1).padStart(2, "0")}
                  </span>
                  Courts
                </span>
                <h2 className="font-display text-[40px] sm:text-[50px] xl:text-[64px] leading-[0.95] tracking-[-0.025em]">
                  {RETENTION_TITLE}
                </h2>
                <div className="mt-5 font-mono-cap text-[11px] text-[var(--color-paper)] flex items-center gap-2 tracking-[0.16em]">
                  <Scale size={12} className="text-[var(--color-accent)]" />
                  {retentionRaces.length} {retentionRaces.length === 1 ? "judge" : "judges"} on your ballot · Yes or No on each
                </div>
              </header>
              <div className="space-y-5">
                {retentionRaces.map((race) => (
                  <RetentionCard key={race.id} race={race} anchorId={`candidate-${RETENTION_ID}-${race.id}`} />
                ))}
              </div>
            </section>
          )}

          {measureGroups.map((g, gi) => (
            <section key={g.id} id={`race-${g.id}`} className="scroll-mt-4 pt-16" data-race-id={g.id}>
              <header className="pb-8 border-b border-[var(--color-ink-3)] mb-10">
                <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)] flex items-center gap-2 mb-6">
                  <span className="race-number text-[var(--color-accent)] tabular-nums">
                    {String(groupOffset + gi + 1).padStart(2, "0")}
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
                    state={ballot.location.state}
                    statewide={mv.statewide}
                  />
                ))}
              </div>
            </section>
          ))}

          <footer className="mt-20 pt-6 border-t border-[var(--color-ink-3)] text-[12px] leading-[1.6] text-[var(--color-paper-3)] max-w-2xl">
            ballot.ai is independent and nonpartisan. Which contests and candidates appear comes from official election data
            (sources listed on each race). Researched content is cited item by item. Your local election office is the
            official source for your ballot.
          </footer>
        </main>
      </div>
    </LiveFeedProvider>
  );
}

/** Same heading shape as ComparisonTable; shown until issue positions are researched and cited. */
/**
 * X accounts the daily link check found on a candidate's own campaign site,
 * cited to that page. Links from official filings take precedence.
 */
function addDiscoveredLinks(races: Race[], links: DiscoveredLink[]) {
  const byCandidate = new Map(links.filter((l) => l.kind === "x").map((l) => [l.contest_candidate_id, l]));
  for (const c of races.flatMap((r) => r.candidates)) {
    const found = c.feed?.candidateId ? byCandidate.get(c.feed.candidateId) : undefined;
    if (!found || !c.general || c.general.links?.some((l) => l.kind === "x")) continue;
    const sid = `campaign-site-${found.contest_candidate_id}`;
    c.general.sourceDocs = {
      ...c.general.sourceDocs,
      [sid]: { title: "Campaign website", publisher: c.name, url: found.verified_from, official: false, accessed: found.checked_at.slice(0, 10) },
    };
    c.general.links = [...(c.general.links ?? []), { kind: "x", url: found.url, sources: [sid] }];
  }
}

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

const RETENTION_ID = "retention";
const RETENTION_TITLE = "Judges up for retention";

/** Retention questions in the nav: one pseudo race, one row per judge. */
function retentionNavRace(races: Race[]): Race {
  return {
    ...measuresNavRace(RETENTION_ID, RETENTION_TITLE, []),
    group: CATEGORY_LABEL.judicial,
    navLabel: `${races.length} ${races.length === 1 ? "judge" : "judges"} · Yes / No`,
    candidates: races.map((r) => ({ ...r.candidates[0], id: r.id })),
  };
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
      <p className="mt-6 max-w-2xl text-[17px] leading-[1.6] text-[var(--color-paper-2)] text-pretty no-auto-highlight">
        <mark>Every race, every candidate</mark> on your ballot. Compared side by side, profiled in depth, and continuously updated from verified public sources.
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
        <LastUpdated fallback={retrievedAt} />
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
  // Official polling-place finder first; the state's voter lookup also lists polling places.
  const whereToVote = admin?.votingLocationFinderUrl
    ? { url: admin.votingLocationFinderUrl, label: "find your polling place or vote center" }
    : admin?.voterLookupUrl
      ? { url: admin.voterLookupUrl, label: `${admin.regionName ?? "your state's"} official voter lookup` }
      : { url: STATE_LOOKUP_FALLBACK.url, label: STATE_LOOKUP_FALLBACK.label };
  return (
    <div className="mt-10 flex flex-col gap-3 max-w-3xl">
      {ballot.status === "PARTIAL" && (
        <div role="status" className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3">
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
      {whereToVote && (
        <a
          href={whereToVote.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] px-4 py-3 flex items-center gap-2 text-[14px] text-[var(--color-paper)] hover:border-[var(--color-paper-4)]"
        >
          <MapPin size={14} className="text-[var(--color-accent)]" aria-hidden />
          <span>
            Where to vote: <span className="underline group-hover:text-[var(--color-accent)]">{whereToVote.label}</span>
          </span>
          <ExternalLink size={11} aria-hidden className="text-[var(--color-paper-3)]" />
        </a>
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

function ExpiredBallot({ unavailable = false, elections }: { unavailable?: boolean; elections: ElectionChoice[] }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <h1 className="font-display text-[44px] leading-none tracking-[-0.02em]">
        ballot<span className="text-[var(--color-paper-3)]">.ai</span>
      </h1>
      <p className="mt-8 max-w-md text-center text-[15px] leading-[1.6] text-[var(--color-paper-2)]">
        {unavailable
          ? "We couldn't load this ballot right now. This is a problem on our end. Enter your address to look it up again, or check with your local election office."
          : "This ballot link has expired. To keep ballot information fresh and your address private, we only keep a looked-up ballot for a short time. Enter your address to see your current ballot."}
      </p>
      <div className="mt-10 w-full flex justify-center">
        <AddressForm autoFocus elections={elections} />
      </div>
    </div>
  );
}
