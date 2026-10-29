import { ArrowUpRight } from "lucide-react";
import type { Race } from "@/data/types";
import { RichBlock, RichText } from "./Highlight";
import { partyDot } from "./PartyTag";
import { NewsFeed } from "./NewsFeed";
import { LivePoll } from "./ballot/LivePoll";
import { SuspendedList } from "./SuspendedList";
import { Cite, Researching, SourceList } from "./ballot/Citations";
import type { Cited, SourceDoc } from "@/domain/enrichment";

export function RaceHeader({ race, index }: { race: Race; index: number }) {
  // "General" mode = address-resolved ballot (Nov 2026+): cited content,
  // placeholders instead of hardcoded copy. Archive races have no `general`.
  const g = race.general;
  const e = g?.enrichment;
  // "Active" = on the ballot AND running. Suspended candidates remain on the
  // printed ballot but are no longer running, so we don't count them here.
  const activeCandidates = race.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended);
  const totalCount = activeCandidates.length;

  return (
    <header className="pt-16 pb-10 border-b border-[var(--color-ink-3)]">
      {/* Index strip — race index + jurisdiction. Candidate count moves
          under the format explainer where it sits with related context. */}
      <div className="mb-6">
        <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)] flex items-center gap-2">
          <span className="race-number text-[var(--color-accent)] tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          {race.jurisdiction}
        </span>
      </div>

      {/* Office */}
      <h2 className="font-display text-[40px] sm:text-[50px] xl:text-[64px] leading-[0.95] tracking-[-0.025em] text-balance">
        {race.office}
      </h2>

      {/* Format tag + explainer + candidate count, all paired above the divider */}
      <div className="mt-5 max-w-3xl">
        <span className="font-mono-cap text-[10px] text-[var(--color-accent)] inline-flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[var(--color-accent)]" />
          {race.format}
        </span>
        {race.formatExplainer && (
          <p className="text-[14px] text-[var(--color-paper-2)] mt-2.5 leading-relaxed">
            {race.formatExplainer}
            {g && <Cite ids={e?.formatExplainer?.sources} docs={g.sourceDocs} />}
          </p>
        )}
        <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mt-3 tracking-[0.16em]">
          {countLine(race, totalCount)}
          {g?.voteNeeded && (
            <span className={g.voteNeeded.verified ? "" : "text-[var(--color-paper-4)]"}> · {g.voteNeeded.text}</span>
          )}
        </div>
      </div>

      {/* Meta strip — labels above values for clearer hierarchy + breathing room */}
      {race.meta.length > 0 && (
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 max-w-3xl border-t border-[var(--color-ink-3)] pt-5">
        {race.meta.map((m) => (
          <div key={m.label} className={`flex flex-col ${m.wide ? "col-span-2 whitespace-nowrap" : ""}`}>
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)] mb-1.5 tracking-[0.16em]">
              {m.label}
            </span>
            <span className="text-[13px] text-[var(--color-paper)] font-mono leading-snug">
              {m.value}
            </span>
          </div>
        ))}
      </div>
      )}

      {/* Intro grid */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-y-10 gap-x-8">
        {/* Context — wide */}
        <IntroBlock
          eyebrow="Context"
          body={race.intro.context}
          className="md:col-span-7 md:row-span-2"
          isLead
          cited={g ? e?.context ?? null : undefined}
          docs={g?.sourceDocs}
        />

        {/* Why it matters */}
        <IntroBlock
          eyebrow="Why it matters"
          body={race.intro.whyItMatters}
          className="md:col-span-5"
          cited={g ? e?.whyItMatters ?? null : undefined}
          docs={g?.sourceDocs}
        />

        {/* What's at stake */}
        <IntroBlock
          eyebrow="What's at stake"
          body={race.intro.whatsAtStake}
          className="md:col-span-5"
          cited={g ? e?.whatsAtStake ?? null : undefined}
          docs={g?.sourceDocs}
        />

        {/* Big picture */}
        <IntroBlock
          eyebrow="The big picture"
          body={race.intro.bigPicture}
          className="md:col-span-7"
          cited={g ? e?.bigPicture ?? null : undefined}
          docs={g?.sourceDocs}
        />

        {/* Polling */}
        {race.general ? (
          <LivePoll
            contestId={race.feed?.contestId}
            className="md:col-span-5"
            candidates={race.candidates.flatMap((c) =>
              c.feed?.candidateId ? [{ candidateId: c.feed.candidateId, party: c.party, partyName: c.partyName }] : [],
            )}
          >
            <PollingPanel race={race} className="md:col-span-5" />
          </LivePoll>
        ) : (
          <PollingPanel race={race} className="md:col-span-5" />
        )}

        {/* Suspended campaigns — accordion list, collapsed by default. */}
        <SuspendedList candidates={race.candidates.filter((c) => c.campaignSuspended)} />
      </div>

      {/* Race-level "In the news" carousel */}
      <div className="mt-12">
        <NewsFeed items={race.news} feed={race.feed} />
      </div>

      {g && (
        <SourceList
          docs={g.sourceDocs}
          provenance={g.officialSources}
          notes={g.voteNeeded?.source ? [{ label: "Vote needed", ...g.voteNeeded.source }] : undefined}
        />
      )}
    </header>
  );
}

function IntroBlock({
  eyebrow,
  body,
  className,
  isLead,
  cited,
  docs,
}: {
  eyebrow: string;
  body: string;
  className?: string;
  isLead?: boolean;
  /** General mode only: the cited item (null = not yet researched). */
  cited?: Cited | null;
  docs?: Record<string, SourceDoc>;
}) {
  if (cited === null) {
    return (
      <div className={className}>
        <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3 flex items-center gap-2">
          <span className="w-3 h-px bg-[var(--color-accent)]" />
          {eyebrow}
        </div>
        <Researching />
      </div>
    );
  }
  return (
    <div className={className}>
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3 flex items-center gap-2">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        {eyebrow}
      </div>
      <RichBlock
        text={body}
        auto={docs ? "neutral" : "archive"}
        className={
          isLead
            ? "font-display text-[22px] leading-[1.4] text-[var(--color-paper)] text-pretty"
            : "text-[15px] leading-[1.65] text-[var(--color-paper-2)] text-pretty"
        }
      />
      {cited && docs && <Cite ids={cited.sources} docs={docs} />}
    </div>
  );
}

function PollingPanel({ race, className }: { race: Race; className?: string }) {
  // Pull candidates with polling pcts for the visual
  const polled = race.candidates
    .filter((c) => c.pollingPct != null && !c.withdrawn && !c.campaignSuspended)
    .sort((a, b) => (b.pollingPct ?? 0) - (a.pollingPct ?? 0))
    .slice(0, 7);

  // Bars are scaled RELATIVE TO THE LEADER so they're visually meaningful.
  // Raw % capped at 100% would make 18% leaders look tiny on a 100% scale.
  const max = Math.max(1, ...polled.map((p) => p.pollingPct ?? 0));

  return (
    <div className={className}>
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3 flex items-center gap-2">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        Latest polling
      </div>
      {race.general && !race.intro.polling && polled.length === 0 ? (
        <p className="text-[13px] leading-[1.55] italic text-[var(--color-paper-4)]">
          No public poll from a cited source yet for this race.
        </p>
      ) : (
        <RichBlock
          text={race.intro.polling}
          auto={race.general ? "neutral" : "archive"}
          className="text-[14px] leading-relaxed text-[var(--color-paper-2)] mb-5 text-pretty"
        />
      )}
      {polled.length > 0 && (
        <div className="rounded-lg bg-[var(--color-ink-1)] p-4 space-y-2.5">
          {polled.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--color-paper)] w-[110px] truncate flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${partyDot(c.party)}`} />
                {c.name.split(" ").slice(-1)[0]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[var(--color-ink-3)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${partyDot(c.party)}`}
                  style={{ width: `${((c.pollingPct ?? 0) / max) * 100}%` }}
                />
              </div>
              <span className="font-mono race-number text-[12px] text-[var(--color-paper)] w-10 text-right tabular-nums">
                {c.pollingPct}%
              </span>
            </div>
          ))}
          <div className="pt-2 mt-2 border-t border-[var(--color-ink-3)] flex items-center justify-between">
            {(() => {
              // Archive keeps its original default label; general mode only
              // shows a label that comes from a cited poll.
              const label =
                race.intro.pollingSourceLabel ??
                (race.general ? "Source" : "Emerson · Inside CA Politics · Apr 14–15");
              const url = race.intro.pollingSourceUrl;
              const cls =
                "font-mono-cap text-[9px] text-[var(--color-paper-4)] hover:text-[var(--color-accent)] transition-colors";
              return url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cls} inline-flex items-center gap-1`}
                >
                  {label}
                  <ArrowUpRight size={10} className="opacity-80" />
                </a>
              ) : (
                <span className={cls}>{label}</span>
              );
            })()}
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)]">
              {race.intro.pollingFootnote ?? (race.general ? "" : "Undecided 23%")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Vote for 1 of 2 candidates", "Vote for up to 3 of 7 candidates",
 * "Rank the candidates · 5 candidates", "Unopposed", "Retention vote".
 */
export function countLine(race: Race, active: number): string {
  if (race.unopposed) return "Unopposed";
  if (race.navLabel?.startsWith("Retention")) return "Retention vote";
  const cands = `${active} candidate${active === 1 ? "" : "s"}`;
  const g = race.general;
  if (!g) return cands;
  if (g.rankedChoice) return `Rank the candidates · ${cands}`;
  if (!g.voteFor) return cands;
  return `Vote for ${g.voteFor > 1 ? "up to " : ""}${g.voteFor} of ${cands}`;
}
