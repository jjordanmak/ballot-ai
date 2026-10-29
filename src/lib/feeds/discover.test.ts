import { describe, expect, it } from "vitest";
import { advertisedFeeds, siteOf } from "./discover";

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

  it("accepts the outlet's own feed subdomain (rss.wbur.org, ww2.kqed.org)", () => {
    const html = page(`<link rel="alternate" type="application/rss+xml" title="RSS" href="https://rss.wbur.org/news/rss"/>`);
    expect(advertisedFeeds(html, "https://www.wbur.org/news", "https://www.wbur.org/news")).toEqual(["https://rss.wbur.org/news/rss"]);
    expect(siteOf("ww2.kqed.org")).toBe(siteOf("www.kqed.org"));
    expect(siteOf("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(siteOf("evil-wbur.org")).not.toBe(siteOf("www.wbur.org"));
  });

  it("returns nothing for a page with no feed links", () => {
    expect(advertisedFeeds("<html><body>hi</body></html>", "https://example.com/", "https://example.com/feed")).toEqual([]);
  });
});
