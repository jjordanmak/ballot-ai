import { describe, expect, it } from "vitest";
import type { PersonWriting } from "@/lib/ai/schemas";
import {
  apSlips,
  applyParity,
  balanceRace,
  raceImbalance,
  repeats,
  factText,
  hardFactProblem,
  mightFitProblem,
  yearsHeld,
  screenUnit,
  shapeSections,
  textHash,
  unitsOf,
  type PersonPayloadV3,
  type ScreenContext,
  type Unit,
} from "./synthesis";
import type { FetchedDoc } from "./verify";

const doc = (id: string, text: string): FetchedDoc => ({
  id,
  sourceId: `uuid-${id}`,
  text,
  meta: { url: `https://example.gov/${id}`, title: id, publisher: "Example", official: true, fetchedAt: "2026-10-30T00:00:00Z", tier: "official" },
});

const GOV =
  "Governor Gavin Newsom is term-limited. The governor proposes a state budget of $300 billion each year. " +
  "Seven candidates debated on CNN on May 5. Under the top-two primary, the two candidates with the most votes advance. " +
  "Voters named affordability, housing, and homelessness as their top concerns.";
const docs = new Map([["D1", doc("D1", GOV)]]);
const ctx: ScreenContext = { docs, ownNames: ["Governor", "California"] };
const unit = (text: string, excerpt: string, over: Partial<Unit> = {}): Unit => ({ id: "context.0", section: "context", kind: "prose", text, refs: [{ sourceId: "D1", excerpt }], ...over });

describe("hard facts", () => {
  it("keeps a paraphrase whose numbers and names are in its excerpts", () => {
    const s = screenUnit(unit("<mark>7 candidates</mark> took part in a CNN debate on May 5.", "Seven candidates debated on CNN on May 5."), ctx);
    expect(s.problems).toEqual([]);
    expect(s.refs).toEqual([{ source: "uuid-D1", excerpt: "Seven candidates debated on CNN on May 5." }]);
  });

  it("rejects an invented number", () => {
    const s = screenUnit(unit("The governor proposes a $310 billion budget.", "The governor proposes a state budget of $300 billion each year."), ctx);
    expect(s.problems).toContain("number 310 not in its sources");
  });

  it("rejects an invented name", () => {
    const s = screenUnit(unit("Gavin Newsom, a former mayor of Oakland, is term-limited.", "Governor Gavin Newsom is term-limited."), ctx);
    expect(s.problems).toContain('"Oakland" not in its sources');
  });

  it("checks the scale of a dollar amount", () => {
    expect(hardFactProblem("A $300 million budget.", ["a state budget of $300 billion"], [])).toBe("300 million not in its sources");
  });

  it("reads number words, AP titles and month abbreviations as the sources write them", () => {
    expect(factText("Under the top-two primary, twenty-four years")).toBe("under the top-2 primary, 24 years");
    expect(hardFactProblem("Gov. Newsom signed it Nov. 3.", ["Governor Newsom signed it November 3."], [])).toBeNull();
  });

  it("rejects an excerpt that isn't in its document", () => {
    const s = screenUnit(unit("Newsom is term-limited.", "Newsom cannot run again under the state constitution."), ctx);
    expect(s.problems).toEqual(["excerpt not found in its document"]);
  });

  it("accepts ballot names (state, party) given as the item's own names", () => {
    expect(hardFactProblem("Becerra, a Democrat, ran in California.", ["Becerra ran for governor."], ["Democratic", "California"])).toBeNull();
  });
});

describe("wording", () => {
  it("adds the June offenders to the neutrality lint", () => {
    const s = screenUnit(unit("Newsom's party surged in the governor race.", "Governor Gavin Newsom is term-limited."), ctx);
    expect(s.problems.some((p) => p.startsWith("neutrality"))).toBe(true);
  });

  it("In Brief: no comparisons or labels", () => {
    const s = screenUnit(unit("Newsom is an establishment pick unlike his rivals.", "Governor Gavin Newsom is term-limited.", { id: "inBrief.0", section: "inBrief" }), ctx);
    expect(s.problems).toContain("In Brief: comparison, label or horse-race term");
  });

  it("Might fit: verbs, no advice, no party or identity terms", () => {
    expect(mightFitProblem("…want the state to keep Medi-Cal coverage for undocumented adults")).toBeNull();
    expect(mightFitProblem("…support Democrats in Sacramento")).toBe("party name");
    expect(mightFitProblem("…should vote for a Latina leader")).toMatch(/must start|advice/);
    expect(mightFitProblem("…prefer the best candidate")).toBe("advice or ranking");
    expect(mightFitProblem("…want a leader as a mother")).toBe("identity term");
  });

  it("AP slips go to repair, not to the drop list", () => {
    expect(apSlips("Three candidates debated, and 40 percent were undecided.")).toEqual(["write numerals (3, not three)", 'write "%"']);
    expect(apSlips("Voters named affordability, housing and homelessness.")).toEqual(["use the Oxford comma"]);
    expect(apSlips("He lives in Fresno, CA and voted November 3.")).toContain("AP date (Nov. 3, not November 3)");
    const s = screenUnit(unit("Seven candidates debated on CNN on May 5.", "Seven candidates debated on CNN on May 5."), ctx);
    expect(s.problems).toEqual([]);
    expect(s.style).toEqual(["write numerals (3, not three)"]);
  });
});

describe("durations", () => {
  // The writer sees the checked positions as P0, P1…; code writes the number.
  const verified = [
    { startYear: 1993, endYear: 2017 as const },
    { startYear: undefined, endYear: undefined },
  ];
  const years = yearsHeld(verified, new Date("2026-10-30T00:00:00Z"));

  it("code writes the number from the verified years", () => {
    expect(years.get("P0")).toBe(24);
    expect(yearsHeld([{ startYear: 2019, endYear: "present" }], new Date("2026-10-30T00:00:00Z")).get("P0")).toBe(7);
    const s = screenUnit(unit("Newsom spent {{years:P0}} as governor.", "Governor Gavin Newsom is term-limited.", { id: "inBrief.0", section: "inBrief" }), { ...ctx, years });
    expect(s.text).toBe("Newsom spent 24 years as governor.");
    expect(s.problems).toEqual([]);
  });

  it("asks for a repair when the position has no verified years", () => {
    const s = screenUnit(unit("Newsom spent {{years:P1}} as mayor.", "Governor Gavin Newsom is term-limited."), { ...ctx, years });
    expect(s.problems).toContain("no verified years for P1");
  });
});

describe("shapeSections", () => {
  const kept = (section: string, texts: string[], kind: Unit["kind"] = "prose") =>
    texts.map((text, i) => ({ unit: { id: `${section}.${i}`, section, kind, text, refs: [] } as Unit, text, refs: [{ source: "s", excerpt: "e" }], problems: [], style: [] }));

  it("keeps at most 3 highlights per prose section and strips evaluative or measure-name marks", () => {
    const out = shapeSections(
      "measure",
      kept("summary", ["<mark>$5 billion</mark> for <mark>schools</mark>.", "<mark>Proposition 2</mark> raises <mark>a historic sum</mark>.", "<mark>Taxes</mark> and <mark>fees</mark>."]),
      { measureNames: ["Proposition 2"] },
    );
    const text = out.sections.summary!.map((s) => s.text).join(" ");
    expect(text).not.toContain("<mark>Proposition 2</mark>");
    expect(text).not.toContain("<mark>a historic sum</mark>");
    expect((text.match(/<mark>/g) ?? []).length).toBe(3);
  });

  it("a list highlights every item or none", () => {
    const out = shapeSections("person", kept("priorities", ["<mark>Freeze rates</mark>", "Protect Medi-Cal"], "list"));
    expect(out.sections.priorities!.map((s) => s.text)).toEqual(["Freeze rates", "Protect Medi-Cal"]);
  });

  it("Might fit: never highlighted, distinct issues, at most 4; fewer than 4 is limited", () => {
    const mf = ["…want <mark>lower rates</mark>", "…want lower rates too", "…support CARE Court"].map((text, i) => ({
      unit: { id: `mightFit.${i}`, section: "mightFit", kind: "mightFit", text, refs: [], issue: i < 2 ? "Rates" : "Homelessness" } as Unit,
      text,
      refs: [],
      problems: [],
      style: [],
    }));
    const out = shapeSections("person", mf);
    expect(out.mightFit.map((m) => m.text)).toEqual(["…want lower rates", "…support CARE Court"]);
    expect(out.limited).toContain("mightFit");
    expect(out.limited).toContain("background");
  });

  it("never highlights a person's name or a party (round 2: highlights landed on names)", () => {
    const out = shapeSections("race", kept("context", ["<mark>Steve Hilton</mark> and <mark>Democrats</mark> on <mark>$300 billion</mark>."]), { names: ["Steve Hilton", "Hilton"] });
    expect(out.sections.context![0].text).toBe("Steve Hilton and Democrats on <mark>$300 billion</mark>.");
  });

  it("judges get background and timeline only", () => {
    expect(shapeSections("person", [], { judge: true }).limited).toEqual(["background", "timeline"]);
  });
});

describe("units and parity", () => {
  it("numbers every unit so repairs and reviewers can refer to it", () => {
    const data: PersonWriting = {
      sections: [
        { section: "background", sentences: [{ text: "a", refs: [] }, { text: "b", refs: [] }] },
        { section: "background", sentences: [{ text: "duplicate section", refs: [] }] },
      ],
      mightFit: [{ issue: "x", text: "…want x", refs: [] }],
      timeline: [{ when: "2017", event: "e", refs: [] }],
      endorsements: [{ name: "n", category: "Unions", refs: [] }],
    };
    expect(unitsOf("person", data).map((u) => u.id)).toEqual(["background.0", "background.1", "mightFit.0", "timeline.0", "endorsements.0"]);
  });

  it("applies a rewrite only to the sentence it was written for", () => {
    const p: PersonPayloadV3 = {
      kind: "person",
      v: 3,
      education: [],
      positions: [],
      sections: { background: [{ text: "Gov. Brown appointed him.", refs: [] }, { text: "Second.", refs: [] }] },
      mightFit: [],
      timeline: [],
      endorsements: [],
      limited: [],
      sources: {},
    };
    const parity = {
      rewrites: [
        { target: "c1", unit: "background.0", fromHash: textHash("Gov. Brown appointed him."), text: "Gov. Jerry Brown appointed him." },
        { target: "c1", unit: "background.1", fromHash: textHash("an older sentence"), text: "Should not apply." },
      ],
      unresolved: [],
      missing: [],
      thin: [],
    };
    expect(applyParity(p, "c1", parity).sections.background!.map((s) => s.text)).toEqual(["Gov. Jerry Brown appointed him.", "Second."]);
    expect(applyParity(p, "c2", parity)).toBe(p);
    expect(applyParity(p, "c1", { ...parity, rewrites: [], unresolved: [{ target: "c1", unit: "background.1", reason: "x" }] }).sections.background!.map((s) => s.text)).toEqual([
      "Gov. Brown appointed him.",
    ]);
  });
});

describe("race intro balance and repetition (round 3, owner 2026-10-30)", () => {
  const u = (id: string, text: string, kind = "prose") => ({ unit: { id, section: id.split(".")[0], kind }, text });
  const field = ["Xavier Becerra", "Steve Hilton"];

  it("a section names every candidate the same number of times, or none", () => {
    const list = [
      u("bigPicture.0", "Hilton has campaigned on gas prices."),
      u("bigPicture.1", "Hilton won the most votes in June."),
      u("bigPicture.2", "Becerra and Hilton debated on Oct. 8."),
      u("context.0", "Becerra spoke in Fresno."),
      u("context.1", "Hilton spoke in Sacramento."),
      u("whyItMatters.0", "The governor signs the budget."),
    ];
    expect(raceImbalance(list, field)).toEqual([{ section: "bigPicture", over: ["Steve Hilton"], under: ["Xavier Becerra"], units: ["bigPicture.0", "bigPicture.1"] }]);
    // A one-candidate race has nothing to balance.
    expect(raceImbalance(list, ["Steve Hilton"])).toEqual([]);
  });

  it("the last resort drops the latest extra mention until the section balances", () => {
    const list = [u("bigPicture.0", "Hilton has campaigned on gas prices."), u("bigPicture.1", "Hilton won the most votes in June."), u("bigPicture.2", "Becerra has campaigned on Medi-Cal.")];
    const out = balanceRace(list, field);
    expect(out.kept.map((x) => x.unit.id)).toEqual(["bigPicture.0", "bigPicture.2"]);
    expect(out.dropped[0].reason).toBe("unbalanced: bigPicture names Steve Hilton more than Xavier Becerra");
  });

  it("finds a sentence that says what an earlier one says, in any section", () => {
    const list = [
      u("inBrief.0", "Becerra represented Los Angeles in the U.S. House from 1993 to 2017."),
      u("background.0", "From 1993 to 2017, Becerra represented Los Angeles in the U.S. House."),
      u("background.1", "Gov. Jerry Brown appointed him attorney general in 2017."),
      u("timeline.0", "Represented Los Angeles in the U.S. House from 1993 to 2017", "timeline"),
      // A priority restates the platform In Brief summarizes, by design (round 3 dropped these).
      u("inBrief.1", "His campaign lists restoring high academic standards in reading, writing, and math."),
      u("priorities.0", "Restoring high academic standards in reading, writing, and math", "list"),
    ];
    expect([...repeats(list)]).toEqual([["background.0", "inBrief.0"]]);
  });
});

describe("cited vs uncited (owner, 2026-10-30)", () => {
  const race: ScreenContext = { docs, ownNames: ["Governor", "California"], kind: "race", personNames: ["Rob Bonta", "Bonta"], ballotFacts: "Governor (California) is on the Nov. 3, 2026 general election ballot." };
  const prose = (text: string, refs: Unit["refs"] = [], over: Partial<Unit> = {}): Unit => ({ id: "whyItMatters.0", section: "whyItMatters", kind: "prose", text, refs, ...over });

  it("parties, institutions and months aren't names that need a source", () => {
    expect(hardFactProblem("Rob Bonta, the Democratic incumbent, faces Republican Michael E. Gates in November.", ["Rob Bonta and Michael E. Gates are on the ballot."], [])).toBeNull();
    expect(hardFactProblem("The House and the State Senate passed it.", ["it passed"], [])).toBeNull();
    // Real names still need one.
    expect(hardFactProblem("Rob Bonta filed suit with CalMatters.", ["Rob Bonta filed suit."], [])).toMatch(/^"CalMatters/);
  });

  it("an explanatory sentence in a race intro may stand without a source", () => {
    const s = screenUnit(prose("The governor signs or vetoes every bill the Legislature passes, which shapes the state budget."), race);
    expect(s.problems).toEqual([]);
    expect(s.uncited).toBe("general");
    expect(s.refs).toEqual([]);
  });

  it("but not a new fact or a claim about a candidate", () => {
    expect(screenUnit(prose("The governor proposes a $300 billion budget."), race).problems).toEqual(["needs a source: number 300 not in its sources"]);
    expect(screenUnit(prose("Bonta wants to expand the program."), race).problems).toEqual(["needs a source: about Bonta"]);
    expect(screenUnit(prose("The program was created by Newsom."), race).problems[0]).toMatch(/^needs a source: "Newsom/);
  });

  it("a profile sentence may state ballot data without a source; anything else about the person needs one", () => {
    const person: ScreenContext = { docs, ownNames: ["Jesus Silva", "Jesus", "Silva"], kind: "person", years: new Map(), ballotFacts: "Jesus Silva is a candidate for Trustee Area 6. Ballot designation: Teacher/Business Owner." };
    const ok = screenUnit(prose("Silva's ballot designation is Teacher/Business Owner.", [], { id: "background.0", section: "background" }), person);
    expect(ok.problems).toEqual([]);
    expect(ok.uncited).toBe("ballot");
    const timeline = screenUnit({ id: "timeline.0", section: "timeline", kind: "timeline", text: "Elected to the board", refs: [], when: "2018" }, person);
    expect(timeline.problems).toEqual(["needs a source: positions, claims and facts about a candidate are always cited"]);
  });

  it("measures may explain terms without a source", () => {
    const s = screenUnit(prose("A bond is money the state borrows and repays with interest.", [], { id: "kind.0", section: "kind" }), { docs, ownNames: [], kind: "measure", ballotFacts: "" });
    expect(s.uncited).toBe("general");
    expect(s.problems).toEqual([]);
  });
});
