import { ChevronRight, ExternalLink } from "lucide-react";
import type { Contest } from "@/domain/ballot";
import type { MeasureEnrichment, SourceDoc } from "@/domain/enrichment";
import { NewsFeed } from "@/components/NewsFeed";
import { RichText } from "@/components/Highlight";
import { COUNTS_VOTES_CAST, measureVoteNeeded, type VoteNeeded } from "@/domain/voteNeeded";
import { IMPACT_QUESTIONS, impactAnswers } from "@/lib/ballot/measureImpact";
import { divisionLabel } from "@/domain/districtMaps";
import { AiLabel, Cite, SourceList } from "./Citations";
import { MapYearInfo } from "./MapYearInfo";

/**
 * A ballot measure. Identifier, jurisdiction, threshold and ballot responses
 * come from official ballot data; the official title, summary, YES/NO
 * meanings and fiscal effect come from cited enrichment when researched.
 */
export function MeasureCard({
  contest,
  officialGuideUrl,
  enrichment,
  docs = {},
  anchorId,
  state,
  statewide = false,
}: {
  contest: Contest;
  officialGuideUrl?: string;
  enrichment?: MeasureEnrichment;
  docs?: Record<string, SourceDoc>;
  anchorId?: string;
  /** USPS code of the ballot, for the state's vote-needed rule. */
  state?: string;
  statewide?: boolean;
}) {
  const m = contest.measure;
  const e = enrichment;
  const voteNeeded = measureVoteNeeded(contest, state, statewide);
  const impact = impactAnswers(e, e?.title || m?.title || contest.ballotTitle, m?.identifier);
  const title = e?.title || m?.title || "";
  const heading = title || m?.identifier || contest.title || "Untitled measure";
  const showEyebrow = !!m?.identifier && !!title;
  const officialLink = e?.officialUrl || m?.url;
  const hasSummary = !!(e?.summary || m?.brief);
  const where = divisionLabel(contest, state);

  return (
    <article
      id={anchorId ?? `contest-${contest.id}`}
      className="scroll-mt-32 rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 flex-1">
          {showEyebrow && (
            <div className="font-mono-cap text-[11px] tracking-[0.16em] text-[var(--color-accent)]">{m!.identifier}</div>
          )}
          <h3 className="mt-1 font-display text-[22px] sm:text-[28px] leading-[1.15] tracking-[-0.02em] text-balance">
            {heading}
          </h3>
        </div>
        {where.jurisdiction && (
          <p className="sm:mt-1.5 sm:text-right text-[13px] text-[var(--color-paper-3)] flex items-center gap-1.5 sm:justify-end">
            {where.jurisdiction}
            <MapYearInfo note={where.jurisdictionNote} id={`map-note-${contest.id}`} />
          </p>
        )}
      </header>
      {!!e?.aiFields?.length && <AiLabel className="mt-3" />}

      {e?.summary ? (
        <p className="mt-5 text-[15px] leading-[1.65] text-[var(--color-paper-2)] text-pretty max-w-3xl">
          <RichText text={e.summary.text} auto="neutral" />
          <Cite ids={e.summary.sources} docs={docs} quotes={e.summary.quotes} />
        </p>
      ) : m?.brief ? (
        <p className="mt-5 text-[15px] leading-[1.6] text-[var(--color-paper-2)] text-pretty">{m.brief}</p>
      ) : null}

      <p
        className={`mt-3 text-[15px] leading-[1.65] text-pretty max-w-3xl ${voteNeeded.verified ? "text-[var(--color-paper-2)]" : "text-[var(--color-paper-3)]"}`}
        title={COUNTS_VOTES_CAST}
      >
        {passesWith(voteNeeded)}
      </p>

      {(e?.yesMeans || e?.noMeans) && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {e?.yesMeans && <Meaning label="A YES vote means" item={e.yesMeans} docs={docs} />}
          {e?.noMeans && <Meaning label="A NO vote means" item={e.noMeans} docs={docs} />}
        </div>
      )}

      <section className="mt-7 max-w-4xl" aria-label="What it means for you">
        <div className="font-mono-cap text-[10px] tracking-[0.16em] text-[var(--color-paper-3)] mb-3">What it means for you</div>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {IMPACT_QUESTIONS.map(({ key, question }) => {
            const a = impact[key];
            return (
              <div key={key}>
                <dt className="text-[13px] text-[var(--color-paper)] font-medium">{question}</dt>
                <dd className={`mt-1 text-[14px] leading-[1.6] ${a.kind === "missing" ? "italic text-[var(--color-paper-4)] text-[13px]" : "text-[var(--color-paper-2)]"}`}>
                  {a.kind === "cited" ? (
                    <>
                      <RichText text={a.item.text} auto="neutral" />
                      <Cite ids={a.item.sources} docs={docs} quotes={a.item.quotes} />
                    </>
                  ) : a.kind === "title" ? (
                    <>
                      {a.text} <span className="text-[var(--color-paper-4)] text-[12px]">(from the official title)</span>
                    </>
                  ) : (
                    a.text
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {(e?.argumentFor || e?.argumentAgainst) && (
        <details className="mt-6 max-w-4xl group/args">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-2 font-mono-cap text-[10px] tracking-[0.16em] text-[var(--color-paper-3)] hover:text-[var(--color-accent)]">
            <ChevronRight size={12} aria-hidden className="transition-transform group-open/args:rotate-90" />
            Official arguments for and against
          </summary>
          <p className="mt-2 text-[12px] text-[var(--color-paper-4)]">
            Written by each side and printed in the official voter guide. ballot.ai does not edit or endorse them.
          </p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {e?.argumentFor && <Meaning label="Argument in favor" item={e.argumentFor} docs={docs} muted />}
            {e?.argumentAgainst && <Meaning label="Argument against" item={e.argumentAgainst} docs={docs} muted />}
          </div>
          {(e?.supporters || e?.opponents) && (
            <dl className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-[13px] text-[var(--color-paper-2)]">
              {e?.supporters && (
                <div>
                  <dt className="font-mono-cap text-[9px] text-[var(--color-paper-4)] tracking-[0.16em] mb-1">Listed supporters</dt>
                  <dd>
                    {e.supporters.text}
                    <Cite ids={e.supporters.sources} docs={docs} />
                  </dd>
                </div>
              )}
              {e?.opponents && (
                <div>
                  <dt className="font-mono-cap text-[9px] text-[var(--color-paper-4)] tracking-[0.16em] mb-1">Listed opponents</dt>
                  <dd>
                    {e.opponents.text}
                    <Cite ids={e.opponents.sources} docs={docs} />
                  </dd>
                </div>
              )}
            </dl>
          )}
        </details>
      )}

      {m && m.responses.length > 0 && (
        <p className="mt-5 text-[13px] text-[var(--color-paper-3)]">
          On your ballot: <span className="text-[var(--color-paper-2)]">{m.responses.join(" · ")}</span>
        </p>
      )}

      {!hasSummary && !officialLink && (
        <p className="mt-4 text-[13px] leading-[1.55] italic text-[var(--color-paper-4)]">
          Official title and summary being researched. Your official voter guide has the full text
          {officialGuideUrl ? (
            <>
              {" "}
              (
              <a href={officialGuideUrl} target="_blank" rel="noopener noreferrer" className="underline not-italic hover:text-[var(--color-accent)]">
                official site
              </a>
              )
            </>
          ) : null}
          .
        </p>
      )}

      {officialLink && (
        <a
          href={officialLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1 text-[13px] text-[var(--color-paper-2)] hover:text-[var(--color-accent)]"
        >
          Official measure information <ExternalLink size={12} aria-hidden />
        </a>
      )}

      {contest.durableId && (
        <div className="mt-8">
          <NewsFeed items={[]} feed={{ contestId: contest.durableId }} hideWhenEmpty />
        </div>
      )}

      <SourceList
        docs={docs}
        provenance={contest.sources}
        notes={voteNeeded.source ? [{ label: "Vote needed", ...voteNeeded.source }] : undefined}
      />
    </article>
  );
}

export function Meaning({
  label,
  item,
  docs,
  muted,
}: {
  label: string;
  item: { text: string; sources: string[]; quotes?: (string | undefined)[] };
  docs: Record<string, SourceDoc>;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-ink-3)] bg-[var(--color-ink-0)] p-4">
      <div className="font-mono-cap text-[9px] text-[var(--color-paper-3)] tracking-[0.16em] mb-1.5">{label}</div>
      <p className={`leading-[1.6] ${muted ? "text-[13px] text-[var(--color-paper-2)]" : "text-[14px] text-[var(--color-paper)]"}`}>
        <RichText text={item.text} auto="neutral" />
        <Cite ids={item.sources} docs={docs} quotes={item.quotes} />
      </p>
    </div>
  );
}

/** "Passes with more than half of the votes cast on this measure." Unverified rules keep their own wording. */
export function passesWith(v: VoteNeeded): string {
  if (!v.verified) return `Vote needed: ${v.text.charAt(0).toLowerCase()}${v.text.slice(1)}`;
  const t = v.text.replace(/\.$/, "");
  return `Passes with ${/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t}.`;
}
