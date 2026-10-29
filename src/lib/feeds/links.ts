/**
 * Weekly per candidate: find their X account on their own campaign website
 * (the campaign controls that page, so a profile link there is official)
 * when no official filing listed one. Stored in `candidate_links` with the
 * campaign page as `verified_from`. Never searches X or guesses handles:
 *
 *   - only a page that links exactly one X profile counts (several handles,
 *     e.g. the party's or an embedded post's, are ambiguous and skipped);
 *   - a stored link is re-checked weekly and dropped when the site stops
 *     linking it (a lapsed or changed campaign domain can't keep a handle).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichmentBundle } from "@/domain/enrichment";
import { normalizeForMatch } from "@/domain/text";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";
import { safeFetch, type Resolver } from "./safeFetch";

const RESERVED = new Set(["intent", "share", "home", "i", "hashtag", "search", "login", "signup", "explore", "settings", "privacy", "tos", "x", "twitter", "widgets", "about"]);
const WEEK_MS = 7 * 86_400_000;
const PAGE = 1000;
const CONCURRENCY = 6;

/** Distinct X/Twitter profile handles linked from a page's HTML, lowercased. */
export function findXHandles(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href=["']https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})(?=[/?"'#])/gi)) {
    if (!RESERVED.has(m[1].toLowerCase())) out.add(m[1].toLowerCase());
  }
  return [...out];
}

/** The page's X profile as https://x.com/Handle, only when it links exactly one. */
export function findXProfile(html: string): string | undefined {
  const handles = findXHandles(html);
  if (handles.length !== 1) return undefined;
  const original = new RegExp(`(?:twitter|x)\\.com\\/@?(${handles[0]})(?=[/?"'#])`, "i").exec(html)?.[1] ?? handles[0];
  return `https://x.com/${original}`;
}

interface Todo {
  id: string;
  site: string;
  existing?: string;
}

export async function discoverXLinks(
  db: SupabaseClient<Database>,
  electionId: string,
  bundle: EnrichmentBundle,
  opts: { fetchImpl?: typeof fetch; resolve?: Resolver; now?: Date; budgetMs?: number } = {},
): Promise<{ due: number; checked: number; found: number; dropped: number }> {
  const now = opts.now ?? new Date();
  const until = Date.now() + (opts.budgetMs ?? 90_000);
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();
  const todo: Todo[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("contests")
      .select("id, title, divisions(name), contest_candidates(id, ballot_name, candidate_links(kind, url), candidate_link_checks(checked_at))")
      .eq("election_id", electionId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`links contests: ${error.message}`);
    for (const c of data ?? []) {
      const div = (Array.isArray(c.divisions) ? c.divisions[0] : c.divisions) as { name: string } | null;
      for (const k of c.contest_candidates ?? []) {
        const check = (Array.isArray(k.candidate_link_checks) ? k.candidate_link_checks[0] : k.candidate_link_checks) as { checked_at: string } | null;
        if (check && check.checked_at > weekAgo) continue;
        const entry = bundle.candidates?.[`${normalizeForMatch(div?.name)}|${normalizeForMatch(c.title)}::${normalizeForMatch(k.ballot_name)}`];
        if (entry?.links?.some((l) => l.kind === "x")) continue; // an official filing already names it
        const site = entry?.links?.find((l) => l.kind === "campaign")?.url ?? entry?.campaignUrl;
        if (!site) continue;
        const existing = (k.candidate_links ?? []).find((l) => l.kind === "x")?.url;
        todo.push({ id: k.id, site, existing });
      }
    }
    if ((data ?? []).length < PAGE) break;
  }

  let checked = 0;
  let found = 0;
  let dropped = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length && Date.now() < until) {
        const t = queue.shift()!;
        let x: string | undefined;
        try {
          const res = await safeFetch(
            t.site,
            { headers: { "user-agent": "ballot.ai link check (+https://ballot-ai.vercel.app)" }, signal: AbortSignal.timeout(8000), maxBytes: 2_000_000 },
            { fetchImpl: opts.fetchImpl, resolve: opts.resolve },
          );
          if (!res.ok) continue; // site down: try again next run, keep any stored link
          x = findXProfile(res.text ?? "");
        } catch {
          continue;
        }
        checked++;
        if (x) {
          const { error } = await db
            .from("candidate_links")
            .upsert({ contest_candidate_id: t.id, kind: "x", url: x, verified_from: t.site, checked_at: now.toISOString() }, { onConflict: "contest_candidate_id,kind" });
          if (!error) found++;
        } else if (t.existing) {
          await db.from("candidate_links").delete().eq("contest_candidate_id", t.id).eq("kind", "x");
          dropped++;
        }
        await db.from("candidate_link_checks").upsert({ contest_candidate_id: t.id, checked_at: now.toISOString(), found: !!x });
      }
    }),
  );
  logEvent("links.discover_x", { due: todo.length, checked, found, dropped });
  return { due: todo.length, checked, found, dropped };
}
