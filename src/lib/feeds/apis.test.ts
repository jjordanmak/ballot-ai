import { describe, expect, it } from "vitest";
import { gdeltRaceQuery, gdeltUrl, isGdeltThrottle, isOpinionKind, nytTagged, nytUrl, parseGdelt, namedInHeadline, parseNyt, raceQueries, tidyGdeltTitle } from "./apis";
import { candidateQueries, type TrackedContest } from "./match";

const CONTESTS: TrackedContest[] = [
  {
    id: "gov",
    kind: "candidate",
    title: "Governor",
    divisionName: "California",
    state: "CA",
    stateLevel: true,
    candidates: [
      { id: "becerra", names: ["Xavier Becerra", "XAVIER BECERRA"] },
      { id: "hilton", names: ["STEVE HILTON"] },
    ],
  },
  {
    id: "tx-ag",
    kind: "candidate",
    title: "Attorney General",
    divisionName: "Texas",
    state: "TX",
    stateLevel: true,
    candidates: [
      { id: "alvarado", names: ["Rosalind M. Alvarado"] },
      { id: "brennan", names: ["THOMAS (TOM) BRENNAN JR."] },
    ],
  },
  {
    id: "council",
    kind: "candidate",
    title: "Member, City Council District 2",
    divisionName: "Placentia",
    state: "CA",
    candidates: [{ id: "kim", names: ["Jane Kim"] }, { id: "lee", names: ["Ann Lee"] }],
  },
  {
    id: "ohio-issue-1",
    kind: "measure",
    title: "Issue 1",
    divisionName: "Ohio",
    state: "OH",
    stateLevel: true,
    candidates: [],
  },
  {
    id: "appeals",
    kind: "candidate",
    title: "Associate Justice, Court of Appeal, Fourth District, Division Three",
    divisionName: "Fourth Appellate District",
    state: "CA",
    stateLevel: true,
    candidates: [{ id: "motoike", names: ["Joanne Motoike"] }],
  },
];
const people = candidateQueries(CONTESTS);
const by = (id: string) => people.find((p) => p.candidateId === id)!;

describe("candidateQueries", () => {
  it("writes each name as people do, with words that identify the race", () => {
    expect(by("becerra")).toMatchObject({ name: "Xavier Becerra", first: "Xavier", surname: "Becerra", contestId: "gov" });
    expect(by("becerra").context).toEqual(expect.arrayContaining(["governor", "california", "hilton"]));
    // All-caps ballot names, nicknames, initials and suffixes (a non-CA race).
    expect(by("brennan")).toMatchObject({ name: "Tom Brennan", surname: "Brennan", state: "TX" });
    expect(by("alvarado")).toMatchObject({ name: "Rosalind Alvarado" });
    expect(by("alvarado").context).toEqual(expect.arrayContaining(["attorney general", "texas", "brennan"]));
  });
});

describe("GDELT", () => {
  const races = raceQueries(CONTESTS);
  const race = (id: string) => races.find((r) => r.contestId === id)!;

  it("asks once per race: any candidate's full name, a word identifying the race, the office twice, and only our outlets", () => {
    const q = gdeltRaceQuery(race("gov"), ["politico.com", "wsj.com"]);
    expect(q).toContain('("Xavier Becerra" OR "Steve Hilton")');
    expect(q).toMatch(/\(governor OR .*california/);
    expect(q).toContain('repeat2:"governor"');
    expect(q).toContain("(domainis:politico.com OR domainis:wsj.com)");
    expect(gdeltUrl("x", "3d")).toContain("mode=artlist");
  });

  it("gives a local race its own place, never just the state, and a statewide measure its number and state (non-CA)", () => {
    expect(race("council").context).toContain("placentia");
    expect(race("council").context).not.toContain("california");
    expect(race("ohio-issue-1")).toMatchObject({ phrases: ["issue 1"], context: ["ohio"], people: [] });
    expect(race("tx-ag").phrases).toEqual(["Rosalind Alvarado", "Tom Brennan"]);
  });

  it("ranks statewide races first, then other state-level ones, then local", () => {
    expect(race("gov").tier).toBe(0);
    expect(race("tx-ag").tier).toBe(0);
    expect(race("appeals").tier).toBe(1);
    expect(race("council").tier).toBe(2);
    expect(by("motoike").judicial).toBe(true);
    expect(by("becerra").judicial).toBe(false);
  });

  it("attaches a story to a candidate only when its headline names them", () => {
    expect(namedInHeadline("Becerra pitches insurance freeze", race("gov"))).toEqual(["becerra"]);
    expect(namedInHeadline("Becerra and Hilton spar over gas prices", race("gov"))).toEqual(["becerra", "hilton"]);
    expect(namedInHeadline("California's governor race tightens", race("gov"))).toEqual([]);
    // Whole words only: "Hiltons" is not Hilton.
    expect(namedInHeadline("The Hiltons sell a hotel", race("gov"))).toEqual([]);
  });

  it("parses English results and puts tokenized punctuation back", () => {
    const body = JSON.stringify({
      articles: [
        { url: "https://www.politico.com/a", title: "Prop . 40 is about 0 . 07 % of their wealth , critics say", seendate: "20261029T081500Z", domain: "politico.com", language: "English" },
        { url: "https://elpais.com/b", title: "Otra", seendate: "20261029T081500Z", domain: "elpais.com", language: "Spanish" },
      ],
    });
    expect(parseGdelt(body)).toEqual([
      { title: "Prop. 40 is about 0.07% of their wealth, critics say", link: "https://www.politico.com/a", published: new Date("2026-10-29T08:15:00Z"), domain: "politico.com" },
    ]);
    expect(parseGdelt("Please limit requests to one every 5 seconds")).toEqual([]);
    expect(isGdeltThrottle("Please limit requests to one every 5 seconds or contact …")).toBe(true);
    expect(tidyGdeltTitle("Newsom ' s plan ( draft )")).toBe("Newsom's plan (draft)");
  });
});

describe("NYT Article Search", () => {
  const body = JSON.stringify({
    response: {
      docs: [
        {
          web_url: "https://www.nytimes.com/2026/10/29/us/politics/becerra.html",
          headline: { main: "On the Trail With Becerra" },
          abstract: "The former health secretary campaigned in Fresno.",
          lead_paragraph: "Xavier Becerra spent the day in the Central Valley.",
          pub_date: "2026-10-29T12:00:00+0000",
          type_of_material: "News",
          keywords: [{ name: "persons", value: "Becerra, Xavier" }, { name: "glocations", value: "California" }],
        },
        { web_url: "https://www.nytimes.com/2026/10/29/opinion/x.html", headline: { main: "Vote Smart" }, pub_date: "2026-10-29T12:00:00+0000", type_of_material: "Op-Ed" },
      ],
    },
  });

  it("parses headline, summary, lead paragraph and tagged people", () => {
    const [a, b] = parseNyt(body);
    expect(a).toMatchObject({ title: "On the Trail With Becerra", summary: "The former health secretary campaigned in Fresno.", persons: ["Becerra, Xavier"], kind: "News" });
    expect(a.published?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(isOpinionKind(b.kind)).toBe(true);
    expect(parseNyt("not json")).toEqual([]);
  });

  it("trusts the NYT's own person tags, matching first and last name", () => {
    expect(nytTagged(["Becerra, Xavier"], by("becerra"))).toBe(true);
    expect(nytTagged(["Becerra, Xavier (1958- )"], by("becerra"))).toBe(true);
    expect(nytTagged(["Becerra, Maria"], by("becerra"))).toBe(false);
    expect(nytTagged(undefined, by("becerra"))).toBe(false);
  });

  it("builds a dated, newest-first query", () => {
    const u = new URL(nytUrl(by("becerra"), "k", new Date("2026-10-27T00:00:00Z")));
    expect(u.searchParams.get("q")).toBe('"Xavier Becerra"');
    expect(u.searchParams.get("begin_date")).toBe("20261027");
    expect(u.searchParams.get("sort")).toBe("newest");
  });
});
