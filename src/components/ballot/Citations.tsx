import { ArrowUpRight } from "lucide-react";
import type { SourceRef } from "@/domain/ballot";
import type { SourceDoc } from "@/domain/enrichment";
import { ProvenanceLine } from "./SourceLine";

/**
 * Inline citation markers + source list. Numbering follows the order of
 * `docs` (first appearance), so markers and the list always agree.
 *
 * With a single source there are no inline markers: "[1]" after every
 * sentence says nothing the one "Source" line below doesn't. Everything is
 * still cited, at block level. A second source brings the markers back.
 */
export function Cite({ ids, docs }: { ids: string[] | undefined; docs: Record<string, SourceDoc> }) {
  const order = Object.keys(docs);
  if (order.length < 2) return null;
  const nums = [...new Set(ids ?? [])].map((id) => ({ id, n: order.indexOf(id) + 1 })).filter((x) => x.n > 0);
  if (!nums.length) return null;
  return (
    <sup className="ml-0.5 whitespace-nowrap">
      {nums.map(({ id, n }) => (
        <a
          key={id}
          href={docs[id].url}
          target="_blank"
          rel="noopener noreferrer"
          title={`${docs[id].publisher}: ${docs[id].title}`}
          className="font-mono text-[9px] text-[var(--color-paper-3)] hover:text-[var(--color-accent)] no-underline px-[1px]"
        >
          [{n}]
        </a>
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
 * given), then the researched sources: a single unnumbered line for one
 * source, a numbered list (matching the inline markers) for several.
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
      {entries.length === 1 ? (
        <p className="text-[11px] leading-[1.5] text-[var(--color-paper-3)]">
          {hasProvenance && <span className="text-[var(--color-paper-4)]">Explanations: </span>}
          <DocLink d={entries[0][1]} />
        </p>
      ) : (
        entries.length > 1 && (
          <ol className="space-y-1">
            {entries.map(([id, d], i) => (
              <li key={id} className="text-[11px] leading-[1.5] text-[var(--color-paper-3)]">
                <span className="font-mono text-[var(--color-paper-4)] mr-1.5">[{i + 1}]</span>
                <DocLink d={d} />
              </li>
            ))}
          </ol>
        )
      )}
    </div>
  );
}

export function Researching({ what }: { what?: string }) {
  return (
    <p className="text-[13px] leading-[1.55] italic text-[var(--color-paper-4)]">
      {what ? `${what} being researched.` : "Being researched."} We only publish what we can cite.
    </p>
  );
}
