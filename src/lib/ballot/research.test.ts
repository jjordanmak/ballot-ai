import { describe, expect, it } from "vitest";
import daly from "../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import type { EnrichmentBundle } from "@/domain/enrichment";
import { getEnrichment } from "./enrichment";
import { candidateKey, contestKey, measureKey } from "./enrichmentKeys";
import compareSet from "@/data/research/compare-set.json";
import { buildTargets, type ContestRow } from "@/lib/research/targets";
import { officeTargetId, researchTargetIds, withResearch } from "./research";
import { toRaces } from "./toRaces";

const src = { url: "https://voterguide.example.gov/a", title: "Analysis", publisher: "Secretary of State", official: true, fetchedAt: "2026-10-29T06:00:00Z" };

describe("withResearch", () => {
  const ballot = daly as unknown as ResolvedBallot;
  const prop = ballot.contests.find((c) => c.kind === "measure")! as Contest;

  it("fills only what curated data lacks, labels it, and cites the fetched page", () => {
    const withIds = { ...ballot, contests: ballot.contests.map((c) => (c.id === prop.id ? { ...c, durableId: "m-1" } : c)) } as ResolvedBallot;
    const bundle = getEnrichment("2026-11-03");
    const curated = bundle.measures?.[measureKey(prop)];
    const out = withResearch(bundle, withIds, [
      {
        target_id: "m-1",
        payload: {
          kind: "measure",
          answers: {
            summary: { text: "AI summary.", quote: "q", source: "s1" },
            taxes: { text: "Does not change taxes.", quote: "q", source: "s1" },
          },
          sources: { s1: src },
        },
      },
    ]);
    const merged = out.measures![measureKey(prop)];
    expect(merged.summary).toEqual(curated?.summary ?? { text: "AI summary.", sources: ["ai-s1"], quotes: ["q"] });
    // The quote travels with the fact, for the [n] popover.
    expect(merged.impact?.taxes).toEqual({ text: "Does not change taxes.", sources: ["ai-s1"], quotes: ["q"] });
    expect(merged.aiFields).toContain("impact.taxes");
    expect(out.sources["ai-s1"]).toEqual({ title: "Analysis", publisher: "Secretary of State", url: src.url, official: true, accessed: "2026-10-29" });

    // The card cites it.
    const mv = toRaces(withIds, out).measures.find((m) => m.contest.id === prop.id)!;
    expect(Object.keys(mv.sourceDocs)).toContain("ai-s1");
  });

  it("works for a candidate outside California", () => {
    const c: Contest = {
      id: "oh-1",
      kind: "candidate",
      contestType: "general",
      title: "State Representative, District 41",
      category: "state_legislature",
      division: { name: "41st State House District", ocdId: "ocd-division/country:us/state:oh/sldl:41" },
      choices: [{ id: "x", durableId: "k-1", ballotName: "ANN BEE", urls: {} }],
    } as unknown as Contest;
    const bundle: EnrichmentBundle = { election: "2026-11-03", sources: {} };
    const out = withResearch(bundle, { contests: [c] }, [
      {
        target_id: "k-1",
        payload: {
          kind: "person",
          v: 2,
          education: [{ degree: "Bachelor of Science", institution: "Ohio State University", year: 2001, quote: "q1", source: "s2" }],
          positions: [
            { title: "State Representative", organization: "Ohio House of Representatives", startYear: 2021, endYear: "present", type: "elected", committees: ["Finance Committee"], quote: "q2", source: "s2" },
            { title: "Teacher", organization: "Columbus City Schools", startYear: 2005, endYear: 2020, type: "job", quote: "q3", source: "s2" },
          ],
          platform: [],
          bio: [{ text: "Ann Bee is a State Representative and was a teacher.", facts: ["P0", "P1"] }],
          sources: { s2: src },
        },
      },
    ]);
    expect(out.candidates![candidateKey(c, c.choices[0])]).toMatchObject({
      currentRole: { text: "State Representative, Ohio House of Representatives", sources: ["ai-s2"], quotes: ["q2"] },
      bio: [{ text: "Ann Bee is a State Representative and was a teacher.", sources: ["ai-s2"], quotes: ["q2"] }],
      education: [{ text: "B.S., Ohio State University · 2001", sources: ["ai-s2"], quotes: ["q1"] }],
      pastPositions: [
        { title: "State Representative, Ohio House of Representatives", years: "2021–present", committees: ["Finance Committee"], sources: ["ai-s2"], quotes: ["q2"] },
        { title: "Teacher, Columbus City Schools", years: "2005–2020" },
      ],
      aiFields: ["currentRole", "bio", "education", "pastPositions"],
    });
    expect(researchTargetIds({ contests: [c] })).toEqual(["k-1", "oh|state representative|ohio"]);
  });

  it("ignores rows that aren't research payloads", () => {
    const bundle = getEnrichment("2026-11-03");
    expect(withResearch(bundle, ballot, [{ target_id: "x", payload: { nope: true } }]).measures).toEqual(bundle.measures);
  });

  it("merges what an office does into the race, labeled, under the same key the job uses", () => {
    const gov = ballot.contests.find((c) => c.kind !== "measure" && /^governor$/i.test(c.title))! as Contest;
    const id = officeTargetId(gov, ballot.location?.state);
    expect(id).toBe("ca|governor|california");
    const out = withResearch({ election: "2026-11-03", sources: {} }, ballot, [
      { target_id: id, payload: { kind: "office", answers: { duties: { text: "Runs the executive branch.", quote: "q", source: "s3" }, term: { text: "4 years", quote: "q", source: "s3" } }, sources: { s3: src } } },
    ]);
    expect(out.contests![contestKey(gov)]).toMatchObject({ office: { duties: { text: "Runs the executive branch.", sources: ["ai-s3"] }, term: { text: "4 years" } }, aiFields: ["office.duties", "office.term"] });
  });

  it("the comparison set's offices are offices on the Daly City ballot, keyed the same way by the job and the page", () => {
    const pageIds = new Set(researchTargetIds(ballot));
    const rows: ContestRow[] = ballot.contests
      .filter((c) => c.kind !== "measure")
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        contest_type: c.contestType ?? null,
        title: c.title,
        division_key: c.division.ocdId ?? "",
        divisions: { name: c.division.name ?? "", state: "CA", scope: c.division.scope ?? null },
        contest_candidates: [],
      }));
    const jobIds = new Set(buildTargets(rows).filter((t) => t.kind === "office").map((t) => t.targetId));
    for (const t of compareSet.targets.filter((x) => x.kind === "office")) {
      const id = t.key.slice("contest:".length, -":office".length);
      expect(pageIds.has(id), id).toBe(true);
      expect(jobIds.has(id), id).toBe(true);
    }
  });
});
