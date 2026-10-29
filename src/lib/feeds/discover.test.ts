import { describe, expect, it } from "vitest";
import { advertisedFeeds } from "./discover";

const page = (links: string) => `<html><head>${links}</head><body></body></html>`;

describe("advertisedFeeds", () => {
  it("prefers the feed that shares the moved feed's section, then politics feeds", () => {
    const html = page(
      `<link rel="alternate" type="application/rss+xml" href="/feed/">` +
        `<link rel="alternate" type="application/rss+xml" href="/news/elections/feed/">` +
        `<link rel="alternate" type="application/atom+xml" href="https://www.example.com/politics/atom.xml">`,
    );
    expect(advertisedFeeds(html, "https://example.com/", "https://example.com/news/politics/feed/")).toEqual([
      "https://www.example.com/politics/atom.xml",
      "https://example.com/news/elections/feed/",
      "https://example.com/feed/",
    ]);
  });

  it("ignores other sites' feeds and non-feed links", () => {
    const html = page(
      `<link rel="alternate" type="application/rss+xml" href="https://partner.com/feed">` +
        `<link rel="stylesheet" href="/style.css"><link rel="alternate" hreflang="es" href="/es/">`,
    );
    expect(advertisedFeeds(html, "https://example.com/", "https://example.com/feed")).toEqual([]);
  });

  it("returns nothing for a page with no feed links", () => {
    expect(advertisedFeeds("<html><body>hi</body></html>", "https://example.com/", "https://example.com/feed")).toEqual([]);
  });
});
