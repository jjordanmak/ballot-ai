import { describe, expect, it } from "vitest";
import { STATE_NAMES } from "./match";
import { NEWS_SOURCES } from "./sources";

describe("news source list", () => {
  it("has unique keys and feed URLs", () => {
    expect(new Set(NEWS_SOURCES.map((s) => s.key)).size).toBe(NEWS_SOURCES.length);
    expect(new Set(NEWS_SOURCES.map((s) => s.url)).size).toBe(NEWS_SOURCES.length);
    for (const s of NEWS_SOURCES) expect(s.url).toMatch(/^https:\/\//);
  });

  it("gives every state and local outlet a known state, and local outlets their jurisdictions", () => {
    for (const s of NEWS_SOURCES) {
      expect(["national", "state", "local"]).toContain(s.scope);
      if (s.scope === "national") expect(s.state).toBeUndefined();
      else expect(STATE_NAMES[s.state ?? ""], s.key).toBeDefined();
      if (s.scope === "local") expect(s.jurisdictions?.length, s.key).toBeGreaterThan(0);
    }
  });

  it("covers every state and DC with at least one enabled statewide outlet", () => {
    const covered = new Set(NEWS_SOURCES.filter((s) => s.scope === "state" && s.enabled).map((s) => s.state));
    expect(Object.keys(STATE_NAMES).filter((st) => !covered.has(st))).toEqual([]);
  });
});
