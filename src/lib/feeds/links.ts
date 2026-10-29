/**
 * Daily: find each candidate's X account on their own campaign website (the
 * campaign controls that page, so a profile link there is official) when no
 * official filing listed one. Stored in `candidate_links` with the campaign
 * page as `verified_from`. Never searches X or guesses handles.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnrichmentBundle } from "@/domain/enrichment";
import { normalizeForMatch } from "@/domain/text";
import { logEvent } from "@/lib/observability/log";
import type { Database } from "@/lib/supabase/types";

const RESERVED = new Set(["intent", "share", "home", "i", "hashtag", "search", "login", "signup", "explore", "settings", "privacy", "tos", "x", "twitter"]);

/** First X/Twitter profile link in a page's HTML, as https://x.com/handle. */
export function findXProfile(html: string): string | undefined {
  for (const m of html.matchAll(/href=["']https?:\/\/(?:www\.|mobile\.)?(?:twitter|x)\.com\/@?([A-Za-z0-9_]{1,15})(?:[/?"'#])/gi)) {
    if (!RESERVED.has(m[1].toLowerCase())) return `https://x.com/${m[1]}`;
  }
  return undefined;
}

export async function discoverXLinks(
  db: SupabaseClient<Database>,
  electionId: string,
  bundle: EnrichmentBundle,
  fetchImpl: typeof fetch = fetch,
): Promise<{ checked: number; found: number }> {
  const { data } = await db
    .from("contests")
    .select("title, divisions(name), contest_candidates(id, ballot_name, candidate_links(kind))")
    .eq("election_id", electionId);
  const todo: { id: string; site: string }[] = [];
  for (const c of data ?? []) {
    const div = (Array.isArray(c.divisions) ? c.divisions[0] : c.divisions) as { name: string } | null;
    for (const k of c.contest_candidates ?? []) {
      if ((k.candidate_links ?? []).some((l) => l.kind === "x")) continue;
      const entry = bundle.candidates?.[`${normalizeForMatch(div?.name)}|${normalizeForMatch(c.title)}::${normalizeForMatch(k.ballot_name)}`];
      if (entry?.links?.some((l) => l.kind === "x")) continue;
      const site = entry?.links?.find((l) => l.kind === "campaign")?.url ?? entry?.campaignUrl;
      if (site) todo.push({ id: k.id, site });
    }
  }
  let found = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await check(t);
  }));
  logEvent("links.discover_x", { checked: todo.length, found });
  return { checked: todo.length, found };

  async function check(t: { id: string; site: string }) {
    try {
      const res = await fetchImpl(t.site, { headers: { "user-agent": "ballot.ai link check (+https://ballot-ai.vercel.app)" }, signal: AbortSignal.timeout(8000), redirect: "follow" });
      const x = res.ok ? findXProfile(await res.text()) : undefined;
      if (!x) return;
      const { error } = await db
        .from("candidate_links")
        .upsert({ contest_candidate_id: t.id, kind: "x", url: x, verified_from: t.site, checked_at: new Date().toISOString() }, { onConflict: "contest_candidate_id,kind" });
      if (!error) found++;
    } catch {
      // Site down or slow: try again tomorrow.
    }
  }
}
