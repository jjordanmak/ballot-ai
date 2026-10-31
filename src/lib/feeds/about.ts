/**
 * The person check's AI step (owner, 2026-10-30): when the rules in
 * match.ts can't tell whether a story is about a candidate or only
 * mentions them, Haiku is asked, and must copy a sentence from the story
 * that reports what the candidate said, did or proposed. Code accepts the
 * answer only if that sentence is in the story word for word and is about
 * them (names them, or follows a sentence that does). Anything else leaves
 * the candidate off. Runs in the news cron, never on page load; the input
 * is the outlet's article and a candidate's ballot name, never an address.
 */
import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { normalizeForQuote, quoteFound } from "@/lib/ai/checks";
import type { Setting } from "@/lib/ai/config";
import { extract } from "@/lib/ai/extract";

export const ABOUT_SYSTEM =
  "You check whether a news article is about a particular political candidate, for a nonpartisan voter guide that lists news about each candidate. Answer only from the article. You judge relevance, not the candidate or the article.";

export function aboutTask(name: string, office: string): string {
  return `Is this article substantively about ${name}, a candidate for ${office}: does it profile them, quote them, or report their positions, statements or actions? A passing mention (a list of names, a past officeholder, a reference to someone else's opponent) is not enough.

If it is about them, set "about" to true and copy into "quote" one sentence from the article, exactly as written, that reports what ${name} said, did or proposed. If not, set "about" to false and leave "quote" empty.`;
}

export const AboutAnswer = z.object({
  about: z.boolean(),
  quote: z.string().describe("One sentence copied from the article, character for character, or empty."),
});

/** How far before the quote a name mention may be ("Becerra … He said …"). */
const SPAN_CHARS = 300;

/** The quote is in the story and about this person: it names them, or follows closely after a sentence that does. Pure. */
export function quoteAboutThem(quote: string, article: string, variants: string[], surname: string): boolean {
  if (!quoteFound(quote, article)) return false;
  const doc = normalizeForQuote(article);
  const first = normalizeForQuote(quote.split(/\s*(?:\.\.\.|…)\s*/)[0] ?? quote);
  const at = doc.indexOf(first);
  if (at < 0) return false;
  const names = [surname, ...variants].map((n) => n.toLowerCase()).filter(Boolean);
  const words = (s: string) => ` ${s.replace(/[^a-z0-9]+/g, " ")} `;
  const quoteText = words(normalizeForQuote(quote));
  if (names.some((n) => quoteText.includes(` ${n} `))) return true;
  const before = words(doc.slice(Math.max(0, at - SPAN_CHARS), at));
  return names.some((n) => before.includes(` ${n} `));
}

export interface AboutVerdict {
  about: boolean;
  quote?: string;
  problem?: string;
  costMicroUsd: number;
}

export async function checkAbout(opts: {
  name: string;
  office: string;
  title: string;
  url: string;
  article: string;
  variants: string[];
  surname: string;
  setting: Setting;
  client?: Pick<Anthropic, "messages">;
}): Promise<AboutVerdict> {
  const res = await extract({
    model: opts.setting.model,
    effort: opts.setting.effort,
    schema: AboutAnswer,
    system: ABOUT_SYSTEM,
    task: aboutTask(opts.name, opts.office),
    docs: [{ id: "A1", title: opts.title, url: opts.url, text: opts.article }],
    maxTokens: 2000,
    timeoutMs: 20_000,
    client: opts.client,
  });
  if (!res.data) return { about: false, problem: res.problem, costMicroUsd: res.costMicroUsd };
  const ok = res.data.about && quoteAboutThem(res.data.quote, opts.article, opts.variants, opts.surname);
  return { about: ok, quote: ok ? res.data.quote : undefined, problem: res.data.about && !ok ? "quote not found or not about them" : undefined, costMicroUsd: res.costMicroUsd };
}
