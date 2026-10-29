import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import daly from "../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import type { ResolvedBallot } from "@/domain/ballot";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { toRaces } from "@/lib/ballot/toRaces";
import { MeasureCard } from "./MeasureCard";

describe("Daly City proposition cards", () => {
  const ballot = daly as unknown as ResolvedBallot;
  const { measures } = toRaces(ballot, getEnrichment("2026-11-03"));
  const props = measures.filter((m) => m.statewide);

  it("show one Sources block with the ballot data first, and a [1] marker even when one source backs the text", () => {
    expect(props.length).toBeGreaterThan(0);
    for (const m of props) {
      const html = renderToString(<MeasureCard contest={m.contest} enrichment={m.enrichment} docs={m.sourceDocs} />).replace(/<!-- -->/g, "");
      expect(html.match(/>Sources</g) ?? []).toHaveLength(1);
      if (Object.keys(m.sourceDocs).length === 1) expect(html).toMatch(/\[1\]/);
      expect(html).toContain("Ballot data:");
    }
  });
});
