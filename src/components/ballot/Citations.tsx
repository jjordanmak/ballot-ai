import { ArrowUpRight } from "lucide-react";
import type { SourceDoc } from "@/domain/enrichment";

/**
 * Inline citation markers + source list. Numbering follows the order of
 * `docs` (first appearance), so markers and the list always agree.
 */
export function Cite({ ids, docs }: { ids: string[] | undefined; docs: Record<string, SourceDoc> }) {
  const order = Object.keys(docs);
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

export function SourceList({ docs, title = "Sources" }: { docs: Record<string, SourceDoc>; title?: string }) {
  const entries = Object.entries(docs);
  if (!entries.length) return null;
  return (
    <div className="mt-8 pt-4 border-t border-[var(--color-ink-3)]">
      <div className="font-mono-cap text-[9px] text-[var(--color-paper-4)] tracking-[0.16em] mb-2">{title}</div>
      <ol className="space-y-1">
        {entries.map(([id, d], i) => (
          <li key={id} className="text-[11px] leading-[1.5] text-[var(--color-paper-3)]">
            <span className="font-mono text-[var(--color-paper-4)] mr-1.5">[{i + 1}]</span>
            <a href={d.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-accent)] inline-flex items-center gap-0.5">
              {d.publisher}: {d.title}
              <ArrowUpRight size={10} aria-hidden />
            </a>
            {d.official && <span className="ml-1.5 text-[var(--color-paper-4)]">(official)</span>}
            <span className="ml-1.5 text-[var(--color-paper-4)]">· accessed {d.accessed}</span>
          </li>
        ))}
      </ol>
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
