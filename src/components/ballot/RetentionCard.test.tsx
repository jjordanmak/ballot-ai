import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import daly from "../../../fixtures/ballots/2026-11-03/daly-city.normalized.json";
import type { ResolvedBallot } from "@/domain/ballot";
import { getEnrichment } from "@/lib/ballot/enrichment";
import { toRaces } from "@/lib/ballot/toRaces";
import { passesWith } from "./MeasureCard";
import { RetentionCard } from "./RetentionCard";

const html = (el: React.ReactElement) => renderToString(el).replace(/<!-- -->/g, "");

describe("RetentionCard", () => {
  const ballot = daly as unknown as ResolvedBallot;
  const { races } = toRaces(ballot, getEnrichment("2026-11-03"));
  const retention = races.filter((r) => r.retention);

  it("marks every single-judge retention contest", () => {
    expect(retention.length).toBe(ballot.contests.filter((c) => c.contestType === "retention").length);
  });

  it("shows the official question, the threshold, Yes/No and one Sources block", () => {
    const r = retention[0];
    const out = html(<RetentionCard race={r} />);
    const name = r.candidates[0].name;
    expect(out).toContain(r.formatExplainer.slice(0, 20));
    expect(out).toContain("Retained if more than half of the votes cast on it are Yes.");
    expect(out).toContain(`${name} serves a new term as`);
    expect(out).toContain(`${name} does not serve a new term as`);
    expect(out.match(/>Sources</g) ?? []).toHaveLength(1);
    expect(out).toContain("Ballot data:");
    // No comparison table or candidate profile.
    expect(out).not.toMatch(/Side-by-side|Candidate profiles/);
  });

  it("uses Illinois' 60% rule outside California", () => {
    const c = ballot.contests.find((x) => x.contestType === "retention")!;
    const il = { ...ballot, location: { ...ballot.location, state: "IL" }, contests: [c] } as ResolvedBallot;
    const [r] = toRaces(il, getEnrichment("2026-11-03")).races;
    expect(html(<RetentionCard race={r} />)).toContain("Retained if at least 60% of the votes cast on it are Yes.");
  });
});

describe("passesWith", () => {
  it("reads as a sentence", () => {
    expect(passesWith({ text: "More than half of the votes cast on this measure", verified: true })).toBe(
      "Passes with more than half of the votes cast on this measure.",
    );
    expect(passesWith({ text: "Two-thirds (66⅔%) of the votes cast on this measure", verified: true })).toBe(
      "Passes with two-thirds (66⅔%) of the votes cast on this measure.",
    );
    expect(passesWith({ text: "60% of the votes cast on this measure", verified: true })).toBe("Passes with 60% of the votes cast on this measure.");
    expect(passesWith({ text: "Not stated in the ballot data. Check your local election office.", verified: false })).toBe(
      "Vote needed: not stated in the ballot data. Check your local election office.",
    );
  });
});

