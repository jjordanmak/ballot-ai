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

export type SearchKind = "person" | "office" | "measure";

export interface SearchResult {
  urls: string[];
  costMicroUsd: number;
  problem?: string;
}

const isGov = (h: string) => /(^|\.)gov$/i.test(h) || /(^|\.)(ca|ny|tx)\.us$/i.test(h);
const isBallotpedia = (h: string) => /(^|\.)ballotpedia\.org$/i.test(h);

/** Which result URLs we may use, best first. Exported for tests. */
export function keepUrls(kind: SearchKind, results: { url: string; title: string }[], mustMention: string[] = []): string[] {
  const out: string[] = [];
  for (const r of results) {
    let u: URL;
    try {
      u = new URL(r.url);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    const allowed = isGov(u.hostname) || (kind === "person" && isBallotpedia(u.hostname));
    if (!allowed) continue;
    // A Ballotpedia result must be the person's own page, not a list or another person.
    if (isBallotpedia(u.hostname) && mustMention.length && !mustMention.every((m) => r.title.toLowerCase().includes(m.toLowerCase()))) continue;
    u.hash = "";
    if (!out.includes(u.toString())) out.push(u.toString());
  }
  // At most one Ballotpedia page and three .gov pages.
  const bp = out.filter((x) => isBallotpedia(new URL(x).hostname)).slice(0, 1);
  const gov = out.filter((x) => isGov(new URL(x).hostname)).slice(0, 3);
  return [...bp, ...gov];
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
  client?: Pick<Anthropic, "messages">;
}): Promise<SearchResult> {
  const c = opts.client ?? (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));
  const model = opts.model || process.env.ANTHROPIC_SEARCH_MODEL?.trim() || "claude-haiku-5-5";
  const where = opts.kind === "person" ? "official .gov pages and the person's Ballotpedia page" : "official .gov pages";
  const ask = (m: string, tool: "web_search_20250305" | "web_search_20260209") =>
    c.messages.create({
      model: m,
      max_tokens: 2000,
      tools: [{ type: tool, name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: `Find ${where} about: ${opts.query}. Search, then reply "done". Do not summarize anything.` }],
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
