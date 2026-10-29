import { describe, expect, it } from "vitest";
import { canonicalUrl } from "./canonical";
import { buildMatcher, nameVariants, placeTerm, type TrackedContest } from "./match";
import { parseFeed } from "./parse";

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
      { id: "hilton", names: ["Steve Hilton", "STEVE HILTON"] },
    ],
  },
  {
    id: "sos",
    kind: "candidate",
    title: "Secretary of State",
    divisionName: "California",
    state: "CA",
    stateLevel: true,
    candidates: [
      { id: "weber", names: ["Shirley N. Weber"] },
      { id: "wagner", names: ["Donald P. (Don) Wagner"] },
    ],
  },
  {
    id: "ins",
    kind: "candidate",
    title: "Insurance Commissioner",
    divisionName: "California",
    state: "CA",
    stateLevel: true,
    candidates: [
      { id: "allen", names: ["Ben Allen"] },
      { id: "kim", names: ["Jane Kim"] },
    ],
  },
  { id: "prop1", kind: "measure", title: "Proposition 1", divisionName: "California", state: "CA", stateLevel: true, candidates: [] },
  { id: "measm", kind: "measure", title: "Measure M", divisionName: "Jefferson Union High School District", state: "CA", candidates: [] },
  { id: "measa", kind: "measure", title: "Measure A", divisionName: "County of San Mateo", state: "CA", candidates: [] },
  {
    id: "council",
    kind: "candidate",
    title: "City Council Member",
    divisionName: "City of Daly City",
    state: "CA",
    candidates: [
      { id: "johnson", names: ["Michael Johnson"] },
      { id: "lee", names: ["Ann Lee"] },
    ],
  },
];

const match = buildMatcher(CONTESTS);
const national = { scope: "national" as const };

describe("feed matcher", () => {
  it("derives name variants, including nicknames and dropped middle initials", () => {
    expect(nameVariants("Donald P. (Don) Wagner")).toEqual(expect.arrayContaining(["donald wagner", "don wagner", "donald p wagner"]));
    expect(nameVariants("Shirley N. Weber")).toEqual(expect.arrayContaining(["shirley weber", "shirley n weber"]));
  });

  it("reduces division names to the place an article would mention", () => {
    expect(placeTerm("County of San Mateo")).toBe("san mateo");
    expect(placeTerm("Jefferson Union High School District")).toBe("jefferson union");
    expect(placeTerm("California")).toBe("california");
  });

  it("matches a candidate named with office context", () => {
    expect(match("Becerra and Hilton spar over housing in governor's debate", "Xavier Becerra said…", national)).toMatchObject({
      contestIds: ["gov"],
      candidateIds: ["becerra"],
    });
    expect(match("Don Wagner launches ad", "The secretary of state candidate…", national)?.candidateIds).toEqual(["wagner"]);
  });

  it("needs two pieces of context for short, collision-prone names", () => {
    expect(match("Jane Kim opens new restaurant", "A chef named Jane Kim…", national)).toBeNull();
    expect(match("Jane Kim wins endorsement", "Jane Kim, running for insurance commissioner…", national)?.candidateIds).toEqual(["kim"]);
  });

  it("ignores a bare name without context", () => {
    expect(match("Steve Hilton interview", "A conversation about his new book.", national)).toBeNull();
  });

  it("matches props and local measures only with their jurisdiction", () => {
    expect(match("Prop 1 explained", "What California's housing bond would do", national)?.contestIds).toEqual(["prop1"]);
    expect(match("Prop 1 explained", "What Texas voters will decide", national)).toBeNull();
    expect(match("Measure M parcel tax debate", "Jefferson Union trustees defend the tax", national)?.contestIds).toEqual(["measm"]);
    expect(match("Measure M parcel tax debate", "Los Angeles County officials…", national)).toBeNull();
    // A San Mateo outlet implies its own place.
    expect(match("Measure M parcel tax debate", "Jefferson Union district…", { scope: "local", state: "CA", jurisdictions: ["San Mateo"] })?.contestIds).toEqual(["measm"]);
  });

  it("counts the outlet's state as context for state outlets", () => {
    const ca = { scope: "state" as const, state: "CA" };
    expect(match("Rob Bonta files suit", "The attorney general…", ca)).toBeNull(); // not tracked
    expect(match("Becerra outlines plan", "Xavier Becerra released…", ca)).toBeNull(); // implied context never stands alone
    expect(match("Becerra outlines plan", "The candidate Xavier Becerra released…", ca)?.candidateIds).toEqual(["becerra"]);
    expect(match("Prop 1 explained", "What the housing bond would do", ca)?.contestIds).toEqual(["prop1"]);
  });

  it("doesn't let a state outlet's own state satisfy local contests", () => {
    const ca = { scope: "state" as const, state: "CA" };
    expect(match("Measure A passes", "Los Angeles voters approved the sales tax", ca)).toBeNull(); // someone else's Measure A
    expect(match("Measure A debate", "San Mateo County supervisors weigh the tax", ca)?.contestIds).toEqual(["measa"]);
    expect(match("Michael Johnson wins award", "The candidate Michael Johnson of Fresno…", ca)).toBeNull(); // local: needs its own place
    expect(match("Michael Johnson, Ann Lee spar", "Daly City council candidates Michael Johnson and Ann Lee…", ca)?.candidateIds).toEqual(
      expect.arrayContaining(["johnson", "lee"]),
    );
  });

  it("never matches another state's contests from a state or local outlet", () => {
    const tx = { scope: "state" as const, state: "TX" };
    expect(match("Becerra and Hilton spar in governor's debate", "Xavier Becerra said…", tx)).toBeNull();
    expect(match("Prop 1 explained", "What California's housing bond would do", tx)).toBeNull();
    expect(match("Measure M parcel tax debate", "Jefferson Union trustees…", { scope: "local", state: "NY", jurisdictions: ["Queens"] })).toBeNull();
    // A state outlet without a state matches nothing rather than everything.
    expect(match("Becerra and Hilton spar in governor's debate", "Xavier Becerra said…", { scope: "state" })).toBeNull();
  });
});

describe("canonicalUrl", () => {
  it("drops tracking params, fragments and trailing slashes", () => {
    expect(canonicalUrl("https://CalMatters.org/politics/2026/10/story/?utm_source=rss&utm_medium=feed#comments")).toBe(
      "https://calmatters.org/politics/2026/10/story",
    );
    expect(canonicalUrl("https://example.com/a?id=5&utm_campaign=x")).toBe("https://example.com/a?id=5");
    expect(canonicalUrl("javascript:alert(1)")).toBeUndefined();
    expect(canonicalUrl("not a url")).toBeUndefined();
  });
});

describe("parseFeed", () => {
  it("reads RSS items with HTML stripped", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>
      <item><title><![CDATA[Becerra &amp; Hilton debate]]></title><link>https://example.com/a?utm_source=x</link>
      <description><![CDATA[<p>The <b>governor</b> race&#8230;</p>]]></description><pubDate>Wed, 28 Oct 2026 18:00:00 GMT</pubDate>
      <category>Politics</category><media:content url="https://example.com/a.jpg" medium="image"/></item>
      <item><title>No link</title></item></channel></rss>`;
    const [e, ...rest] = parseFeed(xml);
    expect(rest).toEqual([]);
    expect(e).toMatchObject({ title: "Becerra & Hilton debate", summary: "The governor race…", categories: ["Politics"], image: "https://example.com/a.jpg" });
    expect(e.published?.toISOString()).toBe("2026-10-28T18:00:00.000Z");
  });

  it("reads Atom entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Prop 1 explainer</title>
      <link rel="alternate" href="https://example.com/p1"/><published>2026-10-27T10:00:00Z</published><summary>California housing bond</summary></entry></feed>`;
    expect(parseFeed(xml)).toMatchObject([{ title: "Prop 1 explainer", link: "https://example.com/p1", summary: "California housing bond" }]);
  });
});
