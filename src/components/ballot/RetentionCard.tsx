import type { Race } from "@/data/types";
import type { Cited, SourceDoc } from "@/domain/enrichment";
import { COUNTS_VOTES_CAST } from "@/domain/voteNeeded";
import { NewsFeed } from "@/components/NewsFeed";
import { RichText } from "@/components/Highlight";
import { AiLabel, Cite, Researching, SourceList } from "./Citations";
import { MapYearInfo } from "./MapYearInfo";
import { Meaning } from "./MeasureCard";

/**
 * A judicial retention question (Yes/No on one judge), laid out like a
 * measure: the official question, what it takes to be retained, what each
 * vote means, a short cited bio and one Sources block. The question, the
 * judge's name and the office come from official ballot data.
 */
export function RetentionCard({ race, anchorId }: { race: Race; anchorId?: string }) {
  const judge = race.candidates[0];
  const g = race.general;
  const p = judge?.general;
  const office = judge ? race.office.replace(new RegExp(`:\\s*${escapeRegExp(judge.name)}$`), "") : race.office;
  const docs: Record<string, SourceDoc> = { ...(g?.sourceDocs ?? {}), ...(p?.sourceDocs ?? {}) };
  const voteNeeded = g?.voteNeeded;
  // The narrative bio (research job) reads as one paragraph; curated background keeps one paragraph per fact.
  const narrative = p?.bio ?? [];
  const bio: Cited[] = narrative.length ? [] : [...(p?.currentRole ? [p.currentRole] : []), ...(p?.background ?? []), ...(p?.experience ?? [])];
  const education = p?.education ?? [];
  const positions = p?.pastPositions ?? [];

  return (
    <article
      id={anchorId ?? `race-${race.id}`}
      className="scroll-mt-32 rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 sm:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <div className="min-w-0 flex-1">
          <div className="font-mono-cap text-[11px] tracking-[0.16em] text-[var(--color-accent)]">{office}</div>
          <h3 className="mt-1 font-display text-[22px] sm:text-[28px] leading-[1.15] tracking-[-0.02em] text-balance">
            {judge?.name ?? race.office}
          </h3>
        </div>
        {race.jurisdiction && (
          <p className="sm:mt-1.5 sm:text-right text-[13px] text-[var(--color-paper-3)] flex items-center gap-1.5 sm:justify-end">
            {race.jurisdiction}
            <MapYearInfo note={race.jurisdictionNote} id={`map-note-${race.id}`} />
          </p>
        )}
      </header>

      {race.formatExplainer && (
        <p className="mt-5 text-[15px] leading-[1.65] text-[var(--color-paper-2)] text-pretty max-w-3xl">{race.formatExplainer}</p>
      )}
      {voteNeeded && (
        <p
          className={`mt-3 text-[15px] leading-[1.65] text-pretty max-w-3xl ${voteNeeded.verified ? "text-[var(--color-paper-2)]" : "text-[var(--color-paper-3)]"}`}
          title={COUNTS_VOTES_CAST}
        >
          {voteNeeded.text.replace(/\.?$/, ".")}
        </p>
      )}

      {judge && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          <Meaning label="A YES vote means" item={{ text: `${judge.name} serves a new term as ${office}.`, sources: [] }} docs={docs} />
          <Meaning label="A NO vote means" item={{ text: `${judge.name} does not serve a new term as ${office}.`, sources: [] }} docs={docs} />
        </div>
      )}

      <section className="mt-7 max-w-3xl" aria-label="About the judge">
        <div className="font-mono-cap text-[10px] tracking-[0.16em] text-[var(--color-paper-3)] mb-1">About the judge</div>
        {p?.aiFields?.length ? <AiLabel className="mb-3" /> : <div className="mb-2" />}
        {narrative.length || bio.length || education.length || positions.length ? (
          <div className="space-y-2 text-[14px] leading-[1.6] text-[var(--color-paper-2)]">
            {narrative.length > 0 && (
              <p>
                {narrative.map((b, i) => (
                  <span key={i}>
                    {i > 0 && " "}
                    <RichText text={b.text} auto="neutral" />
                    <Cite ids={b.sources} docs={docs} quotes={b.quotes} />
                  </span>
                ))}
              </p>
            )}
            {bio.map((b, i) => (
              <p key={i}>
                <RichText text={b.text} auto="neutral" />
                <Cite ids={b.sources} docs={docs} quotes={b.quotes} />
              </p>
            ))}
            {education.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {education.map((e, i) => (
                  <li key={i}>
                    {e.text}
                    <Cite ids={e.sources} docs={docs} quotes={e.quotes} />
                  </li>
                ))}
              </ul>
            )}
            {positions.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {positions.map((pos, i) => (
                  <li key={i}>
                    {[pos.title, pos.organization].filter(Boolean).join(", ")}
                    {pos.years && <span className="text-[var(--color-paper-3)]"> · {pos.years}</span>}
                    <Cite ids={pos.sources} docs={docs} quotes={pos.quotes} />
                    {!!pos.committees?.length && <span className="block text-[12px] text-[var(--color-paper-3)]">Committees: {pos.committees.join(", ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Researching what="Background" />
        )}
      </section>

      {race.feed?.contestId && (
        <div className="mt-8">
          <NewsFeed items={[]} feed={{ contestId: race.feed.contestId }} hideWhenEmpty />
        </div>
      )}

      <SourceList
        docs={docs}
        provenance={g?.officialSources}
        notes={voteNeeded?.source ? [{ label: "Vote needed", ...voteNeeded.source }] : undefined}
      />
    </article>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
