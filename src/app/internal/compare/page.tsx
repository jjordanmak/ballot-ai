import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichText } from "@/components/Highlight";
import { Cite, SourceList } from "@/components/ballot/Citations";
import type { SourceDoc } from "@/domain/enrichment";
import { deprecatedPagesEnabled } from "@/components/deprecated/JunePrimary";
import { settingId } from "@/lib/ai/config";
import { loadComparison } from "@/lib/research/compareLoad";
import { settingLabel, type Cell, type CompareTarget, type Item, type SettingSummary } from "@/lib/research/compareReview";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * INTERNAL ONLY: the model comparison (owner, 2026-10-29). Every setting's
 * held result for each item in the comparison set, side by side. Previews
 * and local only (production 404s, same gate as the deprecated June page);
 * held rows are read with the service role and never served on a ballot.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "ballot.ai • model comparison (internal)", robots: { index: false, follow: false } };

const KINDS: { key: CompareTarget["kind"] | "all"; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "measure", label: "Measures" },
  { key: "retention", label: "Judges" },
  { key: "candidate", label: "Candidates" },
  { key: "office", label: "Offices" },
];

const usd = (micro: number) => (micro === 0 ? "$0" : micro >= 10_000 ? `$${(micro / 1e6).toFixed(2)}` : `$${(micro / 1e6).toFixed(4)}`);

type Search = { kind?: string; differ?: string; hide?: string };

function href(cur: Search, patch: Partial<Search>): string {
  const q = new URLSearchParams();
  const next = { ...cur, ...patch };
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/internal/compare?${s}` : "/internal/compare";
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!deprecatedPagesEnabled()) notFound();
  const sp = await searchParams;
  const data = await loadComparison(getSupabaseAdmin());
  const hidden = new Set((sp.hide ?? "").split(",").filter(Boolean));
  const shown = data.settings.map(settingId).filter((s) => !hidden.has(s));
  const kind = KINDS.some((k) => k.key === sp.kind) ? sp.kind! : "all";
  const items = data.items.filter((i) => (kind === "all" || i.target.kind === kind) && (sp.differ !== "1" || i.differing.length));
  const toggleHide = (s: string) => {
    const next = new Set(hidden);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return [...next].join(",");
  };

  return (
    <main className="min-h-screen bg-[var(--color-ink-0)] px-4 py-8 text-paper md:px-8">
      <header className="mb-6">
        <p className="font-mono-cap text-[11px] tracking-[0.16em] text-paper-3">Internal · not public</p>
        <h1 className="mt-1 font-serif text-2xl">Model comparison</h1>
        <p className="mt-2 max-w-3xl text-sm text-paper-2">
          {data.ballot}: {data.items.length} items, each researched by every setting below with the same documents, prompt and checks. Nothing here
          appears on a ballot page. Pick a model and effort per item type in <code className="font-mono text-paper">docs/architecture/MODEL_DECISIONS.md</code>.
        </p>
        {data.failures.length > 0 && <p className="mt-2 text-sm text-[var(--color-trend-down)]">Could not read everything: {data.failures.join("; ")}</p>}
      </header>

      <Summary rows={data.summary} hidden={hidden} hrefFor={(s) => href(sp, { hide: toggleHide(s) })} />

      <nav className="sticky top-0 z-[100] -mx-4 mb-6 flex flex-wrap items-center gap-2 bg-[var(--color-ink-0)] px-4 py-3 text-sm md:-mx-8 md:px-8">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={href(sp, { kind: k.key === "all" ? undefined : k.key })}
            className={`rounded-full border px-3 py-1 ${kind === k.key ? "border-[var(--color-accent)] text-paper" : "border-[var(--color-ink-3)] text-paper-2 hover:border-[var(--color-ink-4)]"}`}
          >
            {k.label}
          </Link>
        ))}
        <Link
          href={href(sp, { differ: sp.differ === "1" ? undefined : "1" })}
          className={`rounded-full border px-3 py-1 ${sp.differ === "1" ? "border-[var(--color-accent)] text-paper" : "border-[var(--color-ink-3)] text-paper-2 hover:border-[var(--color-ink-4)]"}`}
        >
          Only where settings differ
        </Link>
        <span className="ml-auto text-paper-3">
          {items.length} items · {shown.length} columns
        </span>
      </nav>

      <div className="space-y-10">
        {items.map((i) => (
          <ItemSection key={i.target.key} item={i} shown={shown} />
        ))}
        {items.length === 0 && <p className="text-paper-3">No items match these filters.</p>}
      </div>
    </main>
  );
}

function Summary({ rows, hidden, hrefFor }: { rows: SettingSummary[]; hidden: Set<string>; hrefFor: (s: string) => string }) {
  return (
    <section className="mb-6 overflow-x-auto rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)]">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-paper-3">
          <tr className="border-b border-[var(--color-ink-3)]">
            <th className="px-3 py-2 font-normal">Setting</th>
            <th className="px-3 py-2 font-normal">Done</th>
            <th className="px-3 py-2 font-normal">Total cost</th>
            <th className="px-3 py-2 font-normal">Cost per item</th>
            <th className="px-3 py-2 font-normal">Seconds per item</th>
            <th className="px-3 py-2 font-normal">Answers kept</th>
            <th className="px-3 py-2 font-normal">Rejected, by reason</th>
            <th className="px-3 py-2 font-normal">Left blank</th>
            <th className="px-3 py-2 font-normal">Input from cache</th>
            <th className="px-3 py-2 font-normal">Column</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.setting} className={`border-b border-[var(--color-ink-3)] last:border-0 ${hidden.has(r.setting) ? "text-paper-4" : ""}`}>
              <td className="px-3 py-2 font-mono">{settingLabel(r.setting)}</td>
              <td className="px-3 py-2">
                {r.done} / {r.items}
              </td>
              <td className="px-3 py-2">{usd(r.costMicroUsd)}</td>
              <td className="px-3 py-2">{r.done ? usd(r.costMicroUsd / r.done) : "—"}</td>
              <td className="px-3 py-2">{r.avgSeconds ?? "—"}</td>
              <td className="px-3 py-2">{r.kept}</td>
              <td className="px-3 py-2">
                {Object.entries(r.rejectedByReason)
                  .map(([k, n]) => `${k} ${n}`)
                  .join(", ") || "none"}
              </td>
              <td className="px-3 py-2">{r.blank}</td>
              <td className="px-3 py-2">{r.cachedShare === null ? "—" : `${Math.round(r.cachedShare * 100)}%`}</td>
              <td className="px-3 py-2">
                <Link href={hrefFor(r.setting)} className="text-paper-2 underline decoration-[var(--color-ink-4)] hover:text-paper">
                  {hidden.has(r.setting) ? "show" : "hide"}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ItemSection({ item, shown }: { item: Item; shown: string[] }) {
  const cells = item.cells.filter((c) => shown.includes(c.setting));
  return (
    <section>
      <p className="font-mono-cap text-[11px] tracking-[0.16em] text-paper-3">{KINDS.find((k) => k.key === item.target.kind)?.label}</p>
      <h2 className="mt-1 font-serif text-xl">{item.target.label}</h2>
      {item.differing.length > 0 && (
        <p className="mt-1 text-xs text-paper-3">{`Settings differ on: ${item.differing.map((f) => item.fields.find((x) => x.key === f)?.label ?? f).join(", ")}`}</p>
      )}
      <div className="mt-3 overflow-x-auto">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(280px, 1fr))` }}>
          {cells.map((c) => (
            <CellView key={c.setting} cell={c} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

const STATUS_COPY: Record<Cell["status"], string> = {
  done: "",
  pending: "Not run yet",
  "no documents": "No documents found",
  failed: "The call failed",
  other: "",
};

const TIER_LABEL: Record<string, string> = { official: "Official", ballotpedia: "Ballotpedia", news: "News", campaign: "Campaign" };

function CellView({ cell, item }: { cell: Cell; item: Item }) {
  // Number this cell's sources by first appearance, as the ballot page does.
  const docs: Record<string, SourceDoc> = {};
  for (const f of item.fields)
    for (const l of cell.fields[f.key] ?? [])
      for (const r of l.refs)
        if (r.source && !docs[r.source.url])
          {
          const tier = TIER_LABEL[r.source.tier ?? ""] ?? (r.source.official ? "Official" : "Source");
          const publisher = r.source.publisher || new URL(r.source.url).hostname;
          docs[r.source.url] = { title: r.source.title, publisher: publisher === tier ? tier : `${tier} · ${publisher}`, url: r.source.url, official: r.source.official, accessed: r.source.fetchedAt.slice(0, 10) };
        }
  return (
    <article className="flex flex-col rounded-xl border border-[var(--color-ink-3)] bg-[var(--color-ink-1)] p-3 text-sm">
      <h3 className="mb-2 font-mono text-xs text-paper">{settingLabel(cell.setting)}</h3>
      {cell.status !== "done" ? (
        <p className="text-paper-3">{STATUS_COPY[cell.status] || cell.outcome || "Not run yet"}</p>
      ) : (
        <dl className="space-y-3">
          {item.fields.map((f) => {
            const lines = cell.fields[f.key] ?? [];
            const rejected = cell.rejected.filter((r) => r.field === f.key || r.field.startsWith(`${f.key}.`) || r.field.startsWith(`${f.key}[`));
            return (
              <div key={f.key} className={item.differing.includes(f.key) ? "border-l-2 border-[var(--color-accent)] pl-2" : "pl-2.5"}>
                <dt className="text-xs text-paper-3">{f.label}</dt>
                {lines.length === 0 && <dd className="text-paper-4">blank</dd>}
                {lines.map((l, n) => (
                  <dd key={n} className="mt-1">
                    <RichText text={l.text} auto="neutral" />
                    <Cite ids={l.refs.map((r) => r.source?.url ?? "")} docs={docs} quotes={l.refs.map((r) => r.quote)} />
                    {l.sub && <span className="block text-xs text-paper-3">{l.sub}</span>}
                  </dd>
                ))}
                {rejected.map((r, n) => (
                  <dd key={`r${n}`} className="mt-1 text-xs text-paper-4">
                    {`Rejected (${r.reason})${r.detail ? `: ${r.detail}` : ""}`}
                  </dd>
                ))}
              </div>
            );
          })}
        </dl>
      )}
      {Object.keys(docs).length > 0 && <SourceList docs={docs} />}
      {cell.leftOut.length > 0 && (
        <details className="mt-3 text-xs text-paper-3">
          <summary className="cursor-pointer text-paper-2">Left out ({cell.leftOut.length})</summary>
          <ul className="mt-1 space-y-1">
            {cell.leftOut.map((x, i) => (
              <li key={i}>
                {x.fact} <span className="text-paper-4">— {x.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {cell.conflicts.length > 0 && (
        <details className="mt-2 text-xs text-paper-3">
          <summary className="cursor-pointer text-paper-2">Sources disagreed ({cell.conflicts.length})</summary>
          <ul className="mt-1 space-y-1">
            {cell.conflicts.map((x, i) => (
              <li key={i}>
                Kept “{x.kept}”, not “{x.dropped}”
              </li>
            ))}
          </ul>
        </details>
      )}
      {cell.tried.length > 0 && (
        <details className="mt-2 text-xs text-paper-3">
          <summary className="cursor-pointer text-paper-2">Pages tried ({cell.tried.length})</summary>
          <ul className="mt-1 space-y-1 break-all">
            {cell.tried.map((x, i) => (
              <li key={i}>
                <span className={x.outcome.startsWith("read") ? "text-paper-2" : "text-paper-4"}>{x.outcome}</span> · {x.url}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-auto pt-3 text-xs text-paper-3">
        {usd(cell.costMicroUsd)}
        {typeof cell.seconds === "number" ? ` · ${cell.seconds}s` : ""}
      </p>
    </article>
  );
}
