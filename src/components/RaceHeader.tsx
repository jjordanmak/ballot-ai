import type { Race } from "@/data/types";
import { RichBlock, RichText } from "./Highlight";
import { partyDot } from "./PartyTag";
import { NewsFeed } from "./NewsFeed";
import { SuspendedList } from "./SuspendedList";

export function RaceHeader({ race, index }: { race: Race; index: number }) {
  // "Active" = on the ballot AND running. Suspended candidates remain on the
  // printed ballot but are no longer running, so we don't count them here.
  const activeCandidates = race.candidates.filter((c) => !c.withdrawn && !c.campaignSuspended);
  const totalCount = activeCandidates.length;

  return (
    <header className="pt-16 pb-10 border-b border-[var(--color-ink-3)]">
      {/* Index strip */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)] flex items-center gap-2">
          <span className="race-number text-[var(--color-accent)] tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          {race.jurisdiction}
        </span>
        <span className="font-mono-cap text-[11px] text-[var(--color-paper-3)]">
          {race.unopposed ? "Unopposed" : `${totalCount} candidates`}
        </span>
      </div>

      {/* Office */}
      <h2 className="font-display text-[44px] sm:text-[56px] xl:text-[72px] leading-[0.95] tracking-[-0.025em] text-balance">
        {race.office}
      </h2>

      {/* Format tag + explainer — both sit above the divider, paired */}
      <div className="mt-5 max-w-3xl">
        <span className="font-mono-cap text-[10px] text-[var(--color-accent)] inline-flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[var(--color-accent)]" />
          {race.format}
        </span>
        <p className="text-[14px] text-[var(--color-paper-2)] mt-2.5 leading-relaxed">
          {race.formatExplainer}
        </p>
      </div>

      {/* Meta strip — labels above values for clearer hierarchy + breathing room */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 max-w-3xl border-t border-[var(--color-ink-3)] pt-5">
        {race.meta.map((m) => (
          <div key={m.label} className="flex flex-col">
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)] mb-1.5 tracking-[0.16em]">
              {m.label}
            </span>
            <span className="text-[13px] text-[var(--color-paper)] font-mono leading-snug">
              {m.value}
            </span>
          </div>
        ))}
      </div>

      {/* Intro grid */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-12 gap-y-10 gap-x-8">
        {/* Context — wide */}
        <IntroBlock
          eyebrow="Context"
          body={race.intro.context}
          className="md:col-span-7 md:row-span-2"
          isLead
        />

        {/* Why it matters */}
        <IntroBlock eyebrow="Why it matters" body={race.intro.whyItMatters} className="md:col-span-5" />

        {/* What's at stake */}
        <IntroBlock
          eyebrow="What's at stake"
          body={race.intro.whatsAtStake}
          className="md:col-span-5"
        />

        {/* Big picture */}
        <IntroBlock eyebrow="The big picture" body={race.intro.bigPicture} className="md:col-span-7" />

        {/* Polling */}
        <PollingPanel race={race} className="md:col-span-5" />

        {/* Suspended campaigns — accordion list, collapsed by default. */}
        <SuspendedList candidates={race.candidates.filter((c) => c.campaignSuspended)} />
      </div>

      {/* Race-level "In the news" carousel */}
      <div className="mt-12">
        <NewsFeed items={race.news} />
      </div>
    </header>
  );
}

function IntroBlock({
  eyebrow,
  body,
  className,
  isLead,
}: {
  eyebrow: string;
  body: string;
  className?: string;
  isLead?: boolean;
}) {
  return (
    <div className={className}>
      <div className="font-mono-cap text-[10px] text-[var(--color-paper-3)] mb-3 flex items-center gap-2">
        <span className="w-3 h-px bg-[var(--color-accent)]" />
        {eyebrow}
      </div>
      <RichBlock
        text={body}
        className={
          isLead
            ? "font-display text-[22px] leading-[1.4] text-[var(--color-paper)] text-pretty drop-cap"
            : "text-[15px] leading-[1.65] text-[var(--color-paper-2)] text-pretty"
        }
      />
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
      <RichBlock
        text={race.intro.polling}
        className="text-[14px] leading-relaxed text-[var(--color-paper-2)] mb-5 text-pretty"
      />
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
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)]">
              Emerson · Inside CA Politics · Apr 14–15
            </span>
            <span className="font-mono-cap text-[9px] text-[var(--color-paper-4)]">
              Undecided 23%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function HighlightedSpan({ text }: { text: string }) {
  return <RichText text={text} />;
}
