import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { focusText } from "./fetch";

describe("focusText", () => {
  it("returns short text unchanged", () => {
    expect(focusText("short", ["x"], 100)).toBe("short");
  });

  it("keeps the passages about the target in a long document", () => {
    const filler = "Unrelated county business. ".repeat(2000);
    const text = `${filler}MEASURE Z: This measure raises the hotel tax.${filler}Measure Y is about parks.${filler}`;
    const out = focusText(text, ["Measure Z"], 20_000);
    expect(out.length).toBeLessThanOrEqual(20_000);
    expect(out).toContain("This measure raises the hotel tax.");
    expect(out).not.toContain("Measure Y is about parks.");
  });

  it("falls back to the start when the terms aren't there", () => {
    const text = "a".repeat(5000);
    expect(focusText(text, ["Measure Z"], 100)).toBe("a".repeat(100));
  });
});
