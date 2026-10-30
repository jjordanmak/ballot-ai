import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import daly from "../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import type { Contest, ResolvedBallot } from "@/domain/ballot";
import { LIMITED_COPY } from "@/domain/enrichment";
import { withResearch } from "@/lib/ballot/research";
import { toRaces } from "@/lib/ballot/toRaces";
import { CandidateProfile } from "./CandidateProfile";
import { RaceHeader } from "./RaceHeader";

/** The Nov 3 profile and race intro as the page renders them from synthesized research (WRITING_PIPELINE_PLAN.md). */
const src = { url: "https://example.gov/a", title: "Official page", publisher: "Example", official: true, fetchedAt: "2026-10-30T00:00:00Z" };
const s = (text: string, excerpt = `support: ${text}`) => ({ text, refs: [{ source: "s1", excerpt }] });

function render() {
  const base = daly as unknown as ResolvedBallot;
  const gov = base.contests.find((c) => c.kind !== "measure" && /^governor$/i.test(c.title))! as Contest;
  const contests = base.contests.map((c) =>
    c.id === gov.id ? { ...c, durableId: "c-gov", choices: c.choices.map((ch, i) => ({ ...ch, durableId: `k-${i}` })) } : c,
  ) as Contest[];
  const ballot = { ...base, contests } as ResolvedBallot;
  const person = {
    kind: "person",
    v: 3,
    education: [{ degree: "Juris Doctor", institution: "Stanford Law School", quote: "q", source: "s1" }],
    positions: [{ title: "U.S. Secretary of Health and Human Services", startYear: 2021, endYear: 2025, type: "appointed", quote: "q", source: "s1" }],
    sections: {
      inBrief: [s("Spent 4 years as health secretary."), s("His campaign lists protecting Medi-Cal.", "a different excerpt")],
      background: [s("Represented Los Angeles in the U.S. House from 1993 to 2017.")],
      priorities: [s("Protecting Medi-Cal")],
    },
    mightFit: [s("…want the state to keep Medi-Cal coverage")],
    timeline: [{ ...s("Entered the governor's race"), when: "2024" }],
    endorsements: [{ name: "California Faculty Association", category: "Unions", refs: [{ source: "s1", excerpt: "endorsed by the California Faculty Association" }] }],
    limited: ["stances"],
    sources: { s1: src },
  };
  const bundle = withResearch({ election: "2026-11-03", sources: {} }, ballot, [
    { target_id: "k-0", payload: person },
    { target_id: "c-gov", payload: { kind: "race", v: 1, sections: { context: [s("The seat is open."), s("2 candidates are on the ballot.")] }, limited: ["bigPicture"], sources: { s1: src } } },
  ]);
  const race = toRaces(ballot, bundle).races.find((r) => r.general && r.candidates.some((c) => c.general?.inBrief))!;
  const candidate = race.candidates.find((c) => c.general?.inBrief)!;
  return { profile: renderToString(<CandidateProfile candidate={candidate} raceId={race.id} forceOpen />), header: renderToString(<RaceHeader race={race} index={0} />) };
}

const at = (html: string, label: string) => {
  const i = html.indexOf(label);
  expect(i, label).toBeGreaterThan(-1);
  return i;
};

describe("Nov 3 profile (FR-K4, owner 2026-10-30)", () => {
  it("renders the sections in order, without the removed ones", () => {
    const { profile } = render();
    const order = ["In Brief", "Background", "Past Positions", "Key Priorities", "Key Stances", "Endorsements", "Might fit if you…", "Timeline"].map((l) => at(profile, l));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const gone of ["Their platform", "Relevant experience", "Track record on their priorities", "Notable facts", "vote for"]) expect(profile).not.toContain(gone);
  });

  it("cites every sentence, writes Title (years), and says when the sources don't support a section", () => {
    const { profile } = render();
    // 2 In Brief sentences → 2 markers inside the callout, before Background.
    const inBrief = profile.slice(at(profile, "In Brief"), at(profile, "Background"));
    expect((inBrief.match(/role="tooltip"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(profile).toContain("U.S. Secretary of Health and Human Services");
    expect(profile.replace(/<!-- -->/g, "")).toContain("(2021–2025)");
    expect(profile).toContain(LIMITED_COPY);
    expect(profile).toContain("ballot.ai does not recommend or rank candidates.");
    // Might fit is never highlighted.
    const mightFit = profile.slice(at(profile, "Might fit if you…"), at(profile, "Timeline"));
    expect(mightFit).toContain("no-highlights");
    expect(mightFit).not.toContain("<mark");
  });

  it("race intro: one [n] per sentence, labeled as written from sources, limited sections say so", () => {
    const { header } = render();
    const context = header.slice(at(header, "Context"), at(header, "Why it matters"));
    expect(context).toContain("The seat is open.");
    expect((context.match(/role="tooltip"/g) ?? []).length).toBe(2);
    expect(header).toContain("AI summary of the sources below");
    expect(header.slice(at(header, "The big picture"))).toContain(LIMITED_COPY);
  });
});
