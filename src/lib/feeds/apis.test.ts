import { describe, expect, it } from "vitest";
import { gdeltQuery, gdeltUrl, isGdeltThrottle, isOpinionKind, nytTagged, nytUrl, parseGdelt, parseNyt, tidyGdeltTitle } from "./apis";
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
  it("asks for the full name, a word identifying the race, the last name twice, and only our outlets", () => {
    const q = gdeltQuery(by("becerra"), ["politico.com", "wsj.com"]);
    expect(q).toContain('"Xavier Becerra"');
    expect(q).toMatch(/\(governor OR .*california/);
    expect(q).toContain('repeat2:"becerra"');
    expect(q).toContain("(domainis:politico.com OR domainis:wsj.com)");
    // A local race needs its own place, not just the state.
    expect(gdeltQuery(by("kim"), ["ocregister.com"])).not.toMatch(/\bcalifornia\b/);
    expect(gdeltQuery(by("kim"), ["ocregister.com"])).toContain("placentia");
    expect(gdeltUrl("x", "3d")).toContain("mode=artlist");
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
