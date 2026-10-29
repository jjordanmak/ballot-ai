import { ArrowUpRight } from "lucide-react";
import type { SourceRef } from "@/domain/ballot";
import type { SourceDoc } from "@/domain/enrichment";
import { CiteMarker } from "./CiteMarker";
import { ProvenanceLine } from "./SourceLine";

/**
 * Inline citation markers + source list. Numbering follows the order of
 * `docs` (first appearance), so markers and the list always agree.
 *
 * Every cited item gets a marker, even when the block has one source
 * (owner, 2026-10-29): the marker opens the exact sentence that supports
 * that item, which the block's Sources line can't show.
 */
export function Cite({ ids, docs, quotes }: { ids: string[] | undefined; docs: Record<string, SourceDoc>; quotes?: (string | undefined)[] }) {
  const order = Object.keys(docs);
  const seen = new Set<string>();
  const nums = (ids ?? [])
    .map((id, i) => ({ id, n: order.indexOf(id) + 1, quote: quotes?.[i] }))
    .filter((x) => x.n > 0 && !seen.has(x.id) && seen.add(x.id));
  if (!nums.length) return null;
  return (
    <sup className="ml-0.5 whitespace-nowrap">
      {nums.map(({ id, n, quote }) => (
        <CiteMarker key={id} n={n} doc={docs[id]} quote={quote} />
      ))}
    </sup>
  );
}

function DocLink({ d }: { d: SourceDoc }) {
  return (
    <>
      <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)] inline-flex items-center gap-0.5">
        {d.publisher}: {d.title}
        <ArrowUpRight size={10} aria-hidden />
      </a>
      {d.official && <span className="ml-1.5 text-[var(--color-paper-4)]">(official)</span>}
      <span className="ml-1.5 text-[var(--color-paper-4)]">· accessed {d.accessed}</span>
    </>
  );
}

/**
 * One Sources block: where the ballot data came from (`provenance`, when
 * given), then the researched sources as a numbered list matching the
 * inline [n] markers (numbered even when there is one).
 */
export function SourceList({
  docs,
  title = "Sources",
  provenance,
  notes,
}: {
  docs: Record<string, SourceDoc>;
  title?: string;
  provenance?: SourceRef[];
  /** Extra labeled sources, e.g. the rule behind "Vote needed". */
  notes?: { label: string; name: string; url: string }[];
}) {
  const entries = Object.entries(docs);
  const hasProvenance = !!provenance?.length;
  if (!entries.length && !hasProvenance && !notes?.length) return null;
  const label = "font-mono-cap text-[9px] text-[var(--color-paper-4)] tracking-[0.16em]";
  return (
    <div className="mt-8 pt-4 border-t border-[var(--color-ink-3)]">
      <div className={`${label} mb-2`}>{title}</div>
      {hasProvenance && (
        <p className="text-[11px] leading-[1.5] text-[var(--color-paper-3)] mb-1">
          <span className="text-[var(--color-paper-4)]">Ballot data:</span> <ProvenanceLine sources={provenance!} />
        </p>
      )}
      {notes?.map((n) => (
        <p key={n.label} className="text-[11px] leading-[1.5] text-[var(--color-paper-3)] mb-1">
          <span className="text-[var(--color-paper-4)]">{n.label}:</span>{" "}
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)] inline-flex items-center gap-0.5">
            {n.name}
            <ArrowUpRight size={10} aria-hidden />
          </a>
        </p>
      ))}
      {entries.length > 0 && (
        <ol className="space-y-1">
          {entries.map(([id, d], i) => (
            <li key={id} className="text-[11px] leading-[1.5] text-[var(--color-paper-3)]">
              <span className="font-mono text-[var(--color-paper-4)] mr-1.5">[{i + 1}]</span>
              <DocLink d={d} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Researching({ what, live }: { what?: string; live?: boolean }) {
  return (
    <p className="text-[13px] leading-[1.55] italic text-[var(--color-paper-4)]">
      {what ? `${what} being researched.` : "Being researched."}{" "}
      {live ? "This fills in automatically in a few minutes, without reloading." : "We only publish what we can cite."}
    </p>
  );
}

/**
 * Marks content written by the in-app research pipeline: an AI summary of
 * the sources listed in the block, each answer checked against the exact
 * sentence it cites (AI_ARCHITECTURE §2: labeled, never unlabeled).
 */
export function AiLabel({ className = "" }: { className?: string }) {
  return (
    <p className={`font-mono-cap text-[9px] tracking-[0.16em] text-[var(--color-paper-4)] ${className}`}>
      AI summary of the sources below · each item checked against the sentence it cites
    </p>
  );
}
