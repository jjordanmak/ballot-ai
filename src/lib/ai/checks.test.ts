import { describe, expect, it } from "vitest";
import { cleanText, neutralityProblem, quoteFound } from "./checks";

const DOC = `BACKGROUND. Under current law, the state charges a 6% tax on sales.
PROPOSAL. This measure raises the tax to 7.25% on purchases over $1,000 and sends the revenue to “local road repair.”`;

describe("quoteFound", () => {
  it("finds quotes despite case, spacing, curly quotes and dashes", () => {
    expect(quoteFound("under current law, the state charges a 6% tax on sales.", DOC)).toBe(true);
    expect(quoteFound('sends the revenue to "local road repair."', DOC)).toBe(true);
    expect(quoteFound("This   measure raises the tax\nto 7.25%", DOC)).toBe(true);
  });

  it("accepts an elided quote only when every part appears, in order", () => {
    expect(quoteFound("This measure raises the tax … sends the revenue to", DOC)).toBe(true);
    expect(quoteFound("sends the revenue to … This measure raises the tax", DOC)).toBe(false);
  });

  it("rejects invented or too-short quotes", () => {
    expect(quoteFound("This measure lowers the tax to 5%", DOC)).toBe(false);
    expect(quoteFound("6%", DOC)).toBe(false);
  });
});

describe("neutralityProblem", () => {
  it("passes plain factual text", () => {
    expect(neutralityProblem("Raises the sales tax to 7.25% on purchases over $1,000.")).toBeNull();
    expect(neutralityProblem("A YES vote means the state could borrow $10 billion.")).toBeNull();
    expect(neutralityProblem("Says they will expand bus service.")).toBeNull();
  });

  it("flags advice, rankings, predictions and judgments", () => {
    expect(neutralityProblem("Voters should support this.")).toBe("advice");
    expect(neutralityProblem("Vote yes on this measure.")).toBe("advice");
    expect(neutralityProblem("The leading candidate in the race.")).toBe("ranking");
    expect(neutralityProblem("The measure is likely to pass.")).toBe("prediction");
    expect(neutralityProblem("A controversial plan.")).toBe("judgment");
    expect(neutralityProblem("Critics say it costs too much.")).toBe("unnamed critics");
  });
});

describe("cleanText", () => {
  it("keeps <mark> only and caps length", () => {
    expect(cleanText('Raises <b>taxes</b> by <mark>$5</mark><script>x</script>.', 100)).toBe("Raises taxes by <mark>$5</mark>x.");
    expect(cleanText("a".repeat(500), 300)).toHaveLength(300);
  });
});
