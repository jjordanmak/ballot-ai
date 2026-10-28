import type { Metadata } from "next";
import { ExternalLink, Info, Landmark, ListChecks, Mail } from "lucide-react";
import { AddressForm } from "@/components/AddressForm";
import { BallotNav, type NavGroup } from "@/components/ballot/BallotNav";
import { ContestCard } from "@/components/ballot/ContestCard";
import { MeasureCard } from "@/components/ballot/MeasureCard";
import { CATEGORY_LABEL, CATEGORY_ORDER, type Contest, type ContestCategory, type ResolvedBallot } from "@/domain/ballot";
import { formatElectionDate, locationLabel, STATUS_COPY } from "@/lib/ballot/copy";
import { loadBallot } from "@/lib/ballot/loadBallot";

// Reads a short-lived, address-free resolution per request.
export const dynamic = "force-dynamic";

type Params = Promise<{ electionSlug: string; ballotKey: string }>;

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
  const groups = groupContests(ballot.contests);
  const location = locationLabel(ballot.location);
  const electionName = ballot.election?.name ?? "Your ballot";
  const electionDate = ballot.election ? formatElectionDate(ballot.election.date) : "";
  const navGroups: NavGroup[] = groups.map((g) => ({ id: g.category, label: CATEGORY_LABEL[g.category], count: g.contests.length }));
  const candidateContests = ballot.contests.filter((c) => c.kind === "candidate").length;
  const measures = ballot.contests.length - candidateContests;

  return (
    <div className="flex flex-col lg:flex-row">
      <BallotNav groups={navGroups} location={location} electionName={electionName} electionDate={electionDate} />

      <main className="flex-1 min-w-0 px-6 sm:px-10 lg:px-14 xl:px-20 max-w-[1100px] pb-32">
        <header className="pt-14 pb-10 border-b border-[var(--color-ink-3)]">
          <div className="font-mono-cap text-[11px] text-[var(--color-accent)] mb-3 tracking-[0.16em]">A guide to your ballot</div>
          <h1 className="font-display text-[40px] sm:text-[56px] xl:text-[68px] leading-[0.98] tracking-[-0.03em] text-balance">
            {electionName}
          </h1>
          <div className="mt-4 font-mono-cap text-[14px] text-[var(--color-paper-2)] tracking-[0.18em]">
            {location}
            {electionDate && <span className="text-[var(--color-paper-3)]"> · {electionDate}</span>}
          </div>
          <div className="mt-10 flex flex-wrap items-end gap-x-10 gap-y-6">
            <Stat label="Contests" value={String(candidateContests)} />
            <Stat label="Measures" value={String(measures)} />
            <Stat label="Last retrieved" value={new Date(ballot.retrievedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles", timeZoneName: "short" })} />
          </div>
        </header>

        <Notices ballot={ballot} />

        {groups.map((g) => (
          <section key={g.category} id={`group-${g.category}`} className="scroll-mt-16 pt-12" aria-labelledby={`h-${g.category}`}>
            <h2
              id={`h-${g.category}`}
              className="flex items-center gap-2 font-mono-cap text-[11px] text-[var(--color-paper)] tracking-[0.16em] mb-5"
            >
              {g.category === "measures" ? (
                <ListChecks size={12} className="text-[var(--color-accent)]" aria-hidden />
              ) : (
                <Landmark size={12} className="text-[var(--color-accent)]" aria-hidden />
              )}
              {CATEGORY_LABEL[g.category]}
              <span className="text-[var(--color-paper-4)]">· {g.contests.length}</span>
            </h2>
            <div className="flex flex-col gap-5">
              {g.contests.map((c) =>
                c.kind === "measure" ? (
                  <MeasureCard key={c.id} contest={c} officialGuideUrl={ballot.administration?.electionInfoUrl ?? ballot.administration?.ballotInfoUrl} />
                ) : (
                  <ContestCard key={c.id} contest={c} />
                ),
              )}
            </div>
          </section>
        ))}

        <footer className="mt-16 pt-6 border-t border-[var(--color-ink-3)] text-[12px] leading-[1.6] text-[var(--color-paper-3)] max-w-2xl">
          ballot.ai is independent and nonpartisan. Contest and candidate information comes from official election data
          via the sources listed on each contest. Your county elections office is the official source for your ballot.
        </footer>
      </main>
    </div>
  );
}

function groupContests(contests: Contest[]): { category: ContestCategory; contests: Contest[] }[] {
  const by = new Map<ContestCategory, Contest[]>();
  for (const c of contests) by.set(c.category, [...(by.get(c.category) ?? []), c]);
  return CATEGORY_ORDER.filter((cat) => by.has(cat)).map((category) => ({ category, contests: by.get(category)! }));
}

function Notices({ ballot }: { ballot: ResolvedBallot }) {
  const admin = ballot.administration;
  // Local election office first: it publishes the sample ballot for this address.
  const officialUrl = admin?.electionInfoUrl ?? admin?.ballotInfoUrl;
  return (
    <div className="mt-8 flex flex-col gap-3">
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
        {admin?.name ? <> from {admin.name}</> : null}
        {officialUrl ? (
          <>
            {" "}
            <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-[var(--color-accent)]">
              official site <ExternalLink size={11} aria-hidden />
            </a>
          </>
        ) : null}
        . Contests may differ by address within the same city or ZIP code.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono-cap text-[var(--color-paper-4)] text-[9px] tracking-[0.18em]">{label}</div>
      <div className="text-[var(--color-paper)] text-[14px] mt-1 font-mono tabular-nums">{value}</div>
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
