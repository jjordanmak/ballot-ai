import { ExternalLink } from "lucide-react";
import type { Contest } from "@/domain/ballot";
import { StatusPill } from "@/components/PartyTag";
import { SourceLine } from "./SourceLine";

/** A ballot measure, shown with its official identifier, title and summary. */
export function MeasureCard({ contest, officialGuideUrl }: { contest: Contest; officialGuideUrl?: string }) {
  const m = contest.measure;
  const heading = m?.title || m?.identifier || contest.title || "Untitled measure";
  const showEyebrow = !!m?.identifier && !!m?.title;
  return (
    <article
      id={`contest-${contest.id}`}
      className="scroll-mt-20 rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-5 sm:p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {showEyebrow && (
            <div className="font-mono-cap text-[11px] tracking-[0.16em] text-[var(--color-accent)]">{m!.identifier}</div>
          )}
          <h3 className="mt-1 font-display text-[22px] sm:text-[24px] leading-[1.15] tracking-[-0.01em] text-balance">
            {heading}
          </h3>
          {contest.division.name && <p className="mt-1 text-[13px] text-[var(--color-paper-3)]">{contest.division.name}</p>}
        </div>
        {m?.passageThreshold && <StatusPill>Passes with: {m.passageThreshold}</StatusPill>}
      </header>

      {m?.brief && <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-paper-2)] text-pretty">{m.brief}</p>}

      {m && m.responses.length > 0 && (
        <p className="mt-4 text-[13px] text-[var(--color-paper-3)]">
          On your ballot: <span className="text-[var(--color-paper-2)]">{m.responses.join(" · ")}</span>
        </p>
      )}

      {!m?.brief && !m?.url && (
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-paper-3)]">
          Our data source lists this measure by number only. Its official title, summary, and full text are in your
          official voter guide
          {officialGuideUrl ? (
            <>
              {" "}
              (
              <a href={officialGuideUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--color-accent)]">
                official site
              </a>
              )
            </>
          ) : null}
          .
        </p>
      )}

      {m?.url && (
        <a
          href={m.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-[13px] text-[var(--color-paper-2)] hover:text-[var(--color-accent)]"
        >
          Official measure information <ExternalLink size={12} aria-hidden />
        </a>
      )}

      <SourceLine sources={contest.sources} />
    </article>
  );
}
