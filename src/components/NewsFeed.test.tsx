import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The provider refreshes server data when research lands; no app router in a string render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { LiveFeedProvider, type FeedRow } from "./ballot/LiveFeed";
import { NewsFeed, formatNewsDate } from "./NewsFeed";

const RENDERED_AT = Date.parse("2026-10-30T12:00:00Z");
const row = (id: string, published_at: string, more: Partial<FeedRow> = {}): FeedRow => ({
  id,
  type: "news",
  publisher: "Example News",
  title: `Story ${id}`,
  excerpt: null,
  url: `https://example.com/${id}`,
  published_at,
  ingested_at: published_at,
  status: "published",
  contest_ids: ["gov"],
  candidate_ids: [],
  ...more,
});
const text = (html: string) => html.replace(/<!-- -->/g, "");

describe("NewsFeed", () => {
  const tz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = tz;
  });

  it("starts with both scroll buttons disabled (nothing to scroll yet)", () => {
    const html = renderToString(<NewsFeed items={[]} />);
    const right = /<button[^>]*aria-label="Scroll feed right"[^>]*>/.exec(html)?.[0] ?? /<button[^>]*disabled[^>]*aria-label="Scroll feed right"/.exec(html)?.[0] ?? "";
    expect(html).toMatch(/disabled=""[^>]*aria-label="Scroll feed right"|aria-label="Scroll feed right"[^>]*disabled/);
    expect(right.length).toBeGreaterThan(0);
  });

  it("formats relative to the clock it's given, never its own", () => {
    const at = (min: number) => new Date(RENDERED_AT - min * 60_000).toISOString();
    expect(formatNewsDate(at(0), RENDERED_AT)).toBe("just now");
    expect(formatNewsDate(at(5), RENDERED_AT)).toBe("5 min ago");
    expect(formatNewsDate(at(11 * 60), RENDERED_AT)).toBe("11 hr ago");
    expect(formatNewsDate(at(3 * 24 * 60), RENDERED_AT)).toBe("3d ago");
    expect(formatNewsDate("2026-10-15T02:30:00Z", RENDERED_AT, "UTC")).toBe("Oct 15, 2026");
    expect(formatNewsDate("2026-10-15T02:30:00Z", RENDERED_AT, "America/New_York")).toBe("Oct 14, 2026");
    expect(formatNewsDate("2026-10-29T23:30:00Z", null, "UTC")).toBe("Oct 29, 2026");
  });

  // React #418: the server render and the browser's first render must print the same text.
  it("renders news dates from the server's render time in UTC, whatever the clock or time zone", () => {
    process.env.TZ = "America/New_York";
    const html = text(
      renderToString(
        <LiveFeedProvider electionId="e" state="CA" contestIds={["gov"]} initial={[row("recent", "2026-10-30T01:00:00Z"), row("old", "2026-10-15T02:30:00Z")]} renderedAt={RENDERED_AT}>
          <NewsFeed items={[]} feed={{ contestId: "gov" }} />
        </LiveFeedProvider>,
      ),
    );
    expect(html).toContain("11 hr ago");
    expect(html).toContain("Oct 15, 2026");
    expect(html).not.toContain("Oct 14, 2026");
  });

  it("prints the date (not a relative time) when there's no server clock to share", () => {
    const html = text(renderToString(<NewsFeed items={[{ id: "a", type: "news", source: "Example News", title: "A", date: "2026-10-29T23:30:00Z" }]} />));
    expect(html).toContain("Oct 29, 2026");
    expect(html).not.toMatch(/ago|just now/);
  });

  describe("tags", () => {
    // A non-CA ballot: Texas governor, names as printed on the ballot, in ballot order.
    const names = { "tx-c1": "Ana Ruiz", "tx-c2": "Ben Ortiz", "tx-c3": "Kelly Barnes", "tx-c4": "Ted Brown", "tx-c5": "Dana Cole" };
    const render = (rows: FeedRow[], feed: { contestId?: string; candidateId?: string } = { contestId: "tx-gov" }) =>
      text(
        renderToString(
          <LiveFeedProvider electionId="e" state="TX" contestIds={["tx-gov"]} initial={rows} renderedAt={RENDERED_AT} candidateNames={names}>
            <NewsFeed items={[]} feed={feed} />
          </LiveFeedProvider>,
        ),
      );
    const at = "2026-10-30T01:00:00Z";

    it("names the candidates from candidate_ids, as on the ballot and in ballot order", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], candidate_ids: ["tx-c2", "tx-c1"], title: "Debate night in Austin" })]);
      expect(html).toContain("Mentions: Ana Ruiz, Ben Ortiz.");
      expect(html.indexOf(">Ana Ruiz<")).toBeLessThan(html.indexOf(">Ben Ortiz<"));
    });

    it("shows 3 names, then +N, with every name for screen readers", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], candidate_ids: ["tx-c5", "tx-c4", "tx-c3", "tx-c2", "tx-c1"], title: "Forum" })]);
      expect(html).toContain("Mentions: Ana Ruiz, Ben Ortiz, Kelly Barnes, Ted Brown, Dana Cole.");
      expect(html).toContain(">Kelly Barnes<");
      expect(html).not.toContain(">Ted Brown<");
      expect(html).toMatch(/title="Ted Brown, Dana Cole"[^>]*>\+2</);
    });

    it("tags topics from the headline and excerpt", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], title: "Candidates clash over property taxes" })]);
      expect(html).toContain("Topics: Taxes.");
      expect(html).not.toContain("Mentions:");
    });

    it("puts mentions and topics on separate rows", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], candidate_ids: ["tx-c1"], title: "Ruiz on school funding" })]);
      expect(html).toMatch(/data-news-mentions[^]*Ana Ruiz[^]*<\/div><div[^>]*data-news-topics[^]*Education/);
    });

    it("drops mentions on a candidate's own carousel, keeps topics", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], candidate_ids: ["tx-c1"], title: "Ruiz on school funding" })], { candidateId: "tx-c1" });
      expect(html).not.toContain("Mentions:");
      expect(html).toContain("Topics: Education.");
    });

    it("shows mentions on a measure's carousel", () => {
      const html = text(
        renderToString(
          <LiveFeedProvider electionId="e" state="TX" contestIds={["tx-prop-1"]} initial={[row("m", at, { contest_ids: ["tx-prop-1"], candidate_ids: ["tx-c2"], title: "Ortiz campaigns against Proposition 1 water plan" })]} renderedAt={RENDERED_AT} candidateNames={names}>
            <NewsFeed items={[]} feed={{ contestId: "tx-prop-1" }} hideWhenEmpty />
          </LiveFeedProvider>,
        ),
      );
      expect(html).toContain("Mentions: Ben Ortiz.");
    });

    it("tags topics on every card, live or not", () => {
      const html = text(renderToString(<NewsFeed items={[{ id: "s", type: "news", source: "Example News", title: "Clinic closures leave rural Ohio without hospitals", date: "2026-10-29" }]} />));
      expect(html).toContain("Topics: Health care.");
      expect(html).not.toContain("Mentions:");
    });

    it("renders no tag row when there's nothing to say, and never a contest tag", () => {
      const html = render([row("a", at, { contest_ids: ["tx-gov"], candidate_ids: ["not-on-this-ballot"], title: "Early voting opens" })]);
      expect(html).not.toContain("data-news-tags");
    });
  });
});
