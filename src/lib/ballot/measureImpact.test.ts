import { describe, expect, it } from "vitest";
import { IMPACT_QUESTIONS, impactAnswers, kindFromTitle } from "./measureImpact";

describe("measure impact questions", () => {
  it("asks the same six questions in the same order", () => {
    expect(IMPACT_QUESTIONS.map((q) => q.key)).toEqual(["taxes", "cost", "money", "affected", "currentLaw", "kind"]);
  });
  it("answers from the official analysis, says when it isn't addressed, and reads the type from the title", () => {
    const a = impactAnswers(
      { fiscalEffect: { text: "Higher reserves.", sources: ["x"] }, impact: { taxes: { text: "No change to taxes.", sources: ["x"] } } },
      "Increases State's Rainy Day Fund. Legislative Constitutional Amendment.",
      "Proposition 2",
    );
    expect(a.taxes).toMatchObject({ kind: "cited" });
    expect(a.cost).toMatchObject({ kind: "cited", item: { text: "Higher reserves." } });
    expect(a.money).toEqual({ kind: "missing", text: "Not addressed in the official analysis." });
    expect(a.kind).toMatchObject({ kind: "title", text: "A change to the state constitution, placed on the ballot by the Legislature." });
  });
  it("says 'being researched' when nothing has been researched yet (e.g. other states)", () => {
    const a = impactAnswers(undefined, "", "State Issue 1");
    expect(a.taxes.kind).toBe("missing");
    expect((a.taxes as { text: string }).text).toMatch(/Being researched/);
  });
  it("reads bonds and citizen initiatives from the title", () => {
    expect(kindFromTitle("Authorizes Bonds for Housing Affordability Programs. Legislative Statute.", "Proposition 1")).toBe(
      "A state law, placed on the ballot by the Legislature; it authorizes state borrowing through bonds.",
    );
    expect(kindFromTitle("Something. Initiative Constitutional Amendment and Statute.", "Proposition 9")).toMatch(/citizen petition/);
    expect(kindFromTitle("", "Amendment 2")).toBe("A change to the state constitution.");
    expect(kindFromTitle("Funding for parks", "Measure P")).toBeUndefined();
  });
});
