/**
 * "What it means for you": the same six questions on every measure, in the
 * same order, so no measure gets questions another doesn't. Answers come
 * only from official nonpartisan analyses (cited in the enrichment); the
 * type of change can also be read from the official title's own words.
 */
import type { Cited, MeasureEnrichment } from "@/domain/enrichment";

export const IMPACT_QUESTIONS = [
  { key: "taxes", question: "Does it change taxes or fees?" },
  { key: "cost", question: "What does it cost or save the government?" },
  { key: "money", question: "Where does the money go?" },
  { key: "affected", question: "Who is directly affected?" },
  { key: "currentLaw", question: "What is the law today?" },
  { key: "kind", question: "What kind of change is it?" },
] as const;

export type ImpactKey = (typeof IMPACT_QUESTIONS)[number]["key"];

export type ImpactAnswer = { kind: "cited"; item: Cited } | { kind: "title"; text: string } | { kind: "missing"; text: string };

/** Type of change from the official title's own label ("… Legislative Constitutional Amendment."). */
export function kindFromTitle(title: string | undefined, identifier: string | undefined): string | undefined {
  const t = `${title ?? ""} ${identifier ?? ""}`;
  const parts: string[] = [];
  if (/legislative constitutional amendment/i.test(t)) parts.push("A change to the state constitution, placed on the ballot by the Legislature");
  else if (/initiative constitutional amendment/i.test(t)) parts.push("A change to the state constitution, proposed by citizen petition");
  else if (/initiative statute/i.test(t)) parts.push("A state law, proposed by citizen petition");
  else if (/legislative statute/i.test(t)) parts.push("A state law, placed on the ballot by the Legislature");
  else if (/\breferendum\b/i.test(t)) parts.push("A vote on whether a law passed by the Legislature takes effect");
  else if (/constitutional amendment|^\s*amendment\b/i.test(t) || /^amendment\b/i.test(identifier ?? "")) parts.push("A change to the state constitution");
  if (/\bbonds?\b/i.test(title ?? "")) parts.push("it authorizes state borrowing through bonds");
  return parts.length ? `${parts.join("; ")}.` : undefined;
}

export function impactAnswers(e: MeasureEnrichment | undefined, title: string | undefined, identifier: string | undefined): Record<ImpactKey, ImpactAnswer> {
  // Nothing researched yet vs. researched but the analysis doesn't address it.
  const missing: ImpactAnswer = e?.impact || e?.fiscalEffect
    ? { kind: "missing", text: "Not addressed in the official analysis." }
    : { kind: "missing", text: "Being researched. We only publish what the official analysis says." };
  const cited = (c?: Cited): ImpactAnswer | undefined => (c ? { kind: "cited", item: c } : undefined);
  const fromTitle = kindFromTitle(title, identifier);
  return {
    taxes: cited(e?.impact?.taxes) ?? missing,
    cost: cited(e?.impact?.cost ?? e?.fiscalEffect) ?? missing,
    money: cited(e?.impact?.money) ?? missing,
    affected: cited(e?.impact?.affected) ?? missing,
    currentLaw: cited(e?.impact?.currentLaw) ?? missing,
    kind: cited(e?.impact?.kind) ?? (fromTitle ? { kind: "title", text: fromTitle } : missing),
  };
}
