/**
 * Adapter: address-resolved ballot (+ researched enrichment) → the `Race`
 * shape the existing ballot UI components render. Official facts (office,
 * district, vote-for-N, ballot names, party) come only from the resolved
 * ballot; enrichment adds cited context and profiles.
 */
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { CandidateEnrichment, EnrichmentBundle, MeasureEnrichment, SourceDoc } from "@/domain/enrichment";
import type { Candidate, Party, Race } from "@/data/types";
import { candidateKey, contestKey, measureKey } from "./enrichmentKeys";

export interface MeasureView {
  contest: Contest;
  enrichment?: MeasureEnrichment;
  sourceDocs: Record<string, SourceDoc>;
}

export function toRaces(ballot: ResolvedBallot, bundle: EnrichmentBundle): { races: Race[]; measures: MeasureView[] } {
  const races: Race[] = [];
  const measures: MeasureView[] = [];
  for (const c of ballot.contests) {
    if (c.kind === "measure") {
      const me = bundle.measures?.[measureKey(c)];
      measures.push({
        contest: c,
        enrichment: me,
        sourceDocs: pickSources(bundle.sources, citedIds(me?.summary, me?.yesMeans, me?.noMeans, me?.fiscalEffect)),
      });
      continue;
    }
    races.push(contestToRace(c, bundle));
  }
  return { races, measures };
}

function contestToRace(c: Contest, bundle: EnrichmentBundle): Race {
  const e = bundle.contests?.[contestKey(c)];
  const docs = pickSources(bundle.sources, [
    ...citedIds(e?.formatExplainer, e?.context, e?.whyItMatters, e?.whatsAtStake, e?.bigPicture, e?.polling?.summary),
    ...(e?.polling?.poll?.sources ?? []),
  ]);
  const officialSource = c.sources.find((s) => s.official);
  const candidates = c.choices.map((ch) => {
    const ce = bundle.candidates?.[candidateKey(c, ch)];
    const poll = e?.polling?.poll?.results.find((r) => sameName(r.name, ce?.displayName ?? ch.ballotName));
    const candidate: Candidate = {
      id: ch.id,
      name: ce?.displayName ?? ch.ballotName,
      ballotName: ch.ballotName,
      party: toParty(ch.party),
      headshot: ce?.headshot?.url,
      major: true,
      pollingStatus: "",
      pollingPct: poll?.pct,
      currentRole: ce?.currentRole?.text ?? "",
      pastRoles: [],
      background: "",
      priorities: [],
      stances: [],
      strengths: [],
      criticisms: [],
      history: [],
      endorsements: [],
      voteForIf: [],
      bottomLine: "",
      issues: Object.fromEntries(
        Object.entries(ce?.issues ?? {}).map(([k, v]) => [k, { stance: v.text, source: sourceLabel(bundle.sources, v.sources[0]) }]),
      ),
      general: {
        ...(ce ?? {}),
        campaignUrl: ch.urls.campaign,
        sourceDocs: pickSources(bundle.sources, candidateSourceIds(ce)),
      },
    };
    return candidate;
  });

  const voteFor = c.voteFor;
  const meta: Race["meta"] = [
    ...(voteFor ? [{ label: "Vote for", value: String(voteFor) }] : []),
    ...(c.numberElected && c.numberElected > 1 ? [{ label: "Seats", value: String(c.numberElected) }] : []),
    { label: "District", value: c.division.name || "—" },
    ...(e?.meta ?? []),
    ...(officialSource ? [{ label: "Ballot data", value: `${officialSource.name} (official)` }] : []),
  ].slice(0, 8);

  const poll = e?.polling?.poll;
  return {
    id: c.id,
    office: c.title,
    jurisdiction: c.division.name || "",
    format: formatLabel(c),
    formatExplainer: e?.formatExplainer?.text ?? "",
    meta,
    unopposed: c.choices.length === 1 && c.contestType !== "retention",
    intro: {
      context: e?.context?.text ?? "",
      whyItMatters: e?.whyItMatters?.text ?? "",
      whatsAtStake: e?.whatsAtStake?.text ?? "",
      bigPicture: e?.bigPicture?.text ?? "",
      polling: e?.polling?.summary?.text ?? "",
      pollingSourceLabel: poll ? [poll.pollster, poll.dates, poll.sampleSize ? `n=${poll.sampleSize}` : ""].filter(Boolean).join(" · ") : undefined,
      pollingSourceUrl: poll ? bundle.sources[poll.sources[0]]?.url : undefined,
      pollingFootnote: poll?.undecidedPct != null ? `Undecided ${poll.undecidedPct}%` : undefined,
    },
    issues: e?.issues ?? [],
    candidates,
    general: {
      enrichment: e,
      sourceDocs: docs,
      officialSources: c.sources,
      voteFor: c.voteFor,
      numberElected: c.numberElected,
    },
  };
}

function formatLabel(c: Contest): string {
  if (c.contestType === "retention") return "Retention · Yes / No";
  const parts = [c.contestType === "general" ? "General election" : c.rawType ?? "Contest"];
  if (c.voteFor) parts.push(c.voteFor === 1 ? "Vote for 1" : `Vote for up to ${c.voteFor}`);
  if (c.special) parts.push("Special election");
  return parts.join(" · ");
}

/** Map a provider party string to the UI's Party union; unlisted → Nonpartisan/NPP. */
function toParty(p: string | undefined): Party {
  const n = (p ?? "").toLowerCase();
  if (!n) return "Nonpartisan";
  if (/democrat/.test(n)) return "Democratic";
  if (/republican/.test(n)) return "Republican";
  if (/\bgreen\b/.test(n)) return "Green";
  if (/libertarian/.test(n)) return "Libertarian";
  if (/peace and freedom/.test(n)) return "Peace and Freedom";
  if (/american independent/.test(n)) return "American Independent";
  if (/no party|npp|decline/.test(n)) return "No Party Preference";
  if (/nonpartisan/.test(n)) return "Nonpartisan";
  return "Independent";
}

function sameName(a: string, b: string): boolean {
  const last = (s: string) => s.trim().split(/\s+/).pop()!.toLowerCase();
  return last(a) === last(b);
}

function citedIds(...items: ({ sources: string[] } | undefined)[]): string[] {
  return items.flatMap((i) => i?.sources ?? []);
}

function candidateSourceIds(ce: CandidateEnrichment | undefined): string[] {
  if (!ce) return [];
  const ids: string[] = [];
  const add = (x?: { sources: string[] } | { sources: string[] }[]) => {
    if (!x) return;
    for (const i of Array.isArray(x) ? x : [x]) ids.push(...i.sources);
  };
  add(ce.currentRole);
  add(ce.platform);
  add(ce.background);
  add(ce.pastPositions);
  add(ce.experience);
  ce.trackRecord?.forEach((t) => add(t.items));
  add(ce.priorities);
  add(ce.stances);
  add(Object.values(ce.issues ?? {}));
  add(ce.timeline);
  add(ce.notableFacts);
  add(ce.endorsements);
  add(ce.funding);
  add(ce.headshot);
  return ids;
}

function pickSources(all: Record<string, SourceDoc>, ids: string[]): Record<string, SourceDoc> {
  return Object.fromEntries([...new Set(ids)].filter((id) => all[id]).map((id) => [id, all[id]]));
}

function sourceLabel(all: Record<string, SourceDoc>, id: string | undefined): string | undefined {
  return id ? all[id]?.publisher : undefined;
}

