/**
 * How the research job reads a page, politely (owner, 2026-10-29):
 * - a stored copy is reused while it's fresh (re-read at most every 6 hours);
 * - robots.txt is honored (cached per site for a day);
 * - one request per site every ~10 s across all parallel workers
 *   (`reserve_host_slot`), with jitter, slowed further after a 403/429;
 * - conditional requests, so an unchanged page is a tiny 304;
 * - an honest user agent.
 * HTML becomes main text; PDFs (official sites only) become their text.
 */
import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { safeFetch, type Resolver } from "@/lib/feeds/safeFetch";
import { robotsAllows } from "./robots";
import { htmlTitle, htmlToText } from "./text";

type Db = SupabaseClient<Database>;

export const USER_AGENT = "ballot.ai research (+https://ballot-ai.vercel.app)";
export const REREAD_AFTER_MS = 6 * 3600_000;
const SPACING_MS = 10_000;
const MAX_WAIT_MS = 25_000;
const MAX_TEXT_CHARS = 2_000_000;
const ROBOTS_TTL_MS = 24 * 3600_000;

export interface FetchDeps {
  db: Db;
  now: Date;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  sleep?: (ms: number) => Promise<void>;
}

export interface Fetched {
  url: string;
  /** Only on a fresh HTML fetch: used to follow links. */
  html?: string;
  text: string;
  title: string;
  sourceId: string;
  fetchedAt: string;
}

export type FetchOutcome = Fetched | { skipped: "robots" | "busy" | "blocked" | "error" | "empty" | "unreadable pdf" };

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when `isPdf` should treat a response as a PDF. */
const isPdf = (url: string, type: string) => /application\/pdf/i.test(type) || /\.pdf($|\?)/i.test(url);

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

async function robotsOk(deps: FetchDeps, url: URL): Promise<boolean> {
  const { db, now } = deps;
  const { data: host } = await db.from("fetch_hosts").select("robots_txt, robots_fetched_at").eq("host", url.hostname).maybeSingle();
  let txt = host?.robots_txt ?? null;
  if (!host?.robots_fetched_at || now.getTime() - Date.parse(host.robots_fetched_at) > ROBOTS_TTL_MS) {
    try {
      const res = await safeFetch(`${url.origin}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(10_000), maxBytes: 500_000 }, deps);
      // A missing robots.txt allows everything; a server error is treated as "try again later".
      if (res.status >= 500) return false;
      txt = res.ok ? (res.text ?? "") : "";
    } catch {
      return false;
    }
    await db.from("fetch_hosts").upsert({ host: url.hostname, robots_txt: txt, robots_fetched_at: now.toISOString() });
  }
  return robotsAllows(txt, url.toString());
}

/** Wait for this site's next free slot; false if it's too busy right now. */
async function takeSlot(deps: FetchDeps, host: string): Promise<boolean> {
  const jitter = Math.floor(Math.random() * 3000);
  // Past MAX_WAIT_MS the function reserves nothing, so callers that give up don't push the site's queue out (0013).
  const { data, error } = await deps.db.rpc("reserve_host_slot", { p_host: host, p_spacing_ms: SPACING_MS + jitter, p_max_wait_ms: MAX_WAIT_MS });
  if (error) return false;
  const ms = Number(data ?? 0);
  if (ms > MAX_WAIT_MS) return false;
  if (ms > 0) await (deps.sleep ?? wait)(ms);
  return true;
}

async function adjustSpeed(deps: FetchDeps, host: string, slower: boolean) {
  const { data } = await deps.db.from("fetch_hosts").select("slow_factor").eq("host", host).maybeSingle();
  const f = data?.slow_factor ?? 1;
  const next = slower ? Math.min(16, f * 2) : Math.max(1, Math.floor(f / 2));
  if (next !== f) await deps.db.from("fetch_hosts").update({ slow_factor: next, updated_at: deps.now.toISOString() }).eq("host", host);
}

/**
 * One document: the stored copy while fresh (or when the site can't be
 * read right now), else fetched politely and stored on `sources`.
 */
export async function getDocument(
  deps: FetchDeps,
  url: string,
  meta: { official: boolean; publisher?: string; sourceType?: string; allowPdf?: boolean },
  maxAgeMs = REREAD_AFTER_MS,
  opts: { needHtml?: boolean } = {},
): Promise<FetchOutcome> {
  const { db, now } = deps;
  const { data: existing } = await db.from("sources").select("id, content_text, title, fetched_at, metadata").eq("url", url).maybeSingle();
  const stored = (): Fetched | null =>
    existing?.content_text ? { url, text: existing.content_text, title: existing.title ?? url, sourceId: existing.id, fetchedAt: existing.fetched_at } : null;
  if (existing?.content_text && now.getTime() - Date.parse(existing.fetched_at) < maxAgeMs) return stored()!;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { skipped: "error" };
  }
  if (!(await robotsOk(deps, u))) return stored() ?? { skipped: "robots" };
  if (!(await takeSlot(deps, u.hostname))) return stored() ?? { skipped: "busy" };

  const prior = (existing?.metadata ?? {}) as { etag?: string; lastModified?: string };
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "text/html, application/xhtml+xml, application/pdf;q=0.9, */*;q=0.5" };
  // A caller that needs the page's links asks without conditions (a 304 has no body to read them from).
  if (existing?.content_text && prior.etag && !opts.needHtml) headers["if-none-match"] = prior.etag;
  if (existing?.content_text && prior.lastModified && !opts.needHtml) headers["if-modified-since"] = prior.lastModified;

  let res;
  try {
    res = await safeFetch(url, { headers, signal: AbortSignal.timeout(30_000), maxBytes: 25_000_000 }, deps);
  } catch {
    return stored() ?? { skipped: "error" };
  }
  if (res.status === 304 && existing) {
    await db.from("sources").update({ fetched_at: now.toISOString() }).eq("id", existing.id);
    await adjustSpeed(deps, u.hostname, false);
    return { ...stored()!, fetchedAt: now.toISOString() };
  }
  if (res.status === 403 || res.status === 429) {
    await adjustSpeed(deps, u.hostname, true);
    return stored() ?? { skipped: "blocked" };
  }
  if (!res.ok || !res.bytes) return stored() ?? { skipped: "error" };
  await adjustSpeed(deps, u.hostname, false);

  const type = res.headers.get("content-type") ?? "";
  let text: string;
  let html: string | undefined;
  let title: string;
  if (isPdf(res.finalUrl, type)) {
    // PDFs only from official election sites (listed in official-guides.json).
    if (!meta.allowPdf) return stored() ?? { skipped: "error" };
    try {
      text = await pdfText(res.bytes);
    } catch {
      return stored() ?? { skipped: "unreadable pdf" };
    }
    if (text.length < 200) return stored() ?? { skipped: "unreadable pdf" };
    title = decodeURIComponent(new URL(res.finalUrl).pathname.split("/").pop() ?? url);
  } else if (/html|xml|text\/plain/i.test(type) || !type) {
    html = res.text ?? "";
    text = htmlToText(html);
    title = htmlTitle(html) ?? url;
    if (text.length < 200) return stored() ?? { skipped: "empty" };
  } else {
    return stored() ?? { skipped: "error" };
  }
  text = text.slice(0, MAX_TEXT_CHARS);
  const row = {
    url,
    canonical_url: res.finalUrl !== url ? res.finalUrl : null,
    source_type: meta.sourceType ?? (meta.official ? "official" : "campaign"),
    trust_tier: meta.official ? "official" : "standard",
    publisher: meta.publisher ?? u.hostname,
    title,
    content_text: text,
    raw_hash: sha(text),
    fetched_at: now.toISOString(),
    status: "active",
    metadata: { etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), contentType: type } as Json,
  };
  const { data, error } = await db.from("sources").upsert(row, { onConflict: "url" }).select("id").single();
  if (error || !data) return { skipped: "error" };
  return { url, html, text, title, sourceId: data.id, fetchedAt: row.fetched_at };
}

/**
 * Long documents (a county voter guide PDF runs to hundreds of pages):
 * keep the passages around the target's own terms, so the model sees the
 * part that's about this measure or person.
 */
export function focusText(text: string, terms: string[], max: number): string {
  if (text.length <= max) return text;
  const lower = text.toLowerCase();
  const windows: [number, number][] = [];
  const span = 6000;
  for (const term of terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3)) {
    for (let at = lower.indexOf(term); at >= 0 && windows.length < 40; at = lower.indexOf(term, at + term.length)) {
      windows.push([Math.max(0, at - 1500), Math.min(text.length, at + span)]);
    }
  }
  if (!windows.length) return text.slice(0, max);
  windows.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  let out = "";
  for (const [a, b] of merged) {
    if (out.length >= max) break;
    out += `${out ? "\n…\n" : ""}${text.slice(a, b)}`;
  }
  return out.slice(0, max);
}
