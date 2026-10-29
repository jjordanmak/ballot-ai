import { describe, expect, it } from "vitest";
import { findLinks, htmlTitle, htmlToText } from "./text";

const PAGE = `<html><head><title>Prop 1 &amp; You</title><script>var x = 1;</script></head>
<body><nav><a href="/">Home</a></nav>
<main><h1>Proposition 1</h1><p>Authorizes &#36;10 billion in bonds.</p>
<a href="analysis.htm">Analysis by the Legislative Analyst</a>
<a href="https://other.example.com/analysis">Analysis elsewhere</a>
<a href="/propositions/1/arguments.htm">Arguments</a></main>
<footer>Copyright</footer></body></html>`;

describe("htmlToText", () => {
  it("keeps the main text and drops scripts, menus and footers", () => {
    const t = htmlToText(PAGE);
    expect(t).toContain("Authorizes $10 billion in bonds.");
    expect(t).not.toMatch(/var x|Copyright|Home/);
  });

  it("reads the title", () => {
    expect(htmlTitle(PAGE)).toBe("Prop 1 & You");
  });
});

describe("findLinks", () => {
  it("returns same-site links whose text matches", () => {
    expect(findLinks(PAGE, "https://voterguide.example.gov/propositions/1/", ["analysis by the legislative analyst", "analysis"])).toEqual([
      "https://voterguide.example.gov/propositions/1/analysis.htm",
    ]);
  });
});
