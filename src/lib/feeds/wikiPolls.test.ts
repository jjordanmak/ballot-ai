import { describe, expect, it } from "vitest";
import { approvedPollster, checkPoll, matchTable, parsePollDates, parsePollTables, plainWikitext } from "./wikiPolls";

// Synthetic page in Wikipedia's polling-table wikitext format (names and numbers are made up).
const PAGE = `
== Primary election ==
{| class="wikitable sortable"
! Poll source !! Date(s)<br />administered !! Sample<br />size !! Margin<br />of error !! Ann<br />Alpha (D) !! Bo<br />Beta (R) !! Cy<br />Gamma (D) !! Undecided
|-
| [https://example-pollster.test/june Example Polling] || May 1–3, 2026 || 800 (LV) || ± 3.5% || 30% || 25% || 20% || 25%
|}
== General election ==
=== Polling ===
{| class="wikitable sortable"
|- valign=bottom
! Poll source
! Date(s)<br />administered
! Sample<br />size{{efn|Key: LV = likely voters}}
! Margin<br />of error
! style="width:100px;"| Ann<br />Alpha (D)
! style="width:100px;"| Bo<br />Beta (R)
! Other
! Undecided
|-
| style="text-align:left;"|[https://example-pollster.test/oct Example Polling]
| September 28 – October 2, 2026
| 1,012 (LV)
| ± 3.1%
| {{party shading/Democratic}}|'''48%'''
| 41%
| 3%
| 8%
|-
| style="text-align:left;"|[[Some University]]<ref>{{cite web |url=https://poll.someu.test/release-17 |title=Poll}}</ref>
| October 10–14, 2026
| 600 (RV)
| ± 4.0%
| 45%
| 44%
| –
| 11%
|-
| style="text-align:left;"|[https://campaign-pollster.test/x Partisan Co. (R)]{{efn-ua|Poll sponsored by Beta's campaign}}
| October 5, 2026
| 500 (LV)
| ± 4.4%
| 40%
| 49%
| –
| 11%
|-
| style="text-align:left;"|[https://unknown.test/p Unknown Polls LLC]
| October 6–8, 2026
| 700 (LV)
| –
| 46%
| 42%
| –
| 12%
|}
`;

const NOW = new Date("2026-10-29T12:00:00Z");
const APPROVED = [{ name: "Example Polling" }, { name: "Some University", aliases: ["Some U"] }];

describe("Wikipedia poll tables", () => {
  const tables = parsePollTables(PAGE);
  const contest = { measure: false, candidates: [{ id: "a", names: ["Ann Alpha", "ANN ALPHA"] }, { id: "b", names: ["Bo Beta"] }] };

  it("parses rows, dates, sample, margin and percentages", () => {
    const general = tables[1];
    expect(general.rows[0]).toMatchObject({
      pollster: "Example Polling",
      releaseUrl: "https://example-pollster.test/oct",
      start: "2026-09-28",
      end: "2026-10-02",
      sample: 1012,
      population: "LV",
      moe: 3.1,
      other: 3,
      undecided: 8,
      values: [{ header: "Ann Alpha (D)", pct: 48 }, { header: "Bo Beta (R)", pct: 41 }],
    });
    expect(general.rows[1]).toMatchObject({ pollster: "Some University", releaseUrl: "https://poll.someu.test/release-17" });
  });

  it("uses only tables whose candidates are exactly this contest's", () => {
    expect(matchTable(tables[0], contest)).toBeNull(); // primary: a third candidate
    expect([...matchTable(tables[1], contest)!.values()]).toEqual(["a", "b"]);
    expect(matchTable(tables[1], { measure: false, candidates: [{ id: "x", names: ["Ann Alpha"] }, { id: "y", names: ["Di Delta"] }] })).toBeNull();
  });

  it("publishes approved, complete, recent polls and holds the rest with a reason", () => {
    const [ok1, ok2, sponsored, unknown] = tables[1].rows;
    expect(checkPoll(ok1, APPROVED, NOW)).toMatchObject({ ok: true });
    expect(checkPoll(ok2, APPROVED, NOW)).toMatchObject({ ok: true });
    expect(checkPoll(sponsored, APPROVED, NOW)).toEqual({ ok: false, reason: "sponsored or partisan" });
    expect(checkPoll(unknown, APPROVED, NOW)).toEqual({ ok: false, reason: "pollster not on the approved list" });
    expect(checkPoll(ok1, APPROVED, new Date("2027-01-15T00:00:00Z"))).toEqual({ ok: false, reason: "older than 60 days" });
  });

  it("matches measure polls as Yes / No", () => {
    const t = parsePollTables(`{|\n! Poll source !! Date(s) administered !! Sample size !! Margin of error !! Yes !! No !! Undecided\n|-\n| [https://x.test/p Example Polling] || October 1–4, 2026 || 900 (LV) || ± 3% || 52% || 38% || 10%\n|}`);
    expect(matchTable(t[0], { measure: true, candidates: [] })).toEqual(new Map([["Yes", "yes"], ["No", "no"]]));
  });

  it("handles date ranges, pollster aliases and wiki markup", () => {
    expect(parsePollDates("December 29, 2025 – January 3, 2026")).toEqual({});
    expect(parsePollDates("Dec 29 – Jan 3, 2026")).toEqual({ start: "2025-12-29", end: "2026-01-03" });
    expect(parsePollDates("October 5, 2026")).toEqual({ start: "2026-10-05", end: "2026-10-05" });
    expect(approvedPollster({ pollster: "Some U/Partner Media", notes: "" } as never, APPROVED)?.name).toBe("Some University");
    expect(plainWikitext("[[Emerson College|Emerson]]<ref name=a/> '''45%'''")).toBe("Emerson 45%");
  });
});
