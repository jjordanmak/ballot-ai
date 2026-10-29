import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SourceRef } from "@/domain/ballot";
import type { SourceDoc } from "@/domain/enrichment";
import { Cite, SourceList } from "./Citations";

const renderToText = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, "");

const doc = (title: string): SourceDoc => ({ title, publisher: "California Secretary of State", url: `https://sos.example/${title}`, official: true, accessed: "2026-10-28" });
const one = { a: doc("Proposition 50") };
const two = { a: doc("Proposition 50"), b: { ...doc("Analysis"), publisher: "Legislative Analyst", official: false } };
const provenance: SourceRef[] = [
  { provider: "google-civic", name: "Voting Information Project", official: true, retrievedAt: "2026-10-29T12:00:00.000Z" },
  { provider: "google-civic", name: "Google Civic Information API", official: false, retrievedAt: "2026-10-29T12:00:00.000Z" },
];

describe("citations", () => {
  it("marks every cited item, even with a single source, and numbers the list to match", () => {
    expect(renderToText(<Cite ids={["a"]} docs={one} />)).toContain("[1]");
    const html = renderToText(<SourceList docs={one} />);
    expect(html).toContain("[1]");
    expect(html).toContain("Proposition 50");
  });
  it("opens a card with the exact supporting sentence, the source and a link (never inline)", () => {
    const html = renderToText(<Cite ids={["b"]} docs={two} quotes={["The measure raises the tax to 7.25%."]} />);
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("“The measure raises the tax to 7.25%.”");
    expect(html).toContain("Legislative Analyst: Analysis");
    expect(html).toContain('href="https://sos.example/Analysis"');
    expect(html).toMatch(/<button[^>]*aria-describedby/);
  });
  it("numbers markers and the list when there are several sources", () => {
    expect(renderToText(<Cite ids={["b"]} docs={two} />)).toContain("[2]");
    const html = renderToText(<SourceList docs={two} />);
    expect(html).toContain("[1]");
    expect(html).toContain("[2]");
  });
  it("puts the ballot data line first inside the single Sources block", () => {
    const html = renderToText(<SourceList docs={one} provenance={provenance} />);
    expect(html.match(/Sources</g)).toHaveLength(1);
    expect(html.indexOf("Voting Information Project")).toBeLessThan(html.indexOf("Proposition 50"));
    expect(html).toContain("via");
    expect(renderToText(<SourceList docs={{}} provenance={provenance} />)).toContain("Voting Information Project");
  });
});
