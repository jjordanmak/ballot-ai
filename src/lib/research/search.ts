/**
 * Finds official pages for a target that has none in the registry
 * (owner, 2026-10-29): Claude's web search tool returns result URLs, and
 * code keeps only `*.gov` and `ballotpedia.org` (people) or `*.gov` (offices
 * and measures). The model writes nothing that is published; every kept
 * page is then fetched and quote-checked like any other source.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { costMicroUsd } from "@/lib/ai/config";
import { siteOf } from "@/lib/feeds/discover";
import { NEWS_SOURCES } from "@/lib/feeds/sources";
import { searchTask } from "@/lib/ai/prompts";

/** "claim": the source finder (owner, 2026-10-30), looking for sources for sentences the writer's documents didn't support. */
export type SearchKind = "person" | "office" | "measure" | "race" | "claim";

export interface SearchResult {
  urls: string[];
  costMicroUsd: number;
  problem?: string;
}

export const isGov = (h: string) => /(^|\.)gov$/i.test(h) || /(^|\.)(ca|ny|tx)\.us$/i.test(h);
export const isBallotpedia = (h: string) => /(^|\.)ballotpedia\.org$/i.test(h);
export const isWikipedia = (h: string) => /(^|\.)wikipedia\.org$/i.test(h);

/**
 * News outlets ballot.ai already vets for "In the news" (src/data/sources/news.json),
 * by their own domain. Outlets turned off only for lacking a feed still count;
 * outlets that block automated readers don't.
 */
const NEWS_SITES = new Set(
  NEWS_SOURCES.filter((s) => s.enabled !== false || !/403|block/i.test(s.disabledReason ?? "")).map((s) => {
    try {
      return siteOf(new URL(s.url).hostname);
    } catch {
      return "";
    }
  }),
);
NEWS_SITES.delete("");
export const isVettedNews = (h: string) => NEWS_SITES.has(siteOf(h)) && !isGov(h) && !isBallotpedia(h) && !isWikipedia(h);

/**
 * Which result URLs we may use, best first. Measures and offices: .gov only.
 * People (owner, 2026-10-29): .gov, their own Ballotpedia page, articles from
 * vetted news outlets, and their Wikipedia page as a finder only (its
 * references are followed; Wikipedia itself is never cited). Exported for tests.
 */
export function keepUrls(kind: SearchKind, results: { url: string; title: string }[], mustMention: string[] = []): string[] {
  const out: string[] = [];
  const names = (title: string) => !mustMention.length || mustMention.every((m) => title.toLowerCase().includes(m.toLowerCase()));
  for (const r of results) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const h = u.hostname;
    const person = kind === "person";
    // Race intros and the source finder: .gov, vetted news and Ballotpedia; no Wikipedia.
    const race = kind === "race" || kind === "claim";
    const allowed = isGov(h) || (person && (isBallotpedia(h) || isWikipedia(h) || isVettedNews(h))) || (race && (isBallotpedia(h) || isVettedNews(h)));
    if (!allowed) continue;
    // Ballotpedia, Wikipedia and news results must be about this person, not a list or someone else.
    if (person && !isGov(h) && !names(r.title)) continue;
    u.hash = "";
    if (!out.includes(u.toString())) out.push(u.toString());
  }
  const host = (x: string) => new URL(x).hostname;
  return [
    ...out.filter((x) => isBallotpedia(host(x))).slice(0, 1),
    ...out.filter((x) => isGov(host(x))).slice(0, 3),
    ...out.filter((x) => isVettedNews(host(x))).slice(0, 3),
    ...out.filter((x) => isWikipedia(host(x))).slice(0, 1),
  ];
}

let client: Anthropic | null = null;

/**
 * Search once. The search model is the cheapest one with the web search
 * tool (`ANTHROPIC_SEARCH_MODEL`, default Haiku with the basic tool);
 * it only finds URLs.
 */
export async function searchUrls(opts: {
  kind: SearchKind;
  query: string;
  mustMention?: string[];
  model?: string;
  /** Searches the tool may run (default 3; the source finder runs 1). */
  maxUses?: number;
  client?: Pick<Anthropic, "messages">;
}): Promise<SearchResult> {
  const c = opts.client ?? (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
  const model = opts.model || process.env.ANTHROPIC_SEARCH_MODEL?.trim() || "claude-haiku-5-5";
  const ask = (m: string, tool: "web_search_20250305" | "web_search_20260209") =>
    c.messages.create({
      model: m,
      max_tokens: 2000,
      tools: [{ type: tool, name: "web_search", max_uses: opts.maxUses ?? 3 }],
      messages: [{ role: "user", content: searchTask(opts.kind, opts.query) }],
    });
  try {
    let used = model;
    let res;
    try {
      res = await ask(model, "web_search_20250305");
    } catch (e) {
      // A model without the basic search tool: fall back to Sonnet with the current tool.
      if (!(e instanceof Anthropic.BadRequestError)) throw e;
      used = "claude-sonnet-5-5";
      res = await ask(used, "web_search_20260209");
    }
    const results: { url: string; title: string }[] = [];
    for (const block of res.content) {
      if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
      for (const r of block.content) if (r.type === "web_search_result") results.push({ url: r.url, title: r.title });
    }
    const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
    const cost = costMicroUsd(used, res.usage) + searches * 10_000; // $10 per 1,000 searches
    return { urls: keepUrls(opts.kind, results, opts.mustMention), costMicroUsd: cost };
  } catch (e) {
    return { urls: [], costMicroUsd: 0, problem: e instanceof Anthropic.APIError ? `api_${e.status ?? "error"}` : "error" };
  }
}

/** Ballotpedia lists a person's campaign website; use it only from there. */
export function ballotpediaCampaignSite(html: string): string | null {
  const m = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>\s*Campaign website\s*<\/a>/i.exec(html);
  if (!m) return null;
  try {
    const u = new URL(m[1]);
    return isBallotpedia(u.hostname) ? null : u.toString();
  } catch {
    return null;
  }
}
