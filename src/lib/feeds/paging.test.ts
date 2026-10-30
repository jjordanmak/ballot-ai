import { describe, expect, it } from "vitest";
import { initialPages, nextPage, pageFor, targetKey } from "./paging";

const row = (id: string, at: string, contests: string[], type = "news") => ({ id, type, published_at: at, contest_ids: contests });

describe("news paging", () => {
  it("starts each race at its own oldest loaded story, ignoring polls and other races", () => {
    const rows = [
      row("a", "2026-10-29T10:00:00Z", ["gov"]),
      row("b", "2026-10-28T10:00:00Z", ["gov", "ag"]),
      row("p", "2026-10-01T10:00:00Z", ["gov"], "poll"),
      row("c", "2026-10-20T10:00:00Z", ["ag"]),
    ];
    const pages = initialPages(rows, ["gov", "ag", "empty"], 2);
    expect(pages.get(targetKey({ contestId: "gov" }))).toEqual({ cursor: { at: "2026-10-28T10:00:00Z", id: "b" }, done: false });
    expect(pages.get(targetKey({ contestId: "ag" }))).toEqual({ cursor: { at: "2026-10-20T10:00:00Z", id: "c" }, done: false });
    // A race whose first load came back short has nothing older.
    expect(pages.get(targetKey({ contestId: "empty" }))).toMatchObject({ done: true });
  });

  it("moves the cursor to the oldest story a page returned, and stops on a short page", () => {
    const page = [row("x", "2026-09-02T00:00:00Z", ["gov"]), row("y", "2026-09-01T00:00:00Z", ["gov"]), row("z", "2026-09-01T00:00:00Z", ["gov"])];
    // Same time: the lower id is older, as in feed_page's (published_at, id) order.
    expect(nextPage(page, 3)).toEqual({ cursor: { at: "2026-09-01T00:00:00Z", id: "y" }, done: false });
    expect(nextPage(page, 25).done).toBe(true);
    expect(nextPage([], 25)).toEqual({ cursor: null, done: true });
  });

  it("keeps races and candidates apart", () => {
    expect(targetKey({ contestId: "gov" })).not.toBe(targetKey({ candidateId: "gov" }));
  });

  it("treats a candidate as complete once their race is, without asking again", () => {
    const pages = initialPages([row("a", "2026-10-29T10:00:00Z", ["gov"])], ["gov", "busy"], 1);
    pages.set(targetKey({ contestId: "busy" }), { cursor: { at: "2026-10-01T00:00:00Z", id: "z" }, done: false });
    // "gov" came back short, so it's done; "busy" still has older stories.
    expect(pageFor(new Map([[targetKey({ contestId: "gov" }), { cursor: null, done: true }]]), { candidateId: "becerra", contestId: "gov" })).toEqual({ cursor: null, done: true });
    expect(pageFor(pages, { candidateId: "kim", contestId: "busy" })).toBeUndefined();
    // A candidate's own pages win once it has some.
    pages.set(targetKey({ candidateId: "kim" }), { cursor: null, done: true });
    expect(pageFor(pages, { candidateId: "kim", contestId: "busy" })).toEqual({ cursor: null, done: true });
  });
});
