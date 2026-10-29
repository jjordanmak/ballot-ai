import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The provider refreshes server data when research lands; no app router in a string render.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { LiveFeedProvider, type FeedRow } from "./LiveFeed";
import { LivePoll } from "./LivePoll";

const poll: FeedRow = {
  id: "p1",
  type: "poll",
  publisher: "Emerson College",
  title: "Emerson College poll: Governor",
  excerpt: null,
  url: "https://emersoncollegepolling.com/x#ballot-ai:gov:LV:2026-10-22",
  published_at: "2026-10-22T12:00:00.000Z",
  ingested_at: "2026-10-23T08:00:00.000Z",
  status: "published",
  contest_ids: ["gov"],
  candidate_ids: ["b", "h"],
  payload: {
    pollster: "Emerson College",
    start: "2026-10-20",
    end: "2026-10-22",
    sample: 1000,
    population: "LV",
    moe: 3,
    results: [
      { candidateId: "h", name: "Steve Hilton", pct: 39 },
      { candidateId: "b", name: "Xavier Becerra", pct: 52 },
    ],
    undecided: 9,
    releaseUrl: "https://emersoncollegepolling.com/x",
    wikipediaUrl: "https://en.wikipedia.org/wiki/2026_California_gubernatorial_election",
  },
};

const render = (rows: FeedRow[]) =>
  renderToString(
    <LiveFeedProvider electionId="e" state="CA" contestIds={["gov"]} initial={rows}>
      <LivePoll contestId="gov" candidates={[{ candidateId: "b", party: "Democratic" }, { candidateId: "h", party: "Republican" }]}>
        <p>researched fallback</p>
      </LivePoll>
    </LiveFeedProvider>,
  );

describe("LivePoll", () => {
  it("shows the newest poll, highest first, with pollster, dates, sample, margin and attribution", () => {
    const html = render([poll]);
    expect(html.indexOf("Xavier Becerra")).toBeLessThan(html.indexOf("Steve Hilton"));
    expect(html).toContain("Emerson College · Oct 20–22, 2026 · 1,000 LV · ±3%");
    expect(html).toContain("Poll list via Wikipedia");
    expect(html).toContain("Democrat");
    expect(html).not.toContain("researched fallback");
  });
  it("falls back to the researched poll when there is no live one", () => {
    expect(render([])).toContain("researched fallback");
  });
});
