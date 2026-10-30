/**
 * Reading a news article's own text, for matching only (owner, 2026-10-30:
 * many stories name a candidate only in the body). Uses the research job's
 * polite fetching: robots.txt, one request per site every ~10 s shared with
 * research, slowed after a 403/429, an honest user agent. The text is used
 * once to match and never stored; `feed_article_reads` keeps only the URL,
 * when it was read and how that went, so no article is read twice.
 */
import "server-only";
import { adjustSpeed, robotsOk, takeSlot, type FetchDeps } from "@/lib/research/fetch";
import { htmlToText } from "@/lib/research/text";
import { safeFetch } from "./safeFetch";

export type ReadOutcome = "read" | "robots" | "busy" | "blocked" | "error" | "empty";

const TIMEOUT_MS = 10_000;
/** Below this, the page is a paywall, consent wall or stub, not the story. */
const MIN_TEXT_CHARS = 500;

/** The story's text: the `<article>` element when the page has one, else its main text. */
export function articleText(html: string): string {
  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1];
  return htmlToText(article ? `<main>${article}</main>` : html);
}

export async function readArticle(
  deps: FetchDeps,
  url: string,
  userAgent: string,
  maxWaitMs: number,
): Promise<{ outcome: ReadOutcome; text?: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { outcome: "error" };
  }
  if (!(await robotsOk(deps, u))) return { outcome: "robots" };
  if (!(await takeSlot(deps, u.hostname, maxWaitMs))) return { outcome: "busy" };
  let res;
  try {
    res = await safeFetch(url, { headers: { "user-agent": userAgent, accept: "text/html, application/xhtml+xml;q=0.9" }, signal: AbortSignal.timeout(TIMEOUT_MS), maxBytes: 5_000_000 }, deps);
  } catch {
    return { outcome: "error" };
  }
  if (res.status === 403 || res.status === 429) {
    await adjustSpeed(deps, u.hostname, true);
    return { outcome: "blocked" };
  }
  if (!res.ok || !/html/i.test(res.headers.get("content-type") ?? "html")) return { outcome: "error" };
  await adjustSpeed(deps, u.hostname, false);
  const text = articleText(res.text ?? "");
  return text.length < MIN_TEXT_CHARS ? { outcome: "empty" } : { outcome: "read", text };
}
