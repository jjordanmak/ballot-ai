import { describe, expect, it } from "vitest";
import { process, sanitize } from "./Highlight";

describe("Highlight sanitizer", () => {
  it("can't be turned into markup by an unclosed tag plus an inserted <mark>", () => {
    const out = process("<img src=x onerror=alert(1) 50%", false, "neutral");
    expect(out).not.toMatch(/<img/i);
    expect(out).toContain("&lt;img");
    expect(out).toContain("<mark>50%</mark>");
  });
  it("keeps only allowlisted tags and escapes the rest", () => {
    expect(sanitize('<mark>yes</mark> <script>x</script> <b onclick="y">b</b> a < b & c')).toBe("<mark>yes</mark> x b a &lt; b &amp; c");
  });
});

describe("neutral auto-highlight", () => {
  it("marks amounts, thresholds and dates, not topical phrases or superlatives", () => {
    const out = process("A $10 billion bond needs two-thirds by Nov. 3, 2026; the frontrunner Republican candidate backs school choice.", false, "neutral");
    expect(out).toContain("<mark>$10 billion</mark>");
    expect(out).toContain("<mark>two-thirds</mark>");
    expect(out).toContain("<mark>Nov. 3, 2026</mark>");
    expect(out).not.toContain("<mark>school choice</mark>");
    expect(out).not.toMatch(/<mark>frontrunner/);
  });
  it("leaves the archive set unchanged", () => {
    expect(process("supports school choice", false, "archive")).toContain("<mark>school choice</mark>");
  });
});
