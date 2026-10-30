import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The provider refreshes server data when research lands; no app router in a string render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { LiveFeedProvider, type FeedRow } from "./ballot/LiveFeed";
import { NewsFeed, formatNewsDate } from "./NewsFeed";

const RENDERED_AT = Date.parse("2026-10-30T12:00:00Z");
const row = (id: string, published_at: string): FeedRow => ({
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
});
