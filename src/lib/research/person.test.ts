import { describe, expect, it } from "vitest";
import type { PersonFacts } from "@/lib/ai/schemas";
import { educationLine, positionLine } from "@/domain/profileFormat";
import { checkBio, factList, latestYear, mentions, screenFacts } from "./person";
import type { FetchedDoc } from "./verify";

const BIO =
  "Rep. Becerra earned a Juris Doctor degree from Stanford Law School and a Bachelor of Arts degree in economics from Stanford University. " +
  "He served as a deputy attorney general in the California Department of Justice, Office of the Attorney General from 1987 to 1990. " +
  "Prior to his election to Congress, Rep. Becerra served in the California State Assembly as representative for the 59th Assembly District in Los Angeles County from 1990 to 1992. " +
  "Rep. Becerra is the son of working-class parents and was the first in his family to graduate from college. Press release, January 2017.";

const doc = (id: string, text: string, tier: "official" | "ballotpedia" | "news" | "campaign" = "official", url = `https://example.gov/${id}`): FetchedDoc => ({
  id,
  sourceId: `uuid-${id}`,
  text,
  meta: { url, title: id, publisher: "Example", official: tier === "official", fetchedAt: "2026-10-29T00:00:00Z", tier },
});

const facts = (over: Partial<PersonFacts>): PersonFacts => ({ education: [], positions: [], platform: [], residence: null, leftOut: [], ...over });
const now = new Date("2026-10-29T00:00:00Z");
const opts = { local: false, judge: false, now };

describe("screenFacts", () => {
  it("keeps facts its quote states and writes them the same way whatever the model wrote", () => {
    const quote = "Rep. Becerra earned a Juris Doctor degree from Stanford Law School and a Bachelor of Arts degree in economics from Stanford University.";
    const s = screenFacts(
      facts({
        education: [
          { degree: "Juris Doctor", field: null, institution: "Stanford Law School", year: null, quote, sourceId: "D1" },
          { degree: "B.A.", field: "Economics", institution: "Stanford University", year: null, quote, sourceId: "D1" },
        ],
        positions: [
          { title: "Deputy Attorney General", organization: "California Department of Justice", district: null, startYear: 1987, endYear: "1990", type: "appointed", committees: [], quote: "He served as a deputy attorney general in the California Department of Justice, Office of the Attorney General from 1987 to 1990.", sourceId: "D1" },
        ],
      }),
      [doc("D1", BIO)],
      opts,
    );
    expect(s.rejected).toEqual([]);
    expect(s.education.map(educationLine)).toEqual(["J.D., Stanford Law School", "B.A., Economics, Stanford University"]);
    expect(s.positions.map(positionLine)).toEqual(["Deputy Attorney General, California Department of Justice · 1987–1990"]);
  });

  it("rejects a year or school the quote doesn't state", () => {
    const quote = "He served as a deputy attorney general in the California Department of Justice, Office of the Attorney General from 1987 to 1990.";
    const s = screenFacts(
      facts({
        education: [{ degree: "J.D.", field: null, institution: "Harvard Law School", year: null, quote, sourceId: "D1" }],
        positions: [{ title: "Deputy Attorney General", organization: null, district: null, startYear: 1987, endYear: "1992", type: "appointed", committees: [], quote, sourceId: "D1" }],
      }),
      [doc("D1", BIO)],
      opts,
    );
    expect(s.education).toEqual([]);
    expect(s.positions).toEqual([]);
    expect(s.rejected.map((r) => r.detail)).toEqual(["institution not in quote", "end year not in quote"]);
  });

  it("doesn't trust 'present' from an archived or long-outdated page", () => {
    const quote = "Prior to his election to Congress, Rep. Becerra served in the California State Assembly as representative for the 59th Assembly District in Los Angeles County from 1990 to 1992.";
    const s = screenFacts(
      facts({ positions: [{ title: "Member", organization: "California State Assembly", district: "59th Assembly District", startYear: 1990, endYear: "present", type: "elected", committees: [], quote, sourceId: "D1" }] }),
      [doc("D1", BIO, "official", "https://www.archive.gov.ca.gov/archive/gov39/2017/01/03/news19652/index.html")],
      opts,
    );
    expect(latestYear(BIO, now)).toBe(2017);
    expect(s.positions[0].endYear).toBeUndefined();
    // A live page that last mentions 2019 ("on the council since 2019") is still current.
    const live = "She has served on the Springfield City Council since 2019.";
    const kept = screenFacts(
      facts({ positions: [{ title: "Member", organization: "Springfield City Council", district: null, startYear: 2019, endYear: "present", type: "elected", committees: [], quote: live, sourceId: "D1" }] }),
      [doc("D1", live, "campaign", "https://annbee.example.org/about")],
      opts,
    );
    expect(kept.positions[0].endYear).toBe("present");
  });

  it("keeps the more trusted source when two disagree, and records it", () => {
    const official = "He was Mayor of Springfield, Ohio from 2015 to 2019.";
    const news = "He was Mayor of Springfield, Ohio from 2014 to 2019.";
    const s = screenFacts(
      facts({
        positions: [
          { title: "Mayor", organization: "Springfield, Ohio", district: null, startYear: 2014, endYear: "2019", type: "elected", committees: [], quote: news, sourceId: "D2" },
          { title: "Mayor", organization: "Springfield, Ohio", district: null, startYear: 2015, endYear: "2019", type: "elected", committees: [], quote: official, sourceId: "D1" },
        ],
      }),
      [doc("D1", official), doc("D2", news, "news")],
      opts,
    );
    expect(s.positions).toHaveLength(1);
    expect(s.positions[0].startYear).toBe(2015);
    expect(s.conflicts).toEqual([{ fact: "Mayor", kept: "Mayor, Springfield, Ohio · 2015–2019", dropped: "Mayor, Springfield, Ohio · 2014–2019" }]);
  });

  it("platform comes from the candidate's own words, never news; residence only for local races", () => {
    const text = "I will expand bus service. I live in Daly City.";
    const pl = { text: "Says they will expand bus service.", quote: "I will expand bus service.", sourceId: "D1" };
    const fromNews = screenFacts(facts({ platform: [pl] }), [doc("D1", text, "news")], opts);
    expect(fromNews.platform).toEqual([]);
    const own = screenFacts(facts({ platform: [pl], residence: { place: "Daly City", quote: "I live in Daly City.", sourceId: "D1" } }), [doc("D1", text, "campaign")], { ...opts, local: true });
    expect(own.platform).toHaveLength(1);
    expect(own.residence?.place).toBe("Daly City");
    expect(screenFacts(facts({ residence: { place: "Daly City", quote: "I live in Daly City.", sourceId: "D1" } }), [doc("D1", text)], opts).residence).toBeUndefined();
  });

  it("lists committee memberships under the office, and works outside California", () => {
    const quote = "Smith has represented Ohio's 41st House District since 2021 and serves on the Finance Committee and the Education Committee.";
    const s = screenFacts(
      facts({ positions: [{ title: "State Representative", organization: "Ohio House of Representatives", district: "41st House District", startYear: 2021, endYear: "present", type: "elected", committees: ["Finance Committee", "Education Committee", "Rules Committee"], quote, sourceId: "D1" }] }),
      [doc("D1", `${quote} Updated 2026.`)],
      opts,
    );
    expect(s.positions[0].committees).toEqual(["Finance Committee", "Education Committee"]);
    expect(positionLine(s.positions[0])).toBe("State Representative, Ohio House of Representatives (41st House District) · 2021–present");
  });
});

describe("checkBio", () => {
  const list = factList({
    positions: [{ title: "Deputy Attorney General", organization: "California Department of Justice", startYear: 1987, endYear: 1990, type: "appointed", quote: "q", source: "s" }],
    education: [{ degree: "Juris Doctor", institution: "Stanford Law School", quote: "q", source: "s" }],
    platform: [],
  });

  it("keeps sentences built from the cited facts", () => {
    const r = checkBio({ sentences: [{ text: "Becerra was a Deputy Attorney General at the California Department of Justice from 1987 to 1990.", facts: ["P0"] }, { text: "He earned a J.D. from Stanford Law School.", facts: ["E0"] }] }, list, "Xavier Becerra");
    expect(r.rejected).toEqual([]);
    expect(r.kept).toHaveLength(2);
  });

  it("drops invented numbers or names, family background and judgments", () => {
    const r = checkBio(
      {
        sentences: [
          { text: "He served for 12 years in Congress.", facts: ["P0"] },
          { text: "He earned a J.D. from Harvard.", facts: ["E0"] },
          { text: "He is the son of farmworkers and studied at Stanford Law School.", facts: ["E0"] },
          { text: "He struggled at the California Department of Justice.", facts: ["P0"] },
        ],
      },
      list,
      "Xavier Becerra",
    );
    expect(r.kept).toEqual([]);
    expect(r.rejected.map((x) => x.detail)).toEqual(["number 12 not in cited facts", '"Harvard" not in cited facts', "family background", "judgment"]);
  });
});

describe("mentions", () => {
  it("matches the significant words, in any order", () => {
    expect(mentions("from Stanford Law School and", "Stanford Law School")).toBe(true);
    expect(mentions("Office of the Attorney General", "Attorney General's Office")).toBe(true);
    expect(mentions("from Yale", "Stanford Law School")).toBe(false);
  });
});
